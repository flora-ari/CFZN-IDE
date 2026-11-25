import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
// @ts-expect-error Shared preparation/HTML helper is plain Node ESM.
import { fastGuiHtmlPlugin } from './scripts/fast-gui-html.mjs';

const apiProxy = { '/api': { target: 'http://127.0.0.1:3001', changeOrigin: false } };
const publicRoot = fileURLToPath(new URL('../../.runtime/web-openblock/', import.meta.url));

export default defineConfig({
  publicDir: publicRoot,
  plugins: [fastGuiHtmlPlugin(publicRoot)],
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true, proxy: apiProxy,
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.runtime/project-data/**'] },
  },
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
