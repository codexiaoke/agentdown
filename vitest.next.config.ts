import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const alias = Object.fromEntries(['core', 'reference', 'vue', 'react'].map(name => [
  `@agentdown/${name}`, fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url)),
]));

export default defineConfig({
  resolve: { alias },
  test: {
    include: ['packages/**/*.test.{ts,tsx}', 'tests/next/**/*.test.{ts,tsx}'],
    environment: 'node',
    testTimeout: 10_000,
    hookTimeout: 10_000,
    restoreMocks: true,
  },
});
