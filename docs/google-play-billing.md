# Google Play Billing

A variante `play` do Android usa exclusivamente o sistema de faturação da Google Play para os planos digitais. A web e a variante `direct` mantêm Stripe, PayPal e carteiras móveis.

## Catálogo na Play Console

Criar duas subscrições com estes identificadores:

| Plano | Produto | Plano base mensal | Plano base anual |
| --- | --- | --- | --- |
| Business | `leadsflow_business` | `monthly` | `annual` |
| Enterprise | `leadsflow_enterprise` | `monthly` | `annual` |

Os identificadores podem ser alterados pelas variáveis `GOOGLE_PLAY_*`. Os planos base têm de estar ativos e disponíveis nos países pretendidos. O preço apresentado no checkout vem sempre da Play Store; os valores da base de dados servem apenas para a página de comparação.

## Conta de serviço

1. Ligar um projeto Google Cloud à conta de programador da Play Console.
2. Criar uma conta de serviço e dar-lhe acesso à aplicação e às encomendas/subscrições.
3. Colocar o JSON completo, em base64 e numa só linha, em `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` no ambiente da API no Coolify.
4. Definir `GOOGLE_PLAY_ACCOUNT_SECRET` com um segredo aleatório estável. Não o mudar depois de existirem compras.
5. Confirmar `GOOGLE_PLAY_PACKAGE_NAME=com.leadsflowapi.app`.

Nenhuma credencial da conta de serviço entra no dashboard, no AAB ou no APK.

## Notificações de renovação

Configurar Real-time developer notifications para um tópico Pub/Sub. A subscrição push deve enviar para:

`https://api.leadsflowapi.com/api/plans/google-play/rtdn`

O push deve usar autenticação OIDC. Definir na API:

- `GOOGLE_PLAY_PUBSUB_AUDIENCE` com o audience configurado no Pub/Sub;
- `GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT_EMAIL` com o email da conta que assina o push.

A API volta a consultar a Google antes de conceder, renovar ou retirar acesso. A notificação nunca é aceite como prova de pagamento por si só.

## Publicação e teste

1. Executar `npm run android:sync` na raiz.
2. Gerar a variante Play (`bundlePlayRelease` para AAB ou `assemblePlayDebug` para teste).
3. Enviar primeiro para uma faixa de testes internos da Play Console.
4. Adicionar as contas Google dos testadores de licença.
5. Testar compra mensal/anual, pagamento pendente, restauro, cancelamento, período de tolerância e expiração.

O plugin de faturação e o `versionCode 8` exigem um novo AAB/APK; esta mudança não pode ser entregue apenas por atualização ao vivo.
