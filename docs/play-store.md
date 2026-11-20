# Google Play — publicação do LeadsFlow

Tudo o que a Play Console pede, pela ordem em que aparece. Conta **pessoal**: antes da
produção é obrigatório um **teste fechado com ≥ 12 testadores durante 14 dias seguidos**.

## 0. Ficheiros

| O quê | Onde |
|---|---|
| App para a loja (AAB, variante `play`) | `android/app/build/outputs/bundle/playRelease/app-play-release.aab` (cópia no Ambiente de Trabalho: `LeadsFlow-play-<versão>.aab`) |
| Chave de upload | `~/.leadsflow-keys/leadsflow-upload.jks` + `android/keystore.properties` (palavra-passe). **Fazer cópia das duas** (pen + nuvem privada) |
| Gerar | `npm run android:sync` → `cd android && ./gradlew bundlePlayRelease` (com o ambiente do CLAUDE.md) → `npm run build` |

Na primeira publicação, aceitar a **Assinatura de apps do Google Play** (a Google guarda a
chave final; a nossa é só de upload — se a perdermos, a Google permite trocá-la).

Cada envio para a loja precisa de um `versionCode` maior que o anterior (`android/app/build.gradle`).

## 1. Criar app

- Nome: **LeadsFlow**
- Idioma predefinido: **Português (Portugal) – pt-PT**
- App ou jogo: **App** · Gratuito ou pago: **Gratuito**
- Declarações: aceitar as políticas e as leis de exportação dos EUA.

## 2. Página da loja (Presença na loja → Página principal)

**Nome da app** (30): `LeadsFlow: CRM e WhatsApp`

**Descrição breve** (80):
`Leads, WhatsApp, Instagram e funil de vendas num só app, com assistentes de IA.`

**Descrição completa** (4000):

```
O LeadsFlow junta tudo o que a sua equipa de vendas precisa num só lugar: os contactos, as conversas e o funil de vendas.

CAIXA DE ENTRADA ÚNICA
Responda a clientes do WhatsApp Business, Instagram, Facebook Messenger, Telegram e email numa só caixa de entrada. Envie fotos, áudios e documentos, e receba uma notificação sempre que um cliente escreve.

LEADS ORGANIZADOS
Todos os contactos num só sítio, com origem, estado, notas e histórico. Importe listas, pesquise em segundos e nunca perca um seguimento.

FUNIL DE VENDAS
Veja em que etapa está cada negócio e mova os leads à medida que avançam, até ao fecho.

ASSISTENTES DE IA
Assistentes virtuais respondem aos clientes 24 horas por dia, recolhem dados, marcam tarefas e movem os leads no funil por si.

CAMPANHAS E REMARKETING
Envie campanhas por WhatsApp e email e crie fluxos automáticos que voltam a falar com quem parou de responder.

TAREFAS E LEMBRETES
Agende chamadas e seguimentos, ligados ao Google Calendar, e receba um lembrete na hora certa.

RELATÓRIOS
Acompanhe leads novos, conversões e o valor do funil.

FUNCIONA EM QUALQUER LUGAR
Use no telemóvel ou no computador (app.leadsflowapi.com), com os mesmos dados. Sem rede, o app continua a mostrar o que já carregou e envia as suas mensagens quando a ligação volta.

O LeadsFlow é usado por pequenas e médias empresas que vendem por WhatsApp e redes sociais. Crie a sua conta gratuita e comece hoje.
```

**Imagens** (Presença na loja → Recursos gráficos):
- Ícone 512×512 PNG (sem cantos arredondados; a Google arredonda).
- Imagem de destaque 1024×500 PNG/JPG.
- Capturas do telemóvel: 4 a 8, retrato (ex.: 1080×2340). Sugestão de ecrãs, em modo claro,
  com dados de demonstração (nunca de clientes reais):
  1. Início (estatísticas) 2. Caixa de entrada 3. Conversa aberta 4. Funil
  5. Lista de leads 6. Assistentes de IA 7. Tarefas 8. Relatórios

**Categoria:** Empresas · **Etiquetas:** CRM, Vendas, Mensagens
**Contactos:** email de suporte, site `https://app.leadsflowapi.com`
**Política de privacidade:** `https://app.leadsflowapi.com/privacidade`

## 3. Conteúdo da app (Política → Conteúdo da app)

**Acesso à app** → "Todas ou algumas funcionalidades estão restritas" → criar uma **conta de
demonstração** só para a revisão (email + palavra-passe, com dados fictícios) e dar as
instruções: "Entrar com estas credenciais. A caixa de entrada, os leads e o funil têm dados de
demonstração." Nunca a conta de um cliente.

**Anúncios:** Não, a app não contém anúncios.

**Classificação de conteúdo** (questionário IARC): categoria **Utilitários, produtividade,
comunicação ou outra**. Respostas: sem violência, sem conteúdo sexual, sem linguagem ofensiva,
sem drogas, sem jogos de azar. **Os utilizadores podem comunicar entre si: Sim** (mensagens
com clientes). **Partilha a localização: Não.** **Compras digitais: Sim** (subscrições dos
planos LeadsFlow processadas pelo Google Play Billing).

**Público-alvo:** **18 anos ou mais** (app para empresas). Não apela a crianças.

**Aplicação de notícias:** Não. **Rastreio de contactos COVID:** Não. **App governamental:** Não.

**Funcionalidades financeiras:** Nenhuma.

**Saúde:** Nenhuma.

**Segurança dos dados** (o que a app recolhe; tudo cifrado em trânsito, HTTPS):

| Tipo de dados | Recolhido | Partilhado | Finalidade | Opcional |
|---|---|---|---|---|
| Nome, email, telefone (conta) | Sim | Não | Funcionalidade da app, gestão da conta | Não |
| Mensagens (conversas com clientes) | Sim | Não* | Funcionalidade da app | Não |
| Fotos e vídeos (anexos, foto de perfil) | Sim | Não* | Funcionalidade da app | Sim |
| Ficheiros de áudio (mensagens de voz) | Sim | Não* | Funcionalidade da app | Sim |
| Ficheiros e documentos (anexos, importações) | Sim | Não* | Funcionalidade da app | Sim |
| IDs do dispositivo (token de notificações) | Sim | Não | Funcionalidade da app (notificações) | Sim |
| Histórico de compras (plano, estado e referência da subscrição) | Sim | Não | Gestão da subscrição | Não |
| Registos de falhas / diagnósticos | Não | — | — | — |
| Localização, contactos do telemóvel, saúde, finanças | Não | — | — | — |

\* As mensagens e anexos vão para o canal escolhido pelo utilizador (WhatsApp, Instagram…) —
transferência iniciada pelo utilizador, que a Google não conta como "partilha". Os fornecedores
de IA e armazenamento atuam em nome do LeadsFlow (subcontratantes), o que também não é partilha.

- Os dados são encriptados em trânsito: **Sim**
- O utilizador pode pedir a eliminação dos dados: **Sim** →
  `https://app.leadsflowapi.com/privacidade#eliminacao-de-dados`

**Permissões sensíveis** (a Google pode perguntar):
- Câmara: tirar fotos para enviar nas conversas e para o perfil.
- Microfone: gravar mensagens de voz para os clientes.
- Notificações: avisos de mensagens de clientes, movimentos do funil e lembretes.

## 4. Teste fechado (obrigatório na conta pessoal)

1. Testar e lançar → **Teste fechado** → criar faixa (ex.: "Clientes").
2. Testadores: lista de emails de contas Google (≥ 12). Guardar a ligação de adesão e enviá-la.
3. Criar versão → carregar o AAB → notas da versão → rever e lançar.
4. Os 12 aderem pela ligação e instalam pela Play Store. Têm de **ficar inscritos 14 dias seguidos**.
5. Ao fim dos 14 dias: Painel → **Candidatar-se à produção** (perguntas sobre o teste).

Quem já tem o APK direto instalado: a Play Store não instala por cima (chaves diferentes) —
desinstalar o APK e instalar pela loja (inicia sessão de novo).

## 5. Variantes do app

- `play` (loja): atualiza-se pela Play Store; sem `REQUEST_INSTALL_PACKAGES`; o "Sobre o app" não oferece APKs.
- `direct` (APK distribuído à mão): atualiza-se sozinho (`npm run release:apk`).
- As atualizações do código (`npm run release:mobile`) chegam às duas.
