import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Абсолютный путь к контрактам — независим от cwd запуска vite
// (иначе относительный alias ломается, если dev-сервер поднят не из apps/web).
const contractsPath = fileURLToPath(
  new URL('../../packages/contracts/src/index.ts', import.meta.url),
);

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Windows: без host Vite слушает только IPv6 [::1],
    // из-за чего http://localhost:5173 (IPv4) не открывается.
    host: '0.0.0.0',
  },
  resolve: {
    alias: {
      '@finfury/contracts': contractsPath,
    },
  },
});