import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'node:path';
import { configDefaults } from 'vitest/config';

export default defineConfig({
  plugins: [vue()],
  test: {
    exclude: [...configDefaults.exclude, 'e2e/**', 'e2e-next/**', 'packages/**', 'tests/next/**', 'examples/**']
  },
  build: {
    assetsInlineLimit: 0,
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        'ag-ui': resolve(__dirname, 'src/entries/ag-ui.ts'),
        a2ui: resolve(__dirname, 'src/entries/a2ui.ts'),
        'ag-ui-a2ui': resolve(__dirname, 'src/entries/ag-ui-a2ui.ts')
      },
      name: 'Agentdown',
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => `${entryName}.${format === 'es' ? 'js' : 'cjs'}`,
      cssFileName: 'style'
    },
    rollupOptions: {
      external: [
        'vue',
        '@a2ui/web_core/v0_9',
        '@ag-ui/core',
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
