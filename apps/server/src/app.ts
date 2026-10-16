import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { registerRoomRoutes } from './rooms/routes.js';

export async function buildApp() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
    bodyLimit: 1_048_576,
    trustProxy: process.env.TRUST_PROXY === 'true',
  });
  const allowedOrigins = (process.env.APP_ORIGIN ?? 'http://localhost:3000')
    .split(',').map((origin) => origin.trim()).filter(Boolean);
  await app.register(helmet);
  const isVercelProjectOrigin = (origin: string | undefined) =>
    !origin || allowedOrigins.includes(origin) ||
    origin === 'https://wen-cine.vercel.app' ||
    /^https:\/\/wen-cine-[a-z0-9-]+-ciels-projects-9299fbb3\.vercel\.app$/.test(origin);
  await app.register(cors, {
    origin: (origin, callback) => callback(null, isVercelProjectOrigin(origin)),
    credentials: true,
  });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  app.get('/health', async () => ({ status: 'ok', service: 'wencine-server' }));
  await registerRoomRoutes(app);
  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'Erro não tratado na requisição');
    const statusCode = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
    return reply.status(statusCode).send({
      error: statusCode === 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR',
      message: statusCode === 500 ? 'Ocorreu um erro interno.' : error.message,
    });
  });
  return app;
}
