import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [vue()],
  build: {
    assetsInlineLimit: 0,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'Agentdown',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
      cssFileName: 'style'
    },
    rollupOptions: {
      external: [
        'vue',
        '@chenglou/pretext',
        'highlight.js',
        'katex',
        'mermaid',
        'markdown-it',
        'markdown-it-container',
        'markdown-it-math/no-default-renderer'
      ]
    }
  }
});
