import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: process.env.PROTOTYPE_BASE ?? '/',
  plugins: [vue()],
  resolve: {
    alias: Object.fromEntries(['core', 'reference', 'vue', 'react'].map(name => [
      `@agentdown/${name}`, fileURLToPath(new URL(`../../packages/${name}/src/index.ts`, import.meta.url)),
    ])),
  },
  server: {
    host: '0.0.0.0', port: 5174, strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:8010', '/health': 'http://127.0.0.1:8010' },
  },
  build: {
    outDir: '../../dist-next/prototype', emptyOutDir: true,
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        vue: fileURLToPath(new URL('./vue.html', import.meta.url)),
        react: fileURLToPath(new URL('./react.html', import.meta.url)),
      },
    },
  },
});
