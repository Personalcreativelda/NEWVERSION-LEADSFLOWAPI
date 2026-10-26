# LeadsFlow — guia do projeto

CRM/automação de vendas (leads, inbox multicanal, campanhas, funil, assistentes IA).
Um repositório com duas partes:

- **Web / app Android** — raiz: React 18 + Vite + Tailwind v4 (+ algum MUI), empacotado
  para Android com Capacitor 7 (`android/`). Produção web: `https://app.leadsflowapi.com`.
- **API** — `api/`: Express + PostgreSQL + MinIO + Socket.IO. Produção: `https://api.leadsflowapi.com`.
- Deploy: Coolify a partir do `docker-compose.yml` (serviços `api` e `dashboard`). O
  utilizador faz o deploy à mão depois do push — o push não publica nada sozinho.

Textos da interface e comentários de código em **português (PT)**.

## Comandos

```bash
npm run dev                 # web em localhost:3200 (a 3200 pode estar ocupada por um "vite preview" antigo — usar --port 3300)
npx tsc --noEmit -p .       # tipos do front (0 erros)
cd api && npx tsc --noEmit -p .   # tipos da API (0 erros)
npm run build               # dist/ da web (modo normal)
npm run android:sync        # build modo android + cap sync — SEMPRE a partir da raiz
npm run release:mobile -- --notes "..."   # atualização ao vivo para os telemóveis
```

Depois de `android:sync` o `dist/` fica em modo android: correr `npm run build` a seguir.

### APK (Windows)

Gradle 9.1 + AGP 8.13 com o JBR do Android Studio (Java 25). Precisa de TEMP curto e do
tmpdir de unix sockets, senão falha com erro de loopback:

```bash
cd android && export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ANDROID_HOME="$LOCALAPPDATA/Android/Sdk" TEMP='C:\tmp' TMP='C:\tmp' JAVA_TOOL_OPTIONS='-Djdk.net.unixdomain.tmpdir=C:\tmp -Djava.io.tmpdir=C:\tmp' && ./gradlew assembleDebug --no-daemon --console=plain -q
```

APK em `android/app/build/outputs/apk/debug/app-debug.apk` (copiar para o Ambiente de
Trabalho como `LeadsFlow.apk`). Há um emulador `Medium_Phone_API_37.0`.

## Atualizações ao vivo (Capgo auto-hospedado)

- `src/live-update.ts` (app) + `api/src/routes/version.routes.ts` (`/api/version/mobile*`).
- Só código web. Mudanças nativas (plugin novo, `MainActivity`, ícones, permissões) exigem
  APK novo: subir `versionCode` em `android/app/build.gradle` (os pacotes exigem ≥ esse versionCode).
- O pacote entra quando o app vai para segundo plano/reabre (2.ª abertura). A versão em uso
  aparece no fundo do menu do telemóvel. APKs anteriores ao 1.1 não recebem atualizações.
- Chave `MOBILE_RELEASE_KEY` em `.env.release.local` (git-ignored) e no Coolify (API).

## Ligar canais

- Segredos dos canais (tokens, palavras-passe) cifrados com AES-256-GCM (`CHANNEL_SECRETS_KEY`,
  `api/src/utils/secret-box.ts`); o `query()` decifra as colunas `credentials`. Nenhuma resposta da
  API leva segredos (`middleware/redact-credentials` → `has_*`). Editar sem token mantém o guardado.
  Não mudar a `CHANNEL_SECRETS_KEY` depois de definida (os tokens cifrados deixam de ser lidos).
- O estado `active` só é dado depois de o fornecedor confirmar (`services/channel-validation.service.ts`).
- Facebook/Instagram: login da Meta (`/api/oauth/meta/*`, `components/inbox/channels/MetaConnect.tsx`).
  No app volta por `com.leadsflowapi.app://oauth/meta`. Sem `META_APP_ID`/`META_APP_SECRET` usa o formulário manual.
- Webhooks da Meta de canais ligados pelo login têm de vir assinados com `META_APP_SECRET`.
- Rotas `/debug` e `/test` dos webhooks só para administradores (`requireAdmin`).

## API pública e páginas públicas

- Tokens de API `lf_…` (Definições → Segurança) entram no `requireAuth` só nas rotas de
  `PUBLIC_ROUTES` (`api/src/services/api-token.service.ts`): leads (CRUD) e `POST /api/whatsapp/send`.
  Âmbito `read` = GET; 120 pedidos/min por token (429 + `Retry-After`); pedidos sem `Origin` com
  `Bearer lf_` passam o CORS. Rota nova na API pública → acrescentar lá E documentar em
  `src/app/components/public/ApiDocsPage.tsx`.
- Páginas públicas sem sessão (`src/standalone-app.tsx`, antes do App): `/privacidade` (`/privacy`),
  `/termos` (`/terms`), `/docs`. Instruções de eliminação de dados da Meta: `/privacidade#eliminacao-de-dados`.
  O `npm run build` gera também `dist/privacidade.html` etc. já desenhados (`scripts/prerender-public.mjs`
  + `src/public-pages-ssr.tsx`) para o verificador da Meta ler sem JavaScript; o `serve` (Dockerfile, sem
  `-s`) usa `public/serve.json`. Nessas regras o "resto vai para o app" é `!**/*.html` — `**` voltava a
  apanhar o `.html` e servia o app vazio. Empresa/morada num só sítio: `COMPANY` em `PublicPageShell.tsx`
  (tem de coincidir com a verificação da empresa na Meta).
- WhatsApp por código QR (Evolution): escondido na escolha de canal para contas que ainda não o
  têm (`pickableChannels` em ChannelsList) e sem "API não oficial" nos textos — por causa da revisão
  da Meta (Tech Provider). Os canais já ligados continuam a funcionar. O oficial aparece como
  "WhatsApp Business". `POST /api/whatsapp/send` usa o oficial (Cloud API) quando existe.
- SQL com nomes de coluna vindos do pedido: só identificadores `^[a-z][a-z0-9_]*$` (entre aspas)
  ou lista fechada — houve injeção pelo nome da chave em leads/campanhas/contactos.

## Sistema de design (usar sempre, não reinventar)

- Páginas: `PageHeader` + `PageAction` (`src/app/components/base/PageHeader.tsx`). Ação à
  direita do título também no telemóvel; no telemóvel o botão mostra só o ícone.
- Modais: `AppModal` (Radix, cabeçalho e botões fixos, só o corpo faz scroll) ou, para
  modais feitos à mão, `OverlayModal` (portal no body, folha no telemóvel, Esc/tocar fora/
  botão voltar). Nunca criar `fixed inset-0 z-50` novo à mão. O `DialogContent`/`AppModal` já
  traz o botão fechar: não desenhar outro X no cabeçalho (ficavam dois). Sem `w-[95vw]` nos
  modais (no telemóvel são folhas de largura total) e sem cores claras fixas (`bg-blue-50`…).
- Estados vazios: `EmptyState`.
- Tipografia (estilo app Claude): texto em Instrument Sans e títulos de página em Source Serif 4,
  ambas em `@fontsource-variable` (dentro do pacote — funcionam offline; nada de Google Fonts).
  Tokens `--font-sans`/`--font-serif` (globals.css). No telemóvel `text-sm` = 15px e `text-xs` = 13px.
  As fontes do app Claude (Anthropic Sans/Serif) são proprietárias: não usar.
- Pouco texto: listas de definições só com o título (e um valor curto, ex.: "Ativada"); nada de
  frases a explicar o óbvio, "Dica:", "Como funciona" ou subtítulos que repetem o título. Passos de
  configuração necessários ficam num `<details>` fechado. Nunca mostrar nomes internos
  (Evolution API, instância, n8n interno, MinIO, Supabase, OpenAI/Gemini) ao utilizador.
- Seleção/destaque sem contornos azuis grossos: `border` neutro (`border-foreground/25`).
- Botões com texto não levam ícone à esquerda: o `Button` (ui/button.tsx) tira-o sozinho
  (fica o spinner e ícones depois do texto, ex.: ▾). Em `<button>` feitos à mão, não pôr.
- Logótipos de canais/integrações: `h-7 w-7` dentro da caixa de 40px.
- Tamanhos únicos: botões com texto 40px (o `Button` ignora `h-*`/`py-*`/`text-*` avulsos;
  botões feitos à mão: `h-10`). Campos: regra global em globals.css ("Campos de texto") dá o
  mesmo fundo, contorno, cantos, altura mínima (40px) e foco a todos os input/select/textarea,
  incluindo os feitos à mão; campos embutidos usam `bg-transparent`/`border-0` ou `data-bare`.
- Fundo dos modais: Cancelar | ação principal lado a lado com a mesma largura no telemóvel,
  à direita no desktop (`DialogFooter`; feitos à mão: `flex gap-2 [&>*]:flex-1 sm:[&>*]:flex-none sm:justify-end`).
- Títulos e rótulos só com a primeira maiúscula ("Nova tarefa", não "Nova Tarefa").
- Ficheiros gerados (CSV, modelo, relatório): sempre `saveFile()` (`lib/saveFile.ts`). O WebView
  ignora `<a download>`; no app vai pelo plugin nativo `FileSaver` (FileSaverPlugin.java, desde o
  versionCode 3) para Transferências. Publicar com `--min-native 2` enquanto houver APKs 1.1.
- Modais em ecrã tátil não fazem foco automático (abria o teclado sozinho) — `ui/dialog.tsx`.
- Nunca `window.open('')` + `print()`: no app o WebView fica preso nessa página. PDFs com
  `htmlToPdf()` (`lib/htmlToPdf.ts`, iframe escondido + jsPDF) e depois `saveFile()`.
- Escolhas em formulários (destinatários, envio): `ChoiceList`/`CheckList` (`base/ChoiceList.tsx`),
  iguais nos modais de campanha; nada de grelhas de botões coloridos nem listas com scroll próprio.
- Offline: os GET da API ficam guardados no aparelho (`lib/offlineCache.ts`, IndexedDB, por
  utilizador, apagados no logout). Sem rede ou com 502/503/504/timeout, os três clientes
  (`utils/api.ts`, `lib/api.ts`, axios com `withOfflineCache`) devolvem a última cópia e
  `lib/serverStatus.ts` marca o servidor em baixo (verifica `/api/health` a cada 15 s). O painel
  mostra `ServerStatusBanner` e nunca esconde o conteúdo. Cliente axios novo → `withOfflineCache`.
  Para o utilizador só aparece o estado ("Sem ligação à internet"/"ao servidor"): nada de textos
  ou avisos sobre fila, cópias guardadas ou reenvio — o funcionamento offline é invisível.
  Nada de dados falsos (`getMockData`/`mockAuth`) quando a API falha.
- Fila offline (`lib/outbox.ts`, IndexedDB): mensagens da inbox, alterações de leads (PUT) e
  notas de leads feitas sem servidor (`isServerDownError`) ficam na fila e são enviadas por ordem
  quando ele volta (`SERVER_BACK_EVENT`/`online`). Cada tipo regista o envio com
  `registerOutboxSender`. As mensagens levam `client_id` (id da bolha `temp_…`); com
  `queued: true` a API devolve a já gravada em vez de enviar outra vez. Fila apagada no logout.
  Para testar escritas, nunca deixar a fila enviar para a API real (há contactos verdadeiros).
- "Servidor em baixo" = sem rede, tempo esgotado, ou 502/503/504 que NÃO seja JSON da API
  (página do proxy) ou que traga `code: 'SERVER_UNAVAILABLE'` (`isServerDownResponse`). Um 503
  normal da API (ex.: instância do WhatsApp inexistente) é um erro como os outros — senão a fila
  reenviava para sempre.

## Recuperação da API (`api/src/services/health.service.ts`)

- `/api/health` verifica a BD (`SELECT 1`, cache 5 s): 503 `SERVER_UNAVAILABLE` sem BD. `/health`
  (raiz) só diz se o processo responde — é o healthcheck do Docker.
- Erros de ligação à BD chegam ao `errorMiddleware` como 503 `SERVER_UNAVAILABLE`, mas só depois
  de confirmar que a BD está mesmo em baixo (ECONNREFUSED também vem do WhatsApp/e-mail).
- Vigilante (só `NODE_ENV=production`; `DISABLE_WATCHDOG=true` desliga): processo bloqueado > 90 s
  ou BD em baixo > 5 min → o processo termina e o `restart: unless-stopped` arranca-o de novo.
  Precisa de `init: true` no docker-compose (o PID 1 de um contentor ignora sinais vindos de dentro).
- SIGTERM (deploy): deixa terminar os pedidos em curso, até 8 s.
- Pesquisa: `matchesSearch` (`src/app/utils/search.ts`) — sem acentos, várias palavras.
- Avisos: `toast` do sonner (`ui/sonner.tsx` deduplica mensagens iguais e tira ✅/❌/⚠️ do início).
- Ordem das camadas: cabeçalho z-30 < sidebar z-40 < barra inferior z-45 < gaveta 46/47 <
  modais ≥ 50 (Radix 9998/9999). Não voltar a pôr sidebar/cabeçalho com z-index alto.

## Armadilhas já encontradas (não repetir)

- **Overflow horizontal no telemóvel**: filho flex com texto longo precisa de `min-w-0`;
  campos de formulário já têm `min-width: 0` global (globals.css). Testar a 375px e
  confirmar `document.documentElement.scrollWidth === innerWidth`.
- **Regras CSS só do app** (`html.native-app …`) não aparecem no browser: testar com a
  classe `native-app` adicionada ao `<html>`. `white-space: nowrap` só em botões simples.
- **Closures antigas em listeners** (`resize`, etc.): usar ref para o valor anterior — o
  teclado do Android dispara `resize` (fechava o menu ao pesquisar).
- **Tailwind v4**: as variáveis de tema guardam componentes HSL → `hsl(var(--x))`.
  `space-y-*` é margem com especificidade 0 (um `mb-0` no filho estraga).
- **Botão default** é sempre a cor primária (no escuro era cinzento e parecia "Cancelar").
- **Capacitor `hostname: app.leadsflowapi.com`**: pedidos a esse host dentro da WebView são
  servidos pelos ficheiros locais — a API e os ficheiros têm de vir de outro host.
- **Ficheiros**: a API troca URLs do MinIO por `/api/files/<chave>` nas respostas JSON e
  WebSocket (`api/src/utils/storage-urls.ts`); uploads pré-assinados (`?X-Amz-…`) ficam
  diretos ao MinIO. `/api/inbox/media-proxy` não aceita endereços internos.
- **CORS da API**: pedidos sem `Origin` são recusados em produção, exceto as rotas em
  `noOriginRequiredPaths` (`api/src/middleware/cors.middleware.ts`).
- **Sessão**: access token JWT 24h, refresh 7 dias (renovação automática em `api.ts`); sem
  rede ao abrir o app usa o utilizador em cache em vez de terminar a sessão.

## Testar sem a conta do utilizador

Nunca escrever credenciais reais. Sessão de demonstração local no browser (dev server):

```js
localStorage.setItem('leadflow_session_expires_at', String(Date.now() + 864e5));
localStorage.setItem('leadflow_mock_session', JSON.stringify({access_token:'mock_token_demo', user:{id:'demo-user', email:'demo@leadsflow.com', name:'Demo Teste'}}));
['leadsflow_welcome_video_seen','leadsflow_tour_completed','leadsflow_tour_notification_sent'].forEach(k=>localStorage.setItem(k,'true'));
location.href = '/dashboard';
```

Cai passado algum tempo (a API recusa o token); voltar a pôr. Não iniciar a API contra a
BD de produção; para testar rotas usar um harness com BD/armazenamento falsos.

## Forma de trabalhar com o utilizador

- Mostrar no browser (largura de telemóvel) antes de gerar APK novo quando a mudança é visual.
- Pedir antes de `git push`; nunca apagar ficheiros definitivamente.
- Commits em português, com o rodapé de coautoria.
