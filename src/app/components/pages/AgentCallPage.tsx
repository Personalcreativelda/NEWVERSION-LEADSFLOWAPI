/**
 * AgentCallPage - Popup page for AI-powered voice calls via wavoip-api
 *
 * Flow:
 * 1. Load agent config from backend (auth via localStorage token)
 * 2. Intercept getUserMedia to inject virtual mic
 * 3. Load wavoip-api dynamically
 * 4. Connect, call the phone number
 * 5. On audio_transport:create -> play greeting TTS via virtual mic
 * 6. Collect audio_buffer chunks from callee -> VAD -> STT -> AI -> TTS -> repeat
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Loader2, MessageSquare } from 'lucide-react';
import { Button } from '../ui/button';

// --- Types -------------------------------------------------------------------

type CallState = 'loading' | 'connecting' | 'ringing' | 'active' | 'ended' | 'error';
type ConvState = 'idle' | 'greeting' | 'listening' | 'processing' | 'speaking';

interface AgentConfig {
  agent_id: string;
  name: string;
  wavoip_token: string;
  voice_provider: string;
  voice_config: Record<string, unknown>;
  greeting_message: string;
  instructions: string;
  language: string;
  elevenlabs_configured: boolean;
  openai_configured: boolean;
  preferred_ai_model: string;
}

interface TranscriptEntry {
  role: 'agent' | 'user';
  text: string;
}

// --- Constants ---------------------------------------------------------------

const SILENCE_THRESHOLD_RMS = 400;   // Int16 RMS below this = silence
const SILENCE_DURATION_MS   = 1800;  // silence duration before processing
const MIN_SPEECH_BYTES       = 3200; // ignore segments shorter than ~200ms @ 8kHz
const API_BASE               = '/api';

// --- WAV builder -------------------------------------------------------------

function buildWav(pcmBytes: Uint8Array, sampleRate: number): Uint8Array {
  const numChannels  = 1;
  const bitsPerSample = 16;
  const byteRate  = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize  = pcmBytes.byteLength;
  const buf  = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const str  = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1,  true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate,   true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  str(36, 'data');
  view.setUint32(40, dataSize, true);
  new Uint8Array(buf).set(pcmBytes, 44);
  return new Uint8Array(buf);
}

function rms(data: Uint8Array): number {
  const int16 = new Int16Array(data.buffer, data.byteOffset, Math.floor(data.byteLength / 2));
  let sum = 0;
  for (let i = 0; i < int16.length; i++) sum += int16[i] * int16[i];
  return Math.sqrt(sum / (int16.length || 1));
}

function uint8ToBase64(arr: Uint8Array): string {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < arr.length; i += chunkSize) {
    binary += String.fromCharCode(...arr.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// --- Component ---------------------------------------------------------------

export default function AgentCallPage() {
  const params  = new URLSearchParams(window.location.search);
  const agentId = params.get('agentId') || '';
  const phone   = params.get('phone')   || '';

  const [callState, setCallState] = useState<CallState>('loading');
  const [convState, setConvState] = useState<ConvState>('idle');
  const [statusMsg, setStatusMsg] = useState('Carregando...');
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [muted, setMuted] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const authTokenRef       = useRef<string>('');
  const agentConfigRef     = useRef<AgentConfig | null>(null);
  const audioCtxRef        = useRef<AudioContext | null>(null);
  const virtualMicDestRef  = useRef<MediaStreamAudioDestinationNode | null>(null);
  const gainNodeRef        = useRef<GainNode | null>(null);
  const instanceRef        = useRef<unknown>(null);
  const sampleRateRef      = useRef<number>(8000);
  const audioChunksRef     = useRef<Uint8Array[]>([]);
  const silenceTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const convStateRef       = useRef<ConvState>('idle');
  const historyRef         = useRef<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const cleanedUpRef       = useRef(false);

  useEffect(() => { convStateRef.current = convState; }, [convState]);

  // --- API helpers -----------------------------------------------------------

  const apiGet = useCallback(async (path: string) => {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Authorization': `Bearer ${authTokenRef.current}` },
    });
    if (!res.ok) throw new Error(`API ${path} -> ${res.status}`);
    return res.json();
  }, []);

  const apiPost = useCallback(async (path: string, body: unknown) => {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authTokenRef.current}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `API ${path} -> ${res.status}`);
    }
    return res.json();
  }, []);

  // --- TTS via ElevenLabs (through backend) ----------------------------------

  const playTTS = useCallback(async (text: string): Promise<void> => {
    if (!audioCtxRef.current || !virtualMicDestRef.current) return;
    const config = agentConfigRef.current!;

    try {
      const data = await apiPost(`/voice-agents/${config.agent_id}/tts`, { text });
      const binary = atob(data.audio_base64);
      const bytes  = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      if (audioCtxRef.current.state === 'suspended') {
        await audioCtxRef.current.resume();
      }

      const decoded = await audioCtxRef.current.decodeAudioData(bytes.buffer);
      const source  = audioCtxRef.current.createBufferSource();
      source.buffer = decoded;
      source.connect(gainNodeRef.current ?? virtualMicDestRef.current);

      return new Promise<void>((resolve) => {
        source.onended = () => resolve();
        source.start();
      });
    } catch (err) {
      console.error('[AgentCall] TTS failed, falling back to browser TTS:', err);
      return new Promise<void>((resolve) => {
        const utt = new SpeechSynthesisUtterance(text);
        utt.lang  = config.language || 'pt-BR';
        utt.onend = () => resolve();
        speechSynthesis.speak(utt);
      });
    }
  }, [apiPost]);

  // --- STT via OpenAI Whisper ------------------------------------------------

  const transcribeAudio = useCallback(async (pcmBytes: Uint8Array): Promise<string> => {
    if (pcmBytes.byteLength < MIN_SPEECH_BYTES) return '';
    const config = agentConfigRef.current!;
    try {
      const wavBytes    = buildWav(pcmBytes, sampleRateRef.current);
      const audio_base64 = uint8ToBase64(wavBytes);
      const data = await apiPost(`/voice-agents/${config.agent_id}/stt`, {
        audio_base64,
        sample_rate: sampleRateRef.current,
      });
      return (data.text || '').trim();
    } catch (err) {
      console.error('[AgentCall] STT failed:', err);
      return '';
    }
  }, [apiPost]);

  // --- AI response -----------------------------------------------------------

  const getAIResponse = useCallback(async (userText: string): Promise<string> => {
    const config = agentConfigRef.current!;
    historyRef.current.push({ role: 'user', content: userText });
    try {
      const data = await apiPost(`/voice-agents/${config.agent_id}/ai-respond`, {
        history: historyRef.current,
      });
      const text = (data.text || '').trim();
      if (text) historyRef.current.push({ role: 'assistant', content: text });
      return text;
    } catch (err) {
      console.error('[AgentCall] AI respond failed:', err);
      return 'Desculpe, houve um erro. Pode repetir?';
    }
  }, [apiPost]);

  // --- Transcript helper -----------------------------------------------------

  const addTranscript = useCallback((role: 'agent' | 'user', text: string) => {
    setTranscript(prev => [...prev, { role, text }]);
  }, []);

  // --- VAD + STT loop --------------------------------------------------------

  const processAccumulatedAudio = useCallback(async () => {
    if (convStateRef.current !== 'listening') return;

    const chunks = audioChunksRef.current.splice(0);
    if (!chunks.length) return;

    const totalBytes = chunks.reduce((s, c) => s + c.byteLength, 0);
    const merged = new Uint8Array(totalBytes);
    let off = 0;
    for (const c of chunks) { merged.set(c, off); off += c.byteLength; }

    setConvState('processing');
    setStatusMsg('Transcrevendo...');

    const userText = await transcribeAudio(merged);
    if (!userText) {
      setConvState('listening');
      setStatusMsg('Ouvindo...');
      return;
    }

    addTranscript('user', userText);
    setStatusMsg('Gerando resposta...');

    const aiText = await getAIResponse(userText);
    if (!aiText) {
      setConvState('listening');
      setStatusMsg('Ouvindo...');
      return;
    }

    addTranscript('agent', aiText);
    setConvState('speaking');
    setStatusMsg('Falando...');

    await playTTS(aiText);

    if (!cleanedUpRef.current) {
      setConvState('listening');
      setStatusMsg('Ouvindo...');
    }
  }, [transcribeAudio, getAIResponse, playTTS, addTranscript]);

  const handleIncomingAudio = useCallback((data: ArrayBuffer | Uint8Array) => {
    if (convStateRef.current !== 'listening') return;
    const chunk = data instanceof Uint8Array ? data : new Uint8Array(data);
    audioChunksRef.current.push(chunk);

    if (rms(chunk) > SILENCE_THRESHOLD_RMS) {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(processAccumulatedAudio, SILENCE_DURATION_MS);
    }
  }, [processAccumulatedAudio]);

  // --- Call lifecycle --------------------------------------------------------

  const endCall = useCallback(() => {
    cleanedUpRef.current = true;
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    try { (instanceRef.current as any)?.endCall?.(); } catch (_) {}
    try { audioCtxRef.current?.close(); } catch (_) {}
    setCallState('ended');
    setConvState('idle');
    setStatusMsg('Chamada encerrada');
  }, []);

  const onCallAnswered = useCallback(async (data: unknown) => {
    const eventData = data as Record<string, unknown> | null;
    sampleRateRef.current = (eventData?.sampleRate as number) || (eventData?.sample_rate as number) || 8000;
    setCallState('active');

    const config   = agentConfigRef.current!;
    const greeting = config.greeting_message
      || `Ola! Sou o assistente ${config.name}. Como posso ajudar?`;

    setConvState('greeting');
    setStatusMsg('Iniciando...');
    addTranscript('agent', greeting);
    historyRef.current.push({ role: 'assistant', content: greeting });

    await new Promise(r => setTimeout(r, 1200));
    if (cleanedUpRef.current) return;

    await playTTS(greeting);

    if (!cleanedUpRef.current) {
      audioChunksRef.current = [];
      setConvState('listening');
      setStatusMsg('Ouvindo...');
    }
  }, [playTTS, addTranscript]);

  // --- Setup virtual mic (must happen before loading wavoip-api) -------------

  const setupVirtualMic = useCallback(() => {
    const audioCtx = new AudioContext();
    const dest     = audioCtx.createMediaStreamDestination();
    const gain     = audioCtx.createGain();
    gain.gain.value = 1.0;
    gain.connect(dest);

    audioCtxRef.current       = audioCtx;
    virtualMicDestRef.current = dest;
    gainNodeRef.current       = gain;

    const origGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
      if (constraints?.audio) {
        console.log('[AgentCall] getUserMedia intercepted -> returning virtual mic stream');
        return dest.stream;
      }
      return origGUM(constraints!);
    };
  }, []);

  // --- Load wavoip-api script ------------------------------------------------

  const loadWavoipScript = useCallback((): Promise<void> =>
    new Promise((resolve, reject) => {
      if ((window as any).Wavoip) { resolve(); return; }
      const script   = document.createElement('script');
      script.src     = '/wavoip-api.js';
      script.onload  = () => resolve();
      script.onerror = () => reject(new Error('Falha ao carregar wavoip-api.js'));
      document.head.appendChild(script);
    }),
  []);

  // --- Connect to wavoip and start call --------------------------------------

  const connectAndCall = useCallback((token: string, phoneNum: string) => {
    const WavoipClass = (window as any).Wavoip;
    if (!WavoipClass) {
      setCallState('error');
      setErrorMsg('wavoip-api nao disponivel');
      return;
    }

    const WAV      = new WavoipClass();
    const instance = WAV.connect(token);
    instanceRef.current = instance;

    instance.socket.on('connect', () => {
      setCallState('ringing');
      setStatusMsg(`Chamando ${phoneNum}...`);
      instance.callStart({ whatsappid: phoneNum.replace(/^\+/, '') });
    });

    instance.socket.on('audio_transport:create', (data: unknown) => {
      onCallAnswered(data);
    });

    instance.socket.on('audio_buffer', (data: ArrayBuffer | Uint8Array) => {
      handleIncomingAudio(data);
    });

    instance.socket.on('audio_transport:terminate', () => endCall());
    instance.socket.on('calls:end', () => endCall());

    instance.socket.on('connect_error', (err: Error) => {
      setCallState('error');
      setErrorMsg(`Erro de conexao: ${err.message}`);
    });

    instance.socket.on('disconnect', (reason: string) => {
      if (!cleanedUpRef.current) {
        setCallState('error');
        setErrorMsg(`Desconectado: ${reason}`);
      }
    });
  }, [onCallAnswered, handleIncomingAudio, endCall]);

  // --- Main init -------------------------------------------------------------

  useEffect(() => {
    if (!agentId || !phone) {
      setCallState('error');
      setErrorMsg('Parametros agentId e phone sao obrigatorios');
      return;
    }

    const token = localStorage.getItem('leadflow_access_token') || '';
    authTokenRef.current = token;

    if (!token) {
      setCallState('error');
      setErrorMsg('Sessao expirada. Faca login novamente.');
      return;
    }

    (async () => {
      try {
        setStatusMsg('Carregando configuracao...');
        const config: AgentConfig = await apiGet(`/voice-agents/${agentId}/call-config`);
        agentConfigRef.current = config;

        if (!config.wavoip_token) {
          setCallState('error');
          setErrorMsg('Token Wavoip nao configurado neste agente.');
          return;
        }

        setStatusMsg('Preparando audio...');
        setupVirtualMic();

        setStatusMsg('Conectando...');
        await loadWavoipScript();

        setCallState('connecting');
        connectAndCall(config.wavoip_token, phone);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erro ao inicializar chamada';
        console.error('[AgentCall] Init error:', err);
        setCallState('error');
        setErrorMsg(msg);
      }
    })();

    return () => {
      cleanedUpRef.current = true;
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      try { audioCtxRef.current?.close(); } catch (_) {}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Toggle mute -----------------------------------------------------------

  const handleToggleMute = () => {
    if (!gainNodeRef.current) return;
    const next = !muted;
    gainNodeRef.current.gain.value = next ? 0 : 1;
    setMuted(next);
  };

  // --- UI labels -------------------------------------------------------------

  const convLabel: Record<ConvState, string> = {
    idle:       '',
    greeting:   'Saudacao inicial',
    listening:  'Ouvindo...',
    processing: 'Processando...',
    speaking:   'Falando...',
  };

  const stateColor: Record<CallState, string> = {
    loading:    'text-gray-400',
    connecting: 'text-yellow-400',
    ringing:    'text-yellow-300',
    active:     'text-green-400',
    ended:      'text-gray-400',
    error:      'text-red-400',
  };

  // --- Render ----------------------------------------------------------------

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center gap-3">
        <Phone className="w-5 h-5 text-green-400 shrink-0" />
        <div className="min-w-0">
          <div className="font-semibold text-sm truncate">
            {agentConfigRef.current?.name || 'Agente de Voz'}
          </div>
          <div className="text-xs text-gray-400 truncate">{phone}</div>
        </div>
        <div className={`ml-auto text-xs font-medium shrink-0 ${stateColor[callState]}`}>
          {callState === 'active' && convLabel[convState] ? convLabel[convState] : statusMsg}
        </div>
      </div>

      {/* Loading / Connecting */}
      {(callState === 'loading' || callState === 'connecting') && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <Loader2 className="w-12 h-12 animate-spin text-blue-400 mx-auto" />
            <p className="text-gray-300">{statusMsg}</p>
          </div>
        </div>
      )}

      {/* Error */}
      {callState === 'error' && (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-red-900/30 flex items-center justify-center mx-auto">
              <PhoneOff className="w-8 h-8 text-red-400" />
            </div>
            <p className="text-red-400 font-medium">Erro</p>
            <p className="text-gray-400 text-sm max-w-xs">{errorMsg}</p>
            <Button
              variant="outline"
              size="sm"
              className="border-gray-600 text-gray-300 hover:bg-gray-700"
              onClick={() => window.close()}
            >
              Fechar
            </Button>
          </div>
        </div>
      )}

      {/* Ended */}
      {callState === 'ended' && (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center mx-auto">
              <PhoneOff className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-300 font-medium">Chamada encerrada</p>
            <Button
              variant="outline"
              size="sm"
              className="border-gray-600 text-gray-300 hover:bg-gray-700"
              onClick={() => window.close()}
            >
              Fechar
            </Button>
          </div>
        </div>
      )}

      {/* Ringing / Active */}
      {(callState === 'ringing' || callState === 'active') && (
        <>
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Status orb */}
            <div className="flex flex-col items-center py-6 space-y-2">
              {callState === 'ringing' && (
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-green-900/30 flex items-center justify-center animate-pulse">
                    <Phone className="w-9 h-9 text-green-400" />
                  </div>
                  <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-green-500" />
                  </span>
                </div>
              )}

              {callState === 'active' && (
                <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-colors ${
                  convState === 'listening'  ? 'bg-blue-900/40' :
                  convState === 'speaking' || convState === 'greeting' ? 'bg-green-900/40 animate-pulse' :
                  'bg-gray-800'
                }`}>
                  {convState === 'speaking' || convState === 'greeting' ? (
                    <Mic className="w-8 h-8 text-green-400" />
                  ) : convState === 'listening' ? (
                    <Mic className="w-8 h-8 text-blue-400 animate-pulse" />
                  ) : (
                    <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                  )}
                </div>
              )}

              <p className="text-xs text-gray-400">
                {callState === 'ringing' ? `Chamando ${phone}...` : convLabel[convState]}
              </p>
            </div>

            {/* Transcript */}
            <div className="flex-1 overflow-y-auto px-3 pb-2 space-y-2">
              {transcript.length === 0 && callState === 'active' && (
                <div className="text-center text-gray-500 text-xs py-6">
                  <MessageSquare className="w-4 h-4 mx-auto mb-1 opacity-40" />
                  Transcricao aparecera aqui
                </div>
              )}
              {transcript.map((entry, i) => (
                <div
                  key={i}
                  className={`flex ${entry.role === 'agent' ? 'justify-start' : 'justify-end'}`}
                >
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                    entry.role === 'agent'
                      ? 'bg-gray-700 text-gray-100 rounded-tl-sm'
                      : 'bg-blue-600 text-white rounded-tr-sm'
                  }`}>
                    <div className="text-xs font-medium mb-0.5 opacity-60">
                      {entry.role === 'agent'
                        ? (agentConfigRef.current?.name || 'Agente')
                        : 'Usuario'}
                    </div>
                    {entry.text}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Controls */}
          <div className="border-t border-gray-700 bg-gray-800 px-4 py-3 flex items-center justify-center gap-4">
            <Button
              variant="outline"
              size="icon"
              className={`rounded-full w-12 h-12 border-2 ${
                muted
                  ? 'border-red-500 bg-red-900/20 text-red-400 hover:bg-red-900/30'
                  : 'border-gray-600 text-gray-300 hover:bg-gray-700'
              }`}
              onClick={handleToggleMute}
              title={muted ? 'Ativar microfone' : 'Silenciar'}
            >
              {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </Button>

            <Button
              className="rounded-full w-14 h-14 bg-red-600 hover:bg-red-700 text-white"
              size="icon"
              onClick={endCall}
              title="Encerrar chamada"
            >
              <PhoneOff className="w-6 h-6" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
