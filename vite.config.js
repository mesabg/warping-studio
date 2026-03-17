import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: true,
    port: 5173
  },
  preview: {
    host: true,
    port: 4173
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(process.cwd(), 'index.html'),
        report: path.resolve(process.cwd(), 'report.html')
      }
    }
  },
  assetsInclude: ['**/*.wgsl']
});
