import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.leadsflowapi.app',
  appName: 'LeadsFlow',
  webDir: 'dist',
  android: {
    // O app é servido em https://localhost — adicionar esta origem ao CORS_ORIGINS da API.
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
