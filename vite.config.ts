import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: {
    // Hora do build. O script release:mobile passa APP_BUILD_TIME para que o pacote e o
    // registo na API tenham exatamente o mesmo valor (ver src/live-update.ts).
    __APP_BUILD_TIME__: JSON.stringify(Number(process.env.APP_BUILD_TIME) || Date.now()),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@app': path.resolve(__dirname, './src/app'),
    },
  },
  css: {
    postcss: './postcss.config.js',
  },
  server: {
    port: 3200,
    host: true,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    port: 3200,
    host: true,
    strictPort: true,
    allowedHosts: true,
  },
  // Strip console.log/warn/info/debug from production bundles.
  // console.error is intentionally kept for runtime error visibility.
  esbuild: mode === 'production'
    ? { drop: ['debugger'], pure: ['console.log', 'console.info', 'console.warn', 'console.debug'] }
    : {},
}));
