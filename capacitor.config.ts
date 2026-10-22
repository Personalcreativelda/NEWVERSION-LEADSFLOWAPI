import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.leadsflowapi.app',
  appName: 'LeadsFlow',
  webDir: 'dist',
  server: {
    // O app é servido localmente como https://app.leadsflowapi.com, origem que a API já
    // aceita no CORS. Sem isto a origem seria https://localhost e a API bloquearia os pedidos.
    androidScheme: 'https',
    hostname: 'app.leadsflowapi.com',
    // Páginas de pagamento abertas dentro do próprio app (sem saltar para o Chrome).
    // No fim o Stripe devolve para https://app.leadsflowapi.com/..., servido localmente.
    // Manter em sincronia com IN_APP_HOSTS em src/native.ts.
    allowNavigation: [
      'checkout.stripe.com',
      'billing.stripe.com',
      'stripe.com',
      '*.stripe.com',
      'paypal.com',
      '*.paypal.com',
    ],
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      // O app esconde o splash quando o ecrã de abertura em HTML (mesmo azul) já está
      // pintado; sem fade, a troca é imediata (ver finishBootScreen em src/native.ts).
      launchAutoHide: false,
      launchFadeOutDuration: 0,
      backgroundColor: '#2563EB',
      showSpinner: false,
    },
    // Atualizações ao vivo auto-hospedadas (src/live-update.ts + /api/version/mobile).
    // Modo manual: nada é pedido aos servidores da Capgo, e statsUrl vazio desliga o
    // envio de estatísticas para eles.
    CapacitorUpdater: {
      autoUpdate: false,
      statsUrl: '',
      appReadyTimeout: 10000,
      // APK novo instalado → volta ao código que vem dentro dele
      resetWhenUpdate: true,
      // Pacotes que falharam ficam na lista para não serem descarregados outra vez
      autoDeleteFailed: false,
      autoDeletePrevious: true,
    },
  },
};

export default config;
