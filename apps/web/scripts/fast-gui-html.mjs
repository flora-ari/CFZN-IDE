import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const fastGuiToken = '__CCRAFT_FAST_GUI_URL__';
export function fastGuiUrl(manifest) {
  const entry = manifest?.fastGui;
  if (!entry || !/^[a-f0-9]{64}$/.test(entry.sha256) ||
    entry.url !== `/openblock-vendor/openblock-gui.${entry.sha256.slice(0, 16)}.js`) {
    throw new Error('Missing or invalid prepared fast GUI. Run prepare:openblock.');
  }
  return entry.url;
}
export function injectFastGui(html, manifest) {
  if (html.split(fastGuiToken).length !== 2) throw new Error('Expected exactly one fast GUI URL in entry HTML.');
  return html.replace(fastGuiToken, fastGuiUrl(manifest));
}
export function fastGuiHtmlPlugin(publicRoot) {
  let authEnabled = false;
  return { name: 'ccraft-fast-gui',
    configResolved(config) { authEnabled = config.env.VITE_IDE_AUTH === 'true'; },
    transformIndexHtml: { order: 'pre', handler(html, context) {
    if (/[/\\](login|sso)\.html$/.test(context.filename)) return html;
    const manifest = JSON.parse(readFileSync(join(publicRoot, 'openblock-vendor/manifest.json'), 'utf8'));
    const url = fastGuiUrl(manifest);
    if (!existsSync(join(publicRoot, url.slice(1)))) throw new Error('Prepared fast GUI file is missing.');
    return injectFastGui(html, manifest).replace('__CCRAFT_IDE_AUTH_REQUIRED__', String(authEnabled));
  } } };
}
