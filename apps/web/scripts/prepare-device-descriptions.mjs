import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

// Evaluate only pinned, integrity-checked upstream descriptions at build time.
// No VM source is rewritten, shipped as a second engine, or executed against hardware.
export async function prepareDeviceDescriptions(mapText, destination) {
  const map = JSON.parse(mapText);
  const source = suffix => {
    const i = map.sources.findIndex(s => s.endsWith(`/openblock-vm/src/${suffix}.js`));
    if (i < 0) throw new Error(`Missing pinned description source: ${suffix}`);
    return map.sourcesContent[i];
  };
  const hashes = {};
  const evaluate = path => {
    const text = source(path); hashes[path] = createHash('sha256').update(text).digest('hex');
    const module = { exports: {} };
    runInNewContext(text, { module, require: id => {
      if (id === 'format-message') return value => value.default;
      if (id.endsWith('/common-peripheral') || id.endsWith('/arduino-peripheral')) return class {};
      if (id.includes('/extension-support/')) return evaluate(`extension-support/${id.split('/').at(-1)}`);
      throw new Error(`Unexpected description dependency ${id}`);
    } }, { timeout: 1000 });
    return module.exports;
  };
  const descriptions = {};
  for (const id of ['arduinoUno', 'arduinoEsp32', 'arduinoEsp32S3']) {
    const Device = evaluate(`devices/${id}/${id}`);
    descriptions[id] = Device.prototype.getInfo.call(Device.prototype);
  }
  await writeFile(destination, `${JSON.stringify({ upstream: '0.1.0-prerelease.20250611102354', hashes, descriptions }, null, 2)}\n`);
}
