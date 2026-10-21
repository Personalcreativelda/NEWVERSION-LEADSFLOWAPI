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
      launchShowDuration: 1500,
      backgroundColor: '#0f0f14',
      showSpinner: false,
    },
  },
};

export default config;
