import type { MiddlewareHandler } from 'hono';
import { sha256Hex } from '../crypto';
import { HttpError } from '../validate';
import { LIMITS } from '../config';
import type { Env, Vars } from '../types';

/** Atomic-ish counter store. incr returns the new count for key; key expires after ttlSec. */
export interface RateLimitStore {
  incr(key: string, ttlSec: number): Promise<number>;
}

export class MemoryStore implements RateLimitStore {
  private m = new Map<string, { count: number; exp: number }>();
  constructor(private now: () => number = () => Date.now()) {}
  async incr(key: string, ttlSec: number): Promise<number> {
    const t = this.now();
    if (this.m.size > 10_000) for (const [k, v] of this.m) if (v.exp <= t) this.m.delete(k);
    const e = this.m.get(key);
    if (!e || e.exp <= t) {
      this.m.set(key, { count: 1, exp: t + ttlSec * 1000 });
      return 1;
    }
    e.count++;
    return e.count;
  }
}

/** Workers KV store: eventually consistent (approximate), fine as a throttle. */
export class KVStore implements RateLimitStore {
  constructor(private kv: KVNamespace) {}
  async incr(key: string, ttlSec: number): Promise<number> {
    const cur = parseInt((await this.kv.get(key)) ?? '0', 10) || 0;
    const next = cur + 1;
    await this.kv.put(key, String(next), { expirationTtl: Math.max(60, ttlSec) });
    return next;
  }
}

/** Durable Object backed store: one object per counter key, strongly consistent. */
export class DurableObjectStore implements RateLimitStore {
  constructor(private ns: DurableObjectNamespace) {}
  async incr(key: string, ttlSec: number): Promise<number> {
    const stub = this.ns.get(this.ns.idFromName(key));
    const res = await stub.fetch('https://rl/incr?ttl=' + ttlSec, { method: 'POST' });
    return ((await res.json()) as { count: number }).count;
  }
}

export class RateLimiterDO {
  constructor(private state: DurableObjectState) {}
  async fetch(req: Request): Promise<Response> {
    const ttl = Number(new URL(req.url).searchParams.get('ttl')) || 3600;
    const count = ((await this.state.storage.get<number>('c')) ?? 0) + 1;
    await this.state.storage.put('c', count);
    if (count === 1) await this.state.storage.setAlarm(Date.now() + ttl * 1000);
    return Response.json({ count });
  }
  async alarm(): Promise<void> {
    await this.state.storage.deleteAll();
  }
}

let memorySingleton: MemoryStore | undefined;
export function storeFromEnv(env: Env): RateLimitStore {
  if (env.RATE_LIMITER) return new DurableObjectStore(env.RATE_LIMITER);
  if (env.RATE_LIMIT_KV) return new KVStore(env.RATE_LIMIT_KV);
  return (memorySingleton ??= new MemoryStore());
}

type Rule = { name: string; id: string; max: number; windowSec: number };

async function enforce(store: RateLimitStore, rules: Rule[], now: number): Promise<void> {
  for (const r of rules) {
    const bucket = Math.floor(now / 1000 / r.windowSec);
    // Keys contain only hashes (never raw IPs/tokens); TTL <= 24h.
    const count = await store.incr(`${r.name}:${r.id}:${bucket}`, r.windowSec);
    if (count > r.max) {
      const retryAfter = Math.max(1, r.windowSec - (Math.floor(now / 1000) % r.windowSec));
      const e = new HttpError(429, 'rate_limited', 'Too many requests.');
      (e as HttpError & { retryAfter?: number }).retryAfter = retryAfter;
      throw e;
    }
  }
}

export interface RateLimitDeps {
  store?: RateLimitStore;
  now?: () => number;
}

export function ipHash(secret: string, ip: string) {
  return sha256Hex(`${secret}|ip|${ip}`);
}

/** Per-IP limiter (used on /v1/register and /v1/analyze). */
export const ipRateLimit =
  (deps: RateLimitDeps, scope: string): MiddlewareHandler<{ Bindings: Env; Variables: Vars }> =>
  async (c, next) => {
    const store = deps.store ?? storeFromEnv(c.env);
    const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
    const id = (await ipHash(c.env.TOKEN_HMAC_SECRET, ip)).slice(0, 32);
    await enforce(store, [{ name: `ip-${scope}`, id, ...LIMITS.ipHour }], (deps.now ?? Date.now)());
    await next();
  };

/** Per-token limiter; requires auth middleware to have set tokenId. */
export const tokenRateLimit =
  (deps: RateLimitDeps): MiddlewareHandler<{ Bindings: Env; Variables: Vars }> =>
  async (c, next) => {
    const store = deps.store ?? storeFromEnv(c.env);
    const id = (await sha256Hex(c.get('tokenId') ?? '')).slice(0, 32);
    await enforce(
      store,
      [
        { name: 'tok-h', id, ...LIMITS.tokenHour },
        { name: 'tok-d', id, ...LIMITS.tokenDay },
      ],
      (deps.now ?? Date.now)(),
    );
    await next();
  };
