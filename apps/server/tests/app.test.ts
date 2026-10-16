import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('CORS público do WenCine', () => {
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('permite preflight da URL pública usada pelos jogadores', async () => {
    app = await buildApp();
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/rooms',
      headers: {
        origin: 'https://wen-cine.vercel.app',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('https://wen-cine.vercel.app');
    expect(response.headers['access-control-allow-methods']).toContain('POST');
  });

  it('continua bloqueando origens externas desconhecidas', async () => {
    app = await buildApp();
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/rooms',
      headers: {
        origin: 'https://site-aleatorio.example',
        'access-control-request-method': 'POST',
      },
    });

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
