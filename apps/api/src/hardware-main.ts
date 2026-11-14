import { createHardwareApp } from './hardware/app';
import { loadHardwareConfig } from './hardware/config';

async function main(): Promise<void> {
  const port = Number(process.env.HARDWARE_PORT ?? '3002');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('HARDWARE_PORT must be from 1 to 65535.');
  const app = await createHardwareApp(await loadHardwareConfig());
  app.enableShutdownHooks(['SIGINT', 'SIGTERM']);
  await app.listen(port, '127.0.0.1');
  console.log(`CFZN hardware executor listening on http://127.0.0.1:${port}/api/v1/hardware`);
}
void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
