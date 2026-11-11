import type { MiddlewareHandler } from 'hono';
import { verifyToken, tokenPrefix } from '../token';
import { HttpError } from '../validate';
import type { Env, Vars } from '../types';

export const auth: MiddlewareHandler<{ Bindings: Env; Variables: Vars }> = async (c, next) => {
  const h = c.req.header('authorization') ?? '';
  const m = /^Bearer (\S+)$/.exec(h);
  const t = m?.[1] ? await verifyToken(c.env.TOKEN_HMAC_SECRET, m[1]) : null;
  if (!m?.[1] || !t) throw new HttpError(401, 'unauthorized', 'Unauthorized.');
  c.set('tokenId', t.id);
  c.set('tokenPrefix', await tokenPrefix(m[1]));
  await next();
};
