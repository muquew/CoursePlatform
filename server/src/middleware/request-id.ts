import { Elysia } from 'elysia';

export const requestId = (app: Elysia) =>
  app.derive(({ set }) => {
    const id = typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    set.headers['x-request-id'] = id;
    return { requestId: id };
  });
