// Ponte de voz da LeadsFlow: atende chamadas do WhatsApp Business com agentes ElevenLabs.
// Só a API da LeadsFlow fala com este serviço (token partilhado); os clientes não o veem.
//
//   POST   /calls             { callId, sdp, signedUrl, disclosure?, dynamicVariables?, maxSeconds? } → { sdp }
//   POST   /calls/:id/start   depois de o accept da Meta responder 200
//   POST   /calls/outbound    { callId, signedUrl, dynamicVariables?, conversationOverride?, maxSeconds? } → { sdp } (oferta)
//   POST   /calls/:id/answer  { sdp } resposta do WhatsApp (o cliente atendeu) → liga o agente
//   DELETE /calls/:id         a chamada terminou (ou a API quer desligar)
//   GET    /calls/:id         estado e estatísticas
//   GET    /health
//
// No fim de cada chamada avisa a API (API_CALLBACK_URL) com a transcrição e a duração.
import http from 'node:http';
import { CallSession } from './call-session.js';

const PORT = Number(process.env.PORT || 8090);
const TOKEN = process.env.BRIDGE_TOKEN || '';
const PUBLIC_IP = process.env.PUBLIC_IP || '';
const PORT_MIN = Number(process.env.RTC_PORT_MIN || 10000);
const PORT_MAX = Number(process.env.RTC_PORT_MAX || 10100);
const CALLBACK_URL = process.env.API_CALLBACK_URL || '';
// Ferramentas dos agentes (marcar, mover o lead…): por omissão o mesmo endereço da API + /tool
const TOOL_URL = process.env.API_TOOL_URL || (CALLBACK_URL ? `${CALLBACK_URL.replace(/\/$/, '')}/tool` : '');
const MAX_CALLS = Number(process.env.MAX_CONCURRENT_CALLS || 20);
const MAX_BODY = 256 * 1024;

if (!TOKEN) console.warn('[bridge] BRIDGE_TOKEN não definido: todos os pedidos vão ser recusados');
if (!PUBLIC_IP) console.warn('[bridge] PUBLIC_IP não definido: o WhatsApp pode não conseguir enviar áudio');

const peerConfig = {
  icePortRange: [PORT_MIN, PORT_MAX],
  iceUseIpv6: false,
  ...(PUBLIC_IP ? { iceAdditionalHostAddresses: [PUBLIC_IP] } : {}),
};

/** @type {Map<string, CallSession>} */
const calls = new Map();

async function notifyEnded(result) {
  if (!CALLBACK_URL) return;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(CALLBACK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify(result),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) return;
      console.warn('[bridge] Aviso de fim recusado pela API:', res.status);
    } catch (err) {
      console.warn('[bridge] Aviso de fim falhou:', err?.message);
    }
    await new Promise((r) => setTimeout(r, attempt * 2000));
  }
}

/** O agente pediu uma ferramenta: a API executa (com o contexto da chamada) e devolve o resultado */
async function runTool(callId, tool, parameters) {
  if (!TOOL_URL) return { result: 'Ferramenta indisponível.', is_error: true };
  const res = await fetch(TOOL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ callId, tool, parameters }),
    signal: AbortSignal.timeout(18000),
  });
  if (!res.ok) return { result: 'Não foi possível concluir agora.', is_error: true };
  return res.json();
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('Pedido demasiado grande')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://bridge');
  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, { status: 'ok', calls: calls.size, publicIp: !!PUBLIC_IP });
  }
  if (!TOKEN || req.headers.authorization !== `Bearer ${TOKEN}`) return send(res, 401, { error: 'unauthorized' });

  const newSession = (callId, body) => {
    const session = new CallSession({
      callId,
      signedUrl: body.signedUrl,
      disclosure: body.disclosure || null,
      dynamicVariables: body.dynamicVariables || {},
      conversationOverride: body.conversationOverride || null,
      maxSeconds: Number(body.maxSeconds) || undefined,
      peerConfig,
      onToolCall: (tool, parameters) => runTool(callId, tool, parameters),
      onEnded: (result) => {
        calls.delete(callId);
        void notifyEnded(result);
      },
    });
    calls.set(callId, session);
    return session;
  };

  try {
    if (req.method === 'POST' && url.pathname === '/calls/outbound') {
      const body = await readJson(req);
      const { callId, signedUrl } = body;
      if (!callId || !signedUrl) return send(res, 400, { error: 'callId e signedUrl são obrigatórios' });
      if (calls.has(callId)) return send(res, 409, { error: 'Chamada já existe' });
      if (calls.size >= MAX_CALLS) return send(res, 503, { error: 'Demasiadas chamadas em simultâneo' });
      const session = newSession(callId, body);
      try {
        return send(res, 200, { sdp: await session.offer() });
      } catch (err) {
        session.end('offer_failed');
        calls.delete(callId);
        return send(res, 422, { error: err?.message || 'Não foi possível criar a oferta' });
      }
    }

    if (req.method === 'POST' && url.pathname === '/calls') {
      const body = await readJson(req);
      const { callId, sdp, signedUrl } = body;
      if (!callId || !sdp || !signedUrl) return send(res, 400, { error: 'callId, sdp e signedUrl são obrigatórios' });
      if (calls.has(callId)) return send(res, 409, { error: 'Chamada já existe' });
      if (calls.size >= MAX_CALLS) return send(res, 503, { error: 'Demasiadas chamadas em simultâneo' });

      const session = newSession(callId, body);
      try {
        const answer = await session.answer(sdp);
        return send(res, 200, { sdp: answer });
      } catch (err) {
        session.end('answer_failed');
        calls.delete(callId);
        return send(res, 422, { error: err?.message || 'Não foi possível responder à oferta' });
      }
    }

    const m = /^\/calls\/([^/]+)(\/start|\/answer)?$/.exec(url.pathname);
    if (m) {
      const session = calls.get(decodeURIComponent(m[1]));
      if (!session) return send(res, 404, { error: 'Chamada não encontrada' });
      if (req.method === 'POST' && m[2] === '/start') {
        await session.start();
        return send(res, 200, { ok: true });
      }
      if (req.method === 'POST' && m[2] === '/answer') {
        const { sdp } = await readJson(req);
        if (!sdp) return send(res, 400, { error: 'sdp é obrigatório' });
        try {
          await session.applyAnswer(sdp);
        } catch (err) {
          session.end('answer_failed');
          return send(res, 422, { error: err?.message || 'Resposta inválida' });
        }
        void session.start().catch((err) => { console.warn('[bridge] start:', err?.message); session.end('start_failed'); });
        return send(res, 200, { ok: true });
      }
      if (req.method === 'DELETE' && !m[2]) {
        session.end(url.searchParams.get('reason') || 'terminated');
        return send(res, 200, { ok: true });
      }
      if (req.method === 'GET' && !m[2]) {
        return send(res, 200, { state: session.state, conversationId: session.conversationId, stats: session.stats });
      }
    }
    return send(res, 404, { error: 'not found' });
  } catch (err) {
    console.error('[bridge] Erro:', err);
    return send(res, 500, { error: err?.message || 'erro' });
  }
});

server.listen(PORT, () => {
  console.log(`[bridge] A ouvir na porta ${PORT}; UDP ${PORT_MIN}-${PORT_MAX}; IP público ${PUBLIC_IP || '(não definido)'}`);
});

// Deploy: desliga as chamadas em curso de forma limpa
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    for (const s of calls.values()) s.end('shutdown');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
