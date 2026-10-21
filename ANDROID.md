# LeadsFlow — versão Android (Capacitor)

Esta pasta é uma cópia do projeto web na branch `android`. O app Android é o mesmo frontend React,
empacotado com [Capacitor](https://capacitorjs.com) e ligado à API de produção.

## Pré-requisitos (uma vez só)

1. Instalar o **Android Studio** — https://developer.android.com/studio (já inclui o JDK e o Android SDK).
2. Abrir o Android Studio uma vez e deixar terminar o download do SDK.
3. (Opcional) O app já usa a origem `https://app.leadsflowapi.com`; só é preciso mexer no `CORS_ORIGINS`
   se mudar o `hostname` em `capacitor.config.ts`.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run build:android` | Build do frontend com `.env.android` (API de produção) |
| `npm run android:sync` | Build + copia para o projeto Android |
| `npm run android:open` | Abre o projeto no Android Studio |
| `npm run android:run` | Build + instala num telemóvel/emulador ligado |

## Gerar o APK

```bash
npm run android:sync
npm run android:open
```

No Android Studio: **Build → Build App Bundle(s) / APK(s) → Build APK(s)**.
O ficheiro fica em `android/app/build/outputs/apk/debug/app-debug.apk`.

### Pela linha de comando (sem abrir o Android Studio)

O projeto usa Gradle 9.1 + Android Gradle Plugin 8.13, compatíveis com o Java 25 que vem com o
Android Studio. Em Git Bash:

```bash
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
export TEMP='C:\tmp\jtmp' TMP='C:\tmp\jtmp'
export JAVA_TOOL_OPTIONS='-Djdk.net.unixdomain.tmpdir=C:\tmp\jtmp -Djava.io.tmpdir=C:\tmp\jtmp'
cd android && ./gradlew assembleDebug
```

O `TEMP` curto evita o erro `Unable to establish loopback connection` do Java 25 no Windows.
`android/local.properties` (não versionado) deve conter
`sdk.dir=C:/Users/<utilizador>/AppData/Local/Android/Sdk`, com barras `/`.

Para a Play Store use **Build → Generate Signed App Bundle** (ficheiro `.aab`).
Guarde a keystore num lugar seguro — sem ela não é possível publicar atualizações.

## Configuração

- `capacitor.config.ts` — id do app (`com.leadsflowapi.app`), nome, splash screen. O app corre como `https://app.leadsflowapi.com` (origem já aceite pelo CORS da API).
- `.env.android` — `VITE_API_URL` usada no build Android.
- `src/native.ts` — botão voltar do Android, status bar, splash screen.
- `android/app/src/main/AndroidManifest.xml` — permissões (internet, microfone, câmara, notificações).
- `src/app/utils/theme.ts` — tema claro/escuro segue o telemóvel até o utilizador escolher no ☀/🌙.
- Ecrã de abertura: splash nativo (`res/values*/splash_colors.xml`, `styles.xml`) + ecrã HTML
  `#app-boot` em `index.html`, escondido por `finishBootScreen` em `src/native.ts`.

## Ícone e splash

Gerados a partir de `assets/logo.svg` (raio do logotipo). Depois de alterar o logo:

```bash
npx sharp-cli -i assets/logo.svg -o assets/logo.png resize 1024 1024
npx @capacitor/assets generate --android --iconBackgroundColor '#2563EB' --iconBackgroundColorDark '#1D4ED8' --splashBackgroundColor '#2563EB' --splashBackgroundColorDark '#1E3A8A'
```

(`@capacitor/assets` não está no `package.json` de propósito: traz o `sharp`, que atrasaria
o `npm ci` do build do site.)

## Próximos passos

- Notificações push: integrar Firebase Cloud Messaging com `@capacitor/push-notifications`
  (as notificações do navegador não funcionam dentro do app).
