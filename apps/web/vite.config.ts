import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const apiProxy = { '/api': 'http://127.0.0.1:3001' };

export default defineConfig({
  publicDir: fileURLToPath(new URL('../../.runtime/web-openblock/', import.meta.url)),
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: apiProxy },
  preview: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: apiProxy },
  build: {
    rollupOptions: {
      input: {
        app: fileURLToPath(new URL('./index.html', import.meta.url)),
        editor: fileURLToPath(new URL('./openblock.html', import.meta.url)),
      },
    },
  },
});
