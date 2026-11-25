// Teste fechado da ponte, sem rede externa: um peer WebRTC faz de WhatsApp (oferta Opus, envia um tom)
// e um servidor WebSocket local faz de ElevenLabs (mesmas mensagens do protocolo real).
// Verifica áudio nos dois sentidos, ping/pong, interrupção e fim automático.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocketServer } from 'ws';
import { MediaStreamTrack, RTCPeerConnection, RtpHeader, RtpPacket, useOPUS } from 'werift';
import { CallSession } from '../src/call-session.js';
import { FRAME_SAMPLES, OpusCodec, int16ToBuffer } from '../src/audio.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Tom de 440 Hz em PCM 16 bits */
function tone(samples, rate, amp = 8000) {
  const out = new Int16Array(samples);
  for (let i = 0; i < samples; i++) out[i] = Math.round(amp * Math.sin((2 * Math.PI * 440 * i) / rate));
  return out;
}

const energy = (pcm) => {
  let s = 0;
  for (let i = 0; i < pcm.length; i++) s += Math.abs(pcm[i]);
  return pcm.length ? s / pcm.length : 0;
};

test('áudio nos dois sentidos entre o WhatsApp (WebRTC) e o agente (WebSocket)', { timeout: 30000 }, async () => {
  // ── "ElevenLabs" falso ──
  const fake = { initData: null, userChunks: 0, userEnergy: 0, pongs: 0 };
  const wss = new WebSocketServer({ port: 0 });
  await new Promise((r) => wss.once('listening', r));
  const agentPort = wss.address().port;
  let agentSocket;
  wss.on('connection', (ws) => {
    agentSocket = ws;
    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.type === 'conversation_initiation_client_data') {
        fake.initData = msg;
        ws.send(JSON.stringify({
          type: 'conversation_initiation_metadata',
          conversation_initiation_metadata_event: {
            conversation_id: 'conv_teste', user_input_audio_format: 'pcm_16000', agent_output_audio_format: 'pcm_16000',
          },
        }));
        ws.send(JSON.stringify({ type: 'ping', ping_event: { event_id: 7, ping_ms: 10 } }));
        // 1,5 s de fala do agente, em pedaços de 250 ms
        for (let i = 0; i < 6; i++) {
          const pcm = tone(4000, 16000);
          ws.send(JSON.stringify({ type: 'audio', audio_event: { audio_base_64: int16ToBuffer(pcm).toString('base64'), event_id: i } }));
        }
        ws.send(JSON.stringify({ type: 'agent_response', agent_response_event: { agent_response: 'Olá, em que posso ajudar?' } }));
      } else if (msg.user_audio_chunk) {
        fake.userChunks += 1;
        const buf = Buffer.from(msg.user_audio_chunk, 'base64');
        fake.userEnergy = Math.max(fake.userEnergy, energy(new Int16Array(buf.buffer, buf.byteOffset, buf.length >> 1)));
      } else if (msg.type === 'pong') {
        assert.equal(msg.event_id, 7);
        fake.pongs += 1;
      }
    });
  });

  // ── "WhatsApp" falso: faz a oferta e envia um tom em Opus ──
  const whatsapp = new RTCPeerConnection({ codecs: { audio: [useOPUS()] } });
  const waTrack = new MediaStreamTrack({ kind: 'audio' });
  const waTransceiver = whatsapp.addTransceiver(waTrack, { direction: 'sendrecv' });
  const waCodec = new OpusCodec();
  let heard = 0;
  let heardEnergy = 0;
  whatsapp.onTrack.subscribe((track) => {
    track.onReceiveRtp.subscribe((rtp) => {
      const pcm = waCodec.decode(rtp.payload);
      const e = energy(pcm);
      if (e > 500) heard += 1;
      heardEnergy = Math.max(heardEnergy, e);
    });
  });
  await whatsapp.setLocalDescription(await whatsapp.createOffer());
  await new Promise((r) => {
    if (whatsapp.iceGatheringState === 'complete') return r();
    whatsapp.iceGatheringStateChange.subscribe((s) => s === 'complete' && r());
    setTimeout(r, 3000);
  });

  // ── A ponte ──
  let ended = null;
  const session = new CallSession({
    callId: 'wacid.teste',
    signedUrl: `ws://127.0.0.1:${agentPort}`,
    dynamicVariables: { caller: '258840000000' },
    peerConfig: {},
    onEnded: (r) => { ended = r; },
    log: () => {},
  });
  const answerSdp = await session.answer(whatsapp.localDescription.sdp);
  assert.match(answerSdp, /opus/i, 'a resposta negocia Opus');
  await whatsapp.setRemoteDescription({ type: 'answer', sdp: answerSdp });

  // Liga-se o WebRTC; depois do "accept" a ponte começa
  for (let i = 0; i < 50 && whatsapp.connectionState !== 'connected'; i++) await sleep(100);
  assert.equal(whatsapp.connectionState, 'connected', 'WebRTC ligado');
  session.start();

  // O "WhatsApp" envia 2 s de tom (100 pacotes de 20 ms)
  const pt = waTransceiver.sender.codec?.payloadType ?? 111;
  let seq = 1000;
  let ts = 5000;
  const frame = tone(FRAME_SAMPLES, 48000);
  for (let i = 0; i < 100; i++) {
    seq = (seq + 1) & 0xffff;
    ts += FRAME_SAMPLES;
    waTrack.writeRtp(new RtpPacket(new RtpHeader({ payloadType: pt, sequenceNumber: seq, timestamp: ts }), waCodec.encode(frame)));
    await sleep(20);
  }
  await sleep(500);

  // WhatsApp → agente
  assert.ok(fake.initData, 'o agente recebeu o início da conversa');
  assert.equal(fake.initData.dynamic_variables.caller, '258840000000');
  assert.ok(fake.userChunks >= 10, `o agente recebeu áudio (${fake.userChunks} pedaços)`);
  assert.ok(fake.userEnergy > 1000, `o áudio que chega ao agente não é silêncio (${fake.userEnergy.toFixed(0)})`);
  // Agente → WhatsApp
  assert.ok(heard >= 20, `o WhatsApp ouviu o agente (${heard} pacotes com som)`);
  assert.equal(fake.pongs, 1, 'respondeu ao ping');
  assert.equal(session.conversationId, 'conv_teste');
  assert.ok(session.transcript.some((t) => t.role === 'agent'), 'guardou a resposta do agente');

  // Interrupção: o que falta dizer é cortado
  for (let i = 0; i < 20; i++) {
    agentSocket.send(JSON.stringify({ type: 'audio', audio_event: { audio_base_64: int16ToBuffer(tone(16000, 16000)).toString('base64'), event_id: 100 + i } }));
  }
  await sleep(300);
  assert.ok(session.queue.length > 0, 'havia fala por dizer');
  agentSocket.send(JSON.stringify({ type: 'interruption', interruption_event: { event_id: 200 } }));
  await sleep(200);
  assert.equal(session.queue.length, 0, 'a interrupção cortou a fala');

  // O agente desliga → a chamada termina sozinha
  agentSocket.close();
  for (let i = 0; i < 30 && !ended; i++) await sleep(100);
  assert.ok(ended, 'a chamada terminou');
  assert.equal(ended.reason, 'agent_closed');
  assert.equal(ended.conversationId, 'conv_teste');
  assert.ok(ended.durationSecs >= 2);

  waCodec.close();
  await whatsapp.close();
  wss.close();
});
