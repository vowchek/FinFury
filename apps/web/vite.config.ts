import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

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
      '@vowchek/contracts': '../../packages/contracts/src/index.ts',
    },
  },
});