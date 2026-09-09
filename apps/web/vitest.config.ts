import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Абсолютный путь к контрактам — как в vite.config.ts, чтобы тесты
// резолвили workspace-пакет независимо от cwd.
const contractsPath = fileURLToPath(
  new URL('../../packages/contracts/src/index.ts', import.meta.url),
);

export default defineConfig({
  resolve: {
    alias: {
      '@finfury/contracts': contractsPath,
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});