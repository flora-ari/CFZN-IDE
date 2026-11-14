import { createApp } from './app';
import { DEFAULT_PORT, LOCAL_HOST } from './config';

async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer from 1 to 65535.');
  }
  const app = await createApp();
  await app.listen(port, LOCAL_HOST);
  console.log(`CFZN-IDE API listening on http://${LOCAL_HOST}:${port}/api/v1`);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
