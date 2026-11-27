// Chamada feita pela empresa: a ponte faz a oferta, o "WhatsApp" responde quando atende,
// o agente arranca com a primeira frase própria desta chamada (conversation_config_override).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocketServer } from 'ws';
import { RTCPeerConnection, useOPUS } from 'werift';
import { CallSession } from '../src/call-session.js';
import { OpusCodec, int16ToBuffer } from '../src/audio.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('chamada feita: oferta → resposta do WhatsApp → agente com primeira frase própria', { timeout: 30000 }, async () => {
  let initData = null;
  const wss = new WebSocketServer({ port: 0 });
  await new Promise((r) => wss.once('listening', r));
  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.type !== 'conversation_initiation_client_data') return;
      initData = msg;
      ws.send(JSON.stringify({
        type: 'conversation_initiation_metadata',
        conversation_initiation_metadata_event: { conversation_id: 'conv_out', user_input_audio_format: 'pcm_16000', agent_output_audio_format: 'pcm_16000' },
      }));
      const pcm = new Int16Array(8000).map((_, i) => Math.round(8000 * Math.sin((2 * Math.PI * 440 * i) / 16000)));
      for (let i = 0; i < 4; i++) ws.send(JSON.stringify({ type: 'audio', audio_event: { audio_base_64: int16ToBuffer(pcm).toString('base64'), event_id: i } }));
    });
  });

  const session = new CallSession({
    callId: 'row-1',
    signedUrl: `ws://127.0.0.1:${wss.address().port}`,
    dynamicVariables: { customer_name: 'Ana' },
    conversationOverride: { agent: { first_message: 'Olá Ana, fala a assistente virtual da Loja.' } },
    peerConfig: {},
    onEnded: () => {},
    log: () => {},
  });
  const offerSdp = await session.offer();
  assert.match(offerSdp, /opus/i);
  assert.equal(session.state, 'offered');

  // "WhatsApp": recebe a oferta e responde (o cliente atendeu)
  const whatsapp = new RTCPeerConnection({ codecs: { audio: [useOPUS()] } });
  const codec = new OpusCodec();
  let heard = 0;
  whatsapp.onTrack.subscribe((track) => track.onReceiveRtp.subscribe((rtp) => {
    const pcm = codec.decode(rtp.payload);
    let s = 0; for (const v of pcm) s += Math.abs(v);
    if (pcm.length && s / pcm.length > 500) heard += 1;
  }));
  await whatsapp.setRemoteDescription({ type: 'offer', sdp: offerSdp });
  const tr = whatsapp.getTransceivers().find((t) => t.kind === 'audio');
  tr.setDirection('sendrecv');
  await whatsapp.setLocalDescription(await whatsapp.createAnswer());
  await new Promise((r) => {
    if (whatsapp.iceGatheringState === 'complete') return r();
    whatsapp.iceGatheringStateChange.subscribe((s) => s === 'complete' && r());
    setTimeout(r, 3000);
  });

  await session.applyAnswer(whatsapp.localDescription.sdp);
  await session.start();
  assert.equal(session.state, 'live');
  for (let i = 0; i < 40 && heard < 20; i++) await sleep(100);

  assert.equal(initData.conversation_config_override.agent.first_message, 'Olá Ana, fala a assistente virtual da Loja.');
  assert.equal(initData.dynamic_variables.customer_name, 'Ana');
  assert.ok(heard >= 20, `o cliente ouviu o agente (${heard} pacotes)`);

  session.end('test');
  codec.close();
  await whatsapp.close();
  wss.close();
});
