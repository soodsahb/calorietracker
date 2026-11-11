import { Hono } from 'hono';
import { consoleLogger } from './logger';
import { securityHeaders } from './middleware/securityHeaders';
import { auth } from './middleware/auth';
import { ipRateLimit, tokenRateLimit, type RateLimitStore } from './middleware/rateLimit';
import { readLimitedBody } from './middleware/bodyLimit';
import { issueToken } from './token';
import { analyse, toBase64 } from './gemini';
import { repairAnalysis } from './repair';
import { HttpError, validateImage, validateNote, validatePreviousItems } from './validate';
import { MAX_BODY_BYTES } from './config';
import type { Env, FetchLike, Logger, Vars } from './types';

export { RateLimiterDO } from './middleware/rateLimit';

export interface AppDeps {
  /** Injectable Gemini fetch (tests mock this). */
  geminiFetch?: FetchLike;
  store?: RateLimitStore;
  logger?: Logger;
  now?: () => number;
  geminiTimeoutMs?: number;
}

const err = (status: number, code: string, message: string) => ({ error: code, message, status });

export function createApp(deps: AppDeps = {}) {
  const app = new Hono<{ Bindings: Env; Variables: Vars }>();
  const logger = deps.logger ?? consoleLogger;
  const now = deps.now ?? Date.now;
  const rl = { store: deps.store, now: deps.now };

  app.use('*', securityHeaders);

  // PII-free access log: whitelisted fields only.
  app.use('*', async (c, next) => {
    const start = now();
    c.set('requestId', crypto.randomUUID());
    try {
      await next();
    } finally {
      const path = new URL(c.req.url).pathname;
      const known = ['/healthz', '/v1/register', '/v1/analyze'].includes(path) ? path : '(other)';
      logger.log({
        requestId: c.get('requestId'),
        route: `${c.req.method} ${known}`,
        status: c.res.status,
        latencyMs: now() - start,
        tokenPrefix: c.get('tokenPrefix'),
        imageBytes: c.get('imageBytes'),
        itemCount: c.get('itemCount'),
      });
    }
  });

  app.get('/healthz', (c) => c.json({ ok: true }));

  app.post('/v1/register', ipRateLimit(rl, 'reg'), async (c) => {
    return c.json({ token: await issueToken(c.env.TOKEN_HMAC_SECRET) });
  });

  app.post('/v1/analyze', auth, ipRateLimit(rl, 'an'), tokenRateLimit(rl), async (c) => {
    if (c.env.KILL_SWITCH === '1' || c.env.KILL_SWITCH === 'true') {
      throw new HttpError(503, 'service_unavailable', 'Service temporarily unavailable.');
    }
    const ct = c.req.header('content-type') ?? '';
    if (!/^multipart\/form-data/i.test(ct)) {
      throw new HttpError(415, 'unsupported_media_type', 'Expected multipart/form-data.');
    }
    const raw = await readLimitedBody(c.req.raw, MAX_BODY_BYTES);
    let form: FormData;
    try {
      form = await new Response(raw as unknown as BodyInit, { headers: { 'content-type': ct } }).formData();
    } catch {
      throw new HttpError(400, 'invalid_request', 'Malformed request.');
    }
    const file = form.get('image');
    if (!file || typeof file === 'string') throw new HttpError(400, 'invalid_request', 'Image is required.');
    const note = validateNote(form.get('note') ?? undefined);
    const previousItems = validatePreviousItems(form.get('previousItems') ?? undefined);
    const img = validateImage(new Uint8Array(await file.arrayBuffer()), file.type);
    c.set('imageBytes', img.bytes.length);

    const result = await analyse(
      {
        fetch: deps.geminiFetch ?? ((u, i) => fetch(u, i)),
        apiKey: c.env.GEMINI_API_KEY,
        timeoutMs: deps.geminiTimeoutMs,
      },
      { imageBase64: toBase64(img.bytes), mime: img.mime, note, previousItems },
    );
    const repaired = repairAnalysis(result);
    c.set('itemCount', repaired.items.length);
    return c.json(repaired);
  });

  app.notFound((c) => c.json(err(404, 'not_found', 'Not found.'), 404));

  app.onError((e, c) => {
    if (e instanceof HttpError) {
      const retryAfter = (e as HttpError & { retryAfter?: number }).retryAfter;
      if (retryAfter) c.header('Retry-After', String(retryAfter));
      return c.json(err(e.status, e.code, e.message), e.status as 400);
    }
    return c.json(err(500, 'internal_error', 'Something went wrong.'), 500);
  });

  return app;
}

const app = createApp();
export default app;
