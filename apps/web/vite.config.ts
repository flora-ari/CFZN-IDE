import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import type { Connect, Plugin } from 'vite';
// @ts-expect-error Shared preparation/HTML helper is plain Node ESM.
import { fastGuiHtmlPlugin } from './scripts/fast-gui-html.mjs';

const apiProxy = { '/api': { target: 'http://127.0.0.1:3001', changeOrigin: false } };
const publicRoot = fileURLToPath(new URL('../../.runtime/web-openblock/', import.meta.url));

function idePageRoutes(): Plugin {
  const rewrite: Connect.NextHandleFunction = (request, _response, next) => {
    const match = /^\/(login|sso)(\?.*)?$/.exec(request.url ?? '');
    if (match) request.url = `/${match[1]}.html${match[2] ?? ''}`;
    next();
  };
  return {
    name: 'ccraft-ide-pages',
    configureServer(server) { server.middlewares.use(rewrite); },
    configurePreviewServer(server) { server.middlewares.use(rewrite); },
  };
}

export default defineConfig({
  publicDir: publicRoot,
  plugins: [idePageRoutes(), fastGuiHtmlPlugin(publicRoot)],
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
        login: fileURLToPath(new URL('./login.html', import.meta.url)),
        sso: fileURLToPath(new URL('./sso.html', import.meta.url)),
      },
    },
  },
});
