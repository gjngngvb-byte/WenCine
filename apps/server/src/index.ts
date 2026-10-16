import 'dotenv/config';
import { buildApp } from './app.js';

const port = Number(process.env.SERVER_PORT ?? 4000);
const host = process.env.SERVER_HOST ?? '0.0.0.0';
const app = await buildApp();

try {
  await app.listen({ port, host });
  app.log.info({ host, port }, 'WenCine API iniciada');
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
