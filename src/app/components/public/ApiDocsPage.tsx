import type { ReactNode } from 'react';
import { CONTACT_EMAIL, PublicPageShell, Section } from './PublicPageShell';

/**
 * Documentação da API pública. Só as rotas que um token de API (lf_…) pode usar —
 * a lista fechada está em api/src/services/api-token.service.ts (PUBLIC_ROUTES).
 * Ao abrir uma rota nova à API pública, documentá-la aqui.
 */

const BASE = 'https://api.leadsflowapi.com';

function Endpoint({ method, path, children }: { method: string; path: string; children?: ReactNode }) {
  const color: Record<string, string> = {
    GET: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    POST: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
    PUT: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
    DELETE: 'bg-red-500/10 text-red-700 dark:text-red-400',
  };
  return (
    <div className="mt-8 rounded-xl border border-border">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <span className={`rounded-md px-2 py-0.5 font-mono text-xs font-semibold ${color[method]}`}>{method}</span>
        <code className="!bg-transparent !p-0 text-sm break-all">{path}</code>
      </div>
      <div className="px-4 pb-1 [&>*:first-child]:mt-3">{children}</div>
    </div>
  );
}

const Code = ({ children }: { children: string }) => <pre><code>{children.trim()}</code></pre>;

const LEAD_EXAMPLE = `{
  "id": "3f2b6c1e-8a4d-4c2b-9c3d-1a2b3c4d5e6f",
  "name": "Ana Matola",
  "email": "ana@exemplo.co.mz",
  "phone": "258841234567",
  "whatsapp": "258841234567",
  "company": "Matola Comércio",
  "position": "Diretora",
  "source": "site",
  "status": "novo",
  "tags": ["feira-2026"],
  "notes": "Pediu orçamento",
  "custom_fields": {},
  "deal_value": 15000,
  "created_at": "2026-10-26T09:12:44.000Z",
  "updated_at": "2026-10-26T09:12:44.000Z"
}`;

export default function ApiDocsPage({ path }: { path?: string } = {}) {
  return (
    <PublicPageShell
      path={path}
      title="API"
      intro="Ligue o LeadsFlow aos seus sistemas: crie e atualize leads a partir do seu site, CRM ou automações (n8n, Make, Zapier) e envie mensagens de WhatsApp."
    >
      <Section id="inicio" title="Começar">
        <ol>
          <li>No LeadsFlow, abra <strong>Definições → Segurança → Novo token</strong>.</li>
          <li>Dê-lhe um nome e, se quiser, um prazo de validade. Copie o token: só é mostrado uma vez.</li>
          <li>Envie-o em todos os pedidos no cabeçalho <code>Authorization</code>.</li>
        </ol>
        <Code>{`
curl ${BASE}/api/leads?limit=10 \\
  -H "Authorization: Bearer lf_SEU_TOKEN"
`}</Code>
        <p>
          Todos os pedidos e respostas usam JSON (<code>Content-Type: application/json</code>). O endereço base é{' '}
          <code>{BASE}</code>.
        </p>
      </Section>

      <Section id="autenticacao" title="Autenticação">
        <p>
          Os tokens começam por <code>lf_</code> e dão acesso aos dados da conta que os criou. Trate-os como uma
          palavra-passe: não os coloque em código que corra no browser nem em repositórios públicos. Pode apagar um token
          em Definições → Segurança; deixa de funcionar no máximo um minuto depois.
        </p>
        <p>Os tokens só servem para as rotas desta página. Qualquer outra rota responde <code>403</code>.</p>
      </Section>

      <Section id="limites" title="Limites">
        <ul>
          <li><strong>120 pedidos por minuto</strong> por token. Acima disso a resposta é <code>429</code>, com o cabeçalho <code>Retry-After</code> (segundos a esperar).</li>
          <li>Os limites do plano também se aplicam: número de leads e de mensagens por mês. Ao chegar ao limite, a resposta traz <code>"error": "plan_limit_exceeded"</code>.</li>
          <li>Com o plano expirado, os pedidos de escrita respondem <code>403</code> com <code>"error": "plan_expired"</code>.</li>
        </ul>
      </Section>

      <Section id="erros" title="Erros">
        <p>Os erros devolvem um código HTTP e um JSON com o campo <code>error</code>:</p>
        <Code>{`{ "error": "Lead not found" }`}</Code>
        <table>
          <thead>
            <tr><th>Código</th><th>Significado</th></tr>
          </thead>
          <tbody>
            <tr><td><code>400</code></td><td>Pedido inválido (falta um campo obrigatório ou o formato está errado).</td></tr>
            <tr><td><code>401</code></td><td>Token em falta, inválido ou expirado.</td></tr>
            <tr><td><code>403</code></td><td>Rota fora da API pública, plano expirado ou limite de mensagens atingido.</td></tr>
            <tr><td><code>404</code></td><td>O recurso não existe nesta conta.</td></tr>
            <tr><td><code>429</code></td><td>Demasiados pedidos ou limite de leads do plano atingido.</td></tr>
            <tr><td><code>5xx</code></td><td>Erro do servidor. Tente de novo mais tarde; <code>503</code> indica indisponibilidade temporária.</td></tr>
          </tbody>
        </table>
      </Section>

      <Section id="leads" title="Leads">
        <h3>O objeto lead</h3>
        <table>
          <thead>
            <tr><th>Campo</th><th>Tipo</th><th>Descrição</th></tr>
          </thead>
          <tbody>
            <tr><td><code>id</code></td><td>texto (UUID)</td><td>Identificador, criado pelo LeadsFlow.</td></tr>
            <tr><td><code>name</code></td><td>texto</td><td>Nome. <strong>Obrigatório</strong> ao criar.</td></tr>
            <tr><td><code>email</code></td><td>texto</td><td>Email.</td></tr>
            <tr><td><code>phone</code></td><td>texto</td><td>Telefone com o código do país, ex.: <code>258841234567</code>.</td></tr>
            <tr><td><code>whatsapp</code></td><td>texto</td><td>Número de WhatsApp, se diferente do telefone.</td></tr>
            <tr><td><code>company</code></td><td>texto</td><td>Empresa.</td></tr>
            <tr><td><code>position</code></td><td>texto</td><td>Cargo.</td></tr>
            <tr><td><code>source</code></td><td>texto</td><td>Origem, ex.: <code>site</code>, <code>whatsapp</code>, <code>facebook</code>, <code>instagram</code>, <code>indicacao</code>.</td></tr>
            <tr><td><code>status</code></td><td>texto</td><td>Etapa do funil: <code>novo</code> (por defeito), <code>contatado</code>, <code>qualificado</code>, <code>negociacao</code>, <code>convertido</code> ou <code>perdido</code>.</td></tr>
            <tr><td><code>tags</code></td><td>lista de textos</td><td>Etiquetas.</td></tr>
            <tr><td><code>notes</code></td><td>texto</td><td>Observações.</td></tr>
            <tr><td><code>custom_fields</code></td><td>objeto</td><td>Campos livres (chave → valor).</td></tr>
            <tr><td><code>deal_value</code></td><td>número</td><td>Valor do negócio.</td></tr>
            <tr><td><code>created_at</code>, <code>updated_at</code></td><td>data ISO 8601</td><td>Criação e última alteração.</td></tr>
          </tbody>
        </table>

        <Endpoint method="GET" path="/api/leads">
          <p>Lista os leads, do mais recente para o mais antigo. Parâmetros opcionais na query:</p>
          <table>
            <tbody>
              <tr><td><code>status</code></td><td>Só os leads nesta etapa do funil.</td></tr>
              <tr><td><code>search</code></td><td>Procura no nome, email e telefone.</td></tr>
              <tr><td><code>limit</code></td><td>Número máximo de resultados.</td></tr>
              <tr><td><code>offset</code></td><td>Quantos resultados saltar (paginação).</td></tr>
            </tbody>
          </table>
          <Code>{`
curl "${BASE}/api/leads?status=novo&limit=50&offset=0" \\
  -H "Authorization: Bearer lf_SEU_TOKEN"
`}</Code>
          <p>Resposta <code>200</code>: uma lista de leads.</p>
        </Endpoint>

        <Endpoint method="GET" path="/api/leads/{id}">
          <p>Devolve um lead. Resposta <code>200</code> com o lead, ou <code>404</code>.</p>
        </Endpoint>

        <Endpoint method="POST" path="/api/leads">
          <p>Cria um lead. Só <code>name</code> é obrigatório.</p>
          <Code>{`
curl -X POST ${BASE}/api/leads \\
  -H "Authorization: Bearer lf_SEU_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Ana Matola",
    "phone": "258841234567",
    "email": "ana@exemplo.co.mz",
    "source": "site",
    "tags": ["feira-2026"]
  }'
`}</Code>
          <p>Resposta <code>201</code>:</p>
          <Code>{LEAD_EXAMPLE}</Code>
        </Endpoint>

        <Endpoint method="PUT" path="/api/leads/{id}">
          <p>
            Atualiza um lead. Envie só os campos a alterar. Mudar o <code>status</code> move o lead no funil e dispara os
            fluxos de remarketing configurados para essa etapa.
          </p>
          <Code>{`
curl -X PUT ${BASE}/api/leads/3f2b6c1e-8a4d-4c2b-9c3d-1a2b3c4d5e6f \\
  -H "Authorization: Bearer lf_SEU_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{ "status": "qualificado", "deal_value": 20000 }'
`}</Code>
          <p>Resposta <code>200</code> com o lead atualizado.</p>
        </Endpoint>

        <Endpoint method="DELETE" path="/api/leads/{id}">
          <p>Apaga um lead. Resposta <code>200</code>:</p>
          <Code>{`{ "success": true }`}</Code>
        </Endpoint>
      </Section>

      <Section id="whatsapp" title="Mensagens de WhatsApp">
        <Endpoint method="POST" path="/api/whatsapp/send">
          <p>
            Envia uma mensagem de texto pelo WhatsApp ligado à conta (ligação por código QR em Definições → Canais
            ligados). A mensagem fica também na caixa de entrada, na conversa com esse número.
          </p>
          <table>
            <tbody>
              <tr><td><code>phone</code></td><td><strong>Obrigatório.</strong> Número com o código do país, só dígitos.</td></tr>
              <tr><td><code>message</code></td><td><strong>Obrigatório.</strong> Texto da mensagem.</td></tr>
              <tr><td><code>leadId</code></td><td>Opcional. Associa a conversa a este lead.</td></tr>
            </tbody>
          </table>
          <Code>{`
curl -X POST ${BASE}/api/whatsapp/send \\
  -H "Authorization: Bearer lf_SEU_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{ "phone": "258841234567", "message": "Olá Ana, recebemos o seu pedido!" }'
`}</Code>
          <p>Resposta <code>200</code>:</p>
          <Code>{`{ "success": true, "message_id": "3EB0C767D26A1D8F2B11" }`}</Code>
          <p>
            Conta para o limite mensal de mensagens do plano. Se não houver um WhatsApp ligado, a resposta é{' '}
            <code>400</code>.
          </p>
        </Endpoint>
      </Section>

      <Section id="javascript" title="Exemplo em JavaScript">
        <p>Num servidor (Node.js 18+), criar um lead a partir de um formulário do site:</p>
        <Code>{`
const res = await fetch('${BASE}/api/leads', {
  method: 'POST',
  headers: {
    Authorization: \`Bearer \${process.env.LEADSFLOW_TOKEN}\`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ name: 'Ana Matola', phone: '258841234567', source: 'site' }),
});
if (!res.ok) throw new Error((await res.json()).error);
const lead = await res.json();
`}</Code>
      </Section>

      <Section id="suporte" title="Suporte">
        <p>
          Dúvidas ou pedidos de novas rotas: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. A utilização da API
          está sujeita aos <a href="/termos">termos de uso</a>.
        </p>
      </Section>
    </PublicPageShell>
  );
}
