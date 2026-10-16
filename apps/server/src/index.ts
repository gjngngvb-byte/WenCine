import 'dotenv/config';
import { buildApp } from './app.js';
import { attachRealtime } from './realtime/attachRealtime.js';

const port = Number(process.env.SERVER_PORT ?? 4000);
const host = process.env.SERVER_HOST ?? '0.0.0.0';
const app = await buildApp();
const allowedOrigins = (process.env.APP_ORIGIN ?? 'http://localhost:3000')
  .split(',').map((origin) => origin.trim()).filter(Boolean);
attachRealtime(app.server, allowedOrigins);

try {
  await app.listen({ port, host });
  app.log.info({ host, port }, 'WenCine API e tempo real iniciados');
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
