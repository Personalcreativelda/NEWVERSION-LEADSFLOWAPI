// Uma chamada do WhatsApp Business atendida por um agente ElevenLabs.
//
//  WhatsApp ──WebRTC (Opus 48 kHz, DTLS-SRTP)──► ponte ──WebSocket (PCM/μ-law, base64)──► ElevenLabs
//           ◄───────────────────────────────────        ◄──────────────────────────────────
//
// Chamada recebida: answer(oferta) devolve o SDP de resposta (a API faz pre_accept/accept na Meta);
// start() só depois do accept: liga o agente. Chamada feita pela empresa: offer() devolve a oferta
// (a API envia-a à Meta em "connect") e applyAnswer() recebe a resposta do WhatsApp quando o
// cliente atende; depois start(). end() fecha tudo uma vez.
import { MediaStreamTrack, RTCPeerConnection, RtpHeader, RtpPacket, useOPUS } from 'werift';
import WebSocket from 'ws';
import {
  FRAME_MS, FRAME_SAMPLES, OpusCodec, agentAudioToWebrtc, webrtcToAgentAudio,
} from './audio.js';

const INPUT_CHUNK_SAMPLES = 4800;     // 100 ms a 48 kHz por mensagem enviada ao agente
const MAX_INPUT_BACKLOG = 48000;      // antes de o agente estar pronto guarda no máximo 1 s
const ICE_GATHER_TIMEOUT_MS = 3000;
const SILENCE = new Int16Array(FRAME_SAMPLES);

export class CallSession {
  /**
   * @param {object} opts
   * @param {string} opts.callId           id da chamada na Meta (wacid…)
   * @param {string} opts.signedUrl        URL assinado do agente (a API obtém-no com a chave do cliente)
   * @param {{audioBase64: string, format: string}|null} [opts.disclosure] aviso "está a falar com uma IA"
   * @param {object} [opts.dynamicVariables] variáveis para o agente (ex.: número de quem liga)
   * @param {object} [opts.conversationOverride] conversation_config_override (ex.: primeira frase de uma chamada feita)
   * @param {object} [opts.peerConfig]     configuração do werift (portas UDP, IP público)
   * @param {number} [opts.maxSeconds]     duração máxima da chamada
   * @param {(result: object) => void} [opts.onEnded]
   * @param {(tool: string, parameters: object) => Promise<{result: string, is_error: boolean}>} [opts.onToolCall]
   *        o agente pediu uma ferramenta (marcar, mover o lead…): a API executa e devolve o resultado
   * @param {(...args: any[]) => void} [opts.log]
   */
  constructor(opts) {
    this.callId = opts.callId;
    this.signedUrl = opts.signedUrl;
    this.disclosure = opts.disclosure || null;
    this.dynamicVariables = opts.dynamicVariables || {};
    this.conversationOverride = opts.conversationOverride || null;
    this.peerConfig = opts.peerConfig || {};
    this.maxSeconds = opts.maxSeconds || 1800;
    this.onEnded = opts.onEnded || (() => {});
    this.onToolCall = opts.onToolCall || null;
    this.log = opts.log || ((...a) => console.log(`[call ${this.callId}]`, ...a));

    this.codec = new OpusCodec();
    this.state = 'new';               // new → answered → live → ended
    this.queue = [];                  // áudio para o WhatsApp: { samples: Int16Array, offset, protected }
    this.inputChunks = [];            // áudio do WhatsApp à espera de ir para o agente
    this.inputSamples = 0;
    this.agentReady = false;
    this.inputFormat = 'pcm_16000';
    this.outputFormat = 'pcm_16000';
    this.conversationId = null;
    this.transcript = [];
    this.stats = { rtpIn: 0, rtpOut: 0, chunksToAgent: 0, audioFromAgent: 0 };
    this.seq = Math.floor(Math.random() * 65535);
    this.timestamp = Math.floor(Math.random() * 0xffffffff);
    this.startedAt = null;
  }

  /** Oferta SDP do WhatsApp → resposta SDP (com os candidatos ICE já incluídos) */
  createPeer() {
    this.pc = new RTCPeerConnection({ codecs: { audio: [useOPUS()] }, ...this.peerConfig });
    this.localTrack = new MediaStreamTrack({ kind: 'audio' });
    this.pc.onTrack.subscribe((track) => {
      track.onReceiveRtp.subscribe((rtp) => this.onRemoteRtp(rtp));
    });
    this.pc.connectionStateChange.subscribe((s) => {
      this.log('WebRTC:', s);
      if (s === 'failed' || s === 'closed') this.end(s === 'failed' ? 'media_failed' : 'media_closed');
    });
  }

  /** Chamada feita pela empresa: oferta SDP (com os candidatos ICE) para o "connect" da Meta */
  async offer() {
    if (this.state !== 'new') throw new Error('A chamada já começou');
    this.createPeer();
    this.transceiver = this.pc.addTransceiver(this.localTrack, { direction: 'sendrecv' });
    await this.pc.setLocalDescription(await this.pc.createOffer());
    await this.waitForIceGathering();
    this.state = 'offered';
    return this.pc.localDescription.sdp;
  }

  /** Resposta SDP do WhatsApp (o cliente atendeu) */
  async applyAnswer(answerSdp) {
    if (this.state !== 'offered') throw new Error('Não há oferta à espera de resposta');
    await this.pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    this.state = 'answered';
  }

  async answer(offerSdp) {
    if (this.state !== 'new') throw new Error('A chamada já foi atendida');
    this.createPeer();

    await this.pc.setRemoteDescription({ type: 'offer', sdp: offerSdp });
    const audio = this.pc.getTransceivers().find((t) => t.kind === 'audio');
    if (!audio) throw new Error('A oferta não tem áudio');
    audio.setDirection('sendrecv');
    await audio.sender.replaceTrack(this.localTrack);
    this.transceiver = audio;

    await this.pc.setLocalDescription(await this.pc.createAnswer());
    await this.waitForIceGathering();
    this.state = 'answered';
    return this.pc.localDescription.sdp;
  }

  waitForIceGathering() {
    if (this.pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ICE_GATHER_TIMEOUT_MS);
      this.pc.iceGatheringStateChange.subscribe((s) => {
        if (s === 'complete') { clearTimeout(timer); resolve(); }
      });
    });
  }

  /** Espera que o áudio WebRTC esteja ligado (no máximo `ms`), para a primeira frase não se perder */
  waitConnected(ms = 2500) {
    if (!this.pc || this.pc.connectionState === 'connected') return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      this.pc.connectionStateChange.subscribe((s) => {
        if (s === 'connected') { clearTimeout(timer); resolve(); }
      });
    });
  }

  /** Depois do accept na Meta (ou da resposta do cliente): agente e envio de áudio a cada 20 ms */
  async start() {
    if (this.state !== 'answered') throw new Error('A chamada ainda não foi atendida');
    this.state = 'starting';
    await this.waitConnected();
    if (this.state !== 'starting') return; // terminou enquanto esperava
    this.state = 'live';
    this.startedAt = new Date();
    if (this.disclosure?.audioBase64) {
      this.enqueue(agentAudioToWebrtc(this.disclosure.audioBase64, this.disclosure.format), true);
    }
    this.startPacer();
    this.connectAgent();
    this.maxTimer = setTimeout(() => this.end('max_duration'), this.maxSeconds * 1000);
  }

  // ── WhatsApp → agente ──────────────────────────────────────────────────────
  onRemoteRtp(rtp) {
    if (this.state === 'ended' || !rtp?.payload?.length) return;
    this.stats.rtpIn += 1;
    const pcm = this.codec.decode(rtp.payload);
    if (!pcm.length) return;
    this.inputChunks.push(pcm);
    this.inputSamples += pcm.length;
    // Agente ainda a ligar: não acumula mais do que 1 s
    while (!this.agentReady && this.inputSamples > MAX_INPUT_BACKLOG) {
      this.inputSamples -= this.inputChunks.shift().length;
    }
    if (this.agentReady && this.inputSamples >= INPUT_CHUNK_SAMPLES) this.flushInput();
  }

  flushInput() {
    if (!this.inputSamples || this.ws?.readyState !== WebSocket.OPEN) return;
    const all = new Int16Array(this.inputSamples);
    let o = 0;
    for (const c of this.inputChunks) { all.set(c, o); o += c.length; }
    this.inputChunks = [];
    this.inputSamples = 0;
    this.ws.send(JSON.stringify({ user_audio_chunk: webrtcToAgentAudio(all, this.inputFormat) }));
    this.stats.chunksToAgent += 1;
  }

  // ── Agente → WhatsApp ──────────────────────────────────────────────────────
  enqueue(samples, isProtected = false) {
    if (samples.length) this.queue.push({ samples, offset: 0, protected: isProtected });
  }

  /** O cliente começou a falar por cima do agente: corta o que falta dizer (o aviso de IA não se corta) */
  interrupt() {
    this.queue = this.queue.filter((c) => c.protected);
  }

  nextFrame() {
    const frame = new Int16Array(FRAME_SAMPLES);
    let filled = 0;
    while (filled < FRAME_SAMPLES && this.queue.length) {
      const chunk = this.queue[0];
      const take = Math.min(FRAME_SAMPLES - filled, chunk.samples.length - chunk.offset);
      frame.set(chunk.samples.subarray(chunk.offset, chunk.offset + take), filled);
      filled += take;
      chunk.offset += take;
      if (chunk.offset >= chunk.samples.length) this.queue.shift();
    }
    return filled ? frame : SILENCE;
  }

  /** Envia um pacote Opus a cada 20 ms (silêncio quando o agente está calado), sem acumular atraso */
  startPacer() {
    const t0 = Date.now();
    let sent = 0;
    this.pacer = setInterval(() => {
      if (this.state !== 'live') return;
      const due = Math.floor((Date.now() - t0) / FRAME_MS);
      let burst = 0;
      while (sent < due && burst < 5) {
        this.sendFrame(this.nextFrame());
        sent += 1;
        burst += 1;
      }
      if (due - sent > 50) sent = due; // ficou muito para trás (ex.: pausa do processo): recomeça
    }, FRAME_MS);
  }

  sendFrame(frame) {
    const payloadType = this.transceiver?.sender?.codec?.payloadType ?? 111;
    this.seq = (this.seq + 1) & 0xffff;
    this.timestamp = (this.timestamp + FRAME_SAMPLES) >>> 0;
    const header = new RtpHeader({ payloadType, sequenceNumber: this.seq, timestamp: this.timestamp, marker: false });
    try {
      this.localTrack.writeRtp(new RtpPacket(header, this.codec.encode(frame)));
      this.stats.rtpOut += 1;
    } catch (err) {
      this.log('Erro ao enviar áudio:', err?.message);
    }
  }

  // ── ElevenLabs ─────────────────────────────────────────────────────────────
  connectAgent() {
    const ws = new WebSocket(this.signedUrl);
    this.ws = ws;
    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'conversation_initiation_client_data',
        dynamic_variables: this.dynamicVariables,
        ...(this.conversationOverride ? { conversation_config_override: this.conversationOverride } : {}),
      }));
    });
    ws.on('message', (data) => this.onAgentMessage(data));
    ws.on('error', (err) => this.log('Agente: erro', err?.message));
    ws.on('close', (code, reason) => {
      this.log('Agente: ligação fechada', code, String(reason || ''));
      this.end('agent_closed');
    });
  }

  onAgentMessage(data) {
    let msg;
    try { msg = JSON.parse(String(data)); } catch { return; }
    switch (msg.type) {
      case 'conversation_initiation_metadata': {
        const m = msg.conversation_initiation_metadata_event || {};
        this.conversationId = m.conversation_id || null;
        if (m.user_input_audio_format) this.inputFormat = m.user_input_audio_format;
        if (m.agent_output_audio_format) this.outputFormat = m.agent_output_audio_format;
        this.agentReady = true;
        this.log('Agente pronto', this.conversationId, this.inputFormat, '→', this.outputFormat);
        this.flushInput();
        break;
      }
      case 'audio': {
        const b64 = msg.audio_event?.audio_base_64;
        if (b64) {
          this.enqueue(agentAudioToWebrtc(b64, this.outputFormat));
          this.stats.audioFromAgent += 1;
        }
        break;
      }
      case 'interruption':
        this.interrupt();
        break;
      case 'client_tool_call':
        void this.handleToolCall(msg.client_tool_call || {});
        break;
      case 'ping':
        this.ws?.send(JSON.stringify({ type: 'pong', event_id: msg.ping_event?.event_id }));
        break;
      case 'user_transcript': {
        const text = msg.user_transcription_event?.user_transcript;
        if (text) this.transcript.push({ role: 'user', message: text, at: this.elapsed() });
        break;
      }
      case 'agent_response': {
        const text = msg.agent_response_event?.agent_response;
        if (text) this.transcript.push({ role: 'agent', message: text, at: this.elapsed() });
        break;
      }
      case 'agent_response_correction': {
        const fixed = msg.agent_response_correction_event?.corrected_agent_response;
        const last = [...this.transcript].reverse().find((t) => t.role === 'agent');
        if (fixed && last) last.message = fixed;
        break;
      }
      default:
        break;
    }
  }

  /** Ferramenta pedida pelo agente: executa na API e devolve o resultado (se o agente espera resposta) */
  async handleToolCall(call) {
    const { tool_name: tool, tool_call_id: id, parameters, expects_response: expects } = call;
    if (!tool || !id) return;
    this.stats.toolCalls = (this.stats.toolCalls || 0) + 1;
    let out = { result: 'Ferramenta indisponível.', is_error: true };
    if (this.onToolCall) {
      try {
        out = await this.onToolCall(tool, parameters || {});
      } catch (err) {
        this.log('Ferramenta falhou:', tool, err?.message);
        out = { result: 'Não foi possível concluir agora.', is_error: true };
      }
    }
    if (expects === false || this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      type: 'client_tool_result', tool_call_id: id, result: String(out.result ?? ''), is_error: !!out.is_error,
    }));
  }

  elapsed() {
    return this.startedAt ? Math.round((Date.now() - this.startedAt.getTime()) / 1000) : 0;
  }

  // ── Fim ────────────────────────────────────────────────────────────────────
  end(reason = 'ended') {
    if (this.state === 'ended') return;
    const wasLive = this.state === 'live';
    this.state = 'ended';
    clearInterval(this.pacer);
    clearTimeout(this.maxTimer);
    try { this.ws?.close(); } catch { /* já fechado */ }
    try { this.pc?.close(); } catch { /* já fechado */ }
    this.codec.close();
    const endedAt = new Date();
    this.log('Fim:', reason, this.stats);
    this.onEnded({
      callId: this.callId,
      reason,
      wasLive,
      conversationId: this.conversationId,
      transcript: this.transcript,
      startedAt: this.startedAt?.toISOString() || null,
      endedAt: endedAt.toISOString(),
      durationSecs: this.startedAt ? Math.round((endedAt.getTime() - this.startedAt.getTime()) / 1000) : 0,
      stats: this.stats,
    });
  }
}
