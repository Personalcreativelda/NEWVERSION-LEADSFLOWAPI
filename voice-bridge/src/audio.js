// Conversões de áudio entre o WhatsApp (Opus 48 kHz, WebRTC) e o ElevenLabs (PCM 16 bits ou μ-law).
import OpusScript from 'opusscript';

export const WEBRTC_RATE = 48000;
export const FRAME_MS = 20;
export const FRAME_SAMPLES = (WEBRTC_RATE / 1000) * FRAME_MS; // 960 amostras por pacote Opus

/** "pcm_16000" → { encoding: 'pcm', rate: 16000 }; "ulaw_8000" → { encoding: 'ulaw', rate: 8000 } */
export function parseFormat(format) {
  const m = /^(pcm|ulaw)_(\d+)$/.exec(String(format || ''));
  if (!m) return { encoding: 'pcm', rate: 16000 };
  return { encoding: m[1], rate: Number(m[2]) };
}

/** Reamostragem linear de PCM 16 bits mono (suficiente para voz) */
export function resample(input, fromRate, toRate) {
  if (fromRate === toRate || input.length === 0) return input;
  const ratio = fromRate / toRate;
  const outLength = Math.max(1, Math.floor(input.length / ratio));
  const out = new Int16Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = input[idx] ?? 0;
    const b = input[idx + 1] ?? a;
    out[i] = Math.round(a + (b - a) * frac);
  }
  return out;
}

// μ-law (G.711), usado quando o agente está configurado para telefonia (ulaw_8000)
const MULAW_BIAS = 0x84;
const MULAW_CLIP = 32635;

export function encodeMulaw(samples) {
  const out = Buffer.alloc(samples.length);
  for (let i = 0; i < samples.length; i++) {
    let s = samples[i];
    const sign = s < 0 ? 0x80 : 0;
    if (s < 0) s = -s;
    if (s > MULAW_CLIP) s = MULAW_CLIP;
    s += MULAW_BIAS;
    let exponent = 7;
    for (let mask = 0x4000; (s & mask) === 0 && exponent > 0; exponent--, mask >>= 1);
    const mantissa = (s >> (exponent + 3)) & 0x0f;
    out[i] = ~(sign | (exponent << 4) | mantissa) & 0xff;
  }
  return out;
}

export function decodeMulaw(bytes) {
  const out = new Int16Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    const u = ~bytes[i] & 0xff;
    const sign = u & 0x80;
    const exponent = (u >> 4) & 0x07;
    const mantissa = u & 0x0f;
    let s = ((mantissa << 3) + MULAW_BIAS) << exponent;
    s -= MULAW_BIAS;
    out[i] = sign ? -s : s;
  }
  return out;
}

/** PCM 16 bits little-endian (Buffer) → Int16Array */
export function bufferToInt16(buf) {
  const copy = Buffer.from(buf); // alinhamento garantido
  return new Int16Array(copy.buffer, copy.byteOffset, Math.floor(copy.length / 2));
}

export function int16ToBuffer(samples) {
  return Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
}

/** Áudio do ElevenLabs (base64 no formato do agente) → PCM 48 kHz para o WhatsApp */
export function agentAudioToWebrtc(base64, format) {
  const { encoding, rate } = parseFormat(format);
  const raw = Buffer.from(base64, 'base64');
  const pcm = encoding === 'ulaw' ? decodeMulaw(raw) : bufferToInt16(raw);
  return resample(pcm, rate, WEBRTC_RATE);
}

/** PCM 48 kHz do WhatsApp → base64 no formato que o agente espera */
export function webrtcToAgentAudio(samples48k, format) {
  const { encoding, rate } = parseFormat(format);
  const pcm = resample(samples48k, WEBRTC_RATE, rate);
  return (encoding === 'ulaw' ? encodeMulaw(pcm) : int16ToBuffer(pcm)).toString('base64');
}

/** Codificador/descodificador Opus mono a 48 kHz (um por chamada) */
export class OpusCodec {
  constructor() {
    this.encoder = new OpusScript(WEBRTC_RATE, 1, OpusScript.Application.VOIP);
    this.decoder = new OpusScript(WEBRTC_RATE, 1, OpusScript.Application.VOIP);
  }

  /** Pacote Opus → PCM 48 kHz mono */
  decode(packet) {
    try {
      return bufferToInt16(this.decoder.decode(packet));
    } catch {
      return new Int16Array(0); // pacote estragado: ignora
    }
  }

  /** 960 amostras (20 ms) → pacote Opus */
  encode(frame) {
    return Buffer.from(this.encoder.encode(int16ToBuffer(frame), FRAME_SAMPLES));
  }

  close() {
    try { this.encoder.delete(); } catch { /* já libertado */ }
    try { this.decoder.delete(); } catch { /* já libertado */ }
  }
}
