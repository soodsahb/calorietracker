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
  return sha256Hex(`${secret}|ip|${ipBucket(ip)}`);
}

/**
 * Rate-limit identity for an address. IPv6 clients usually control a whole /64 (2^64 addresses),
 * so per-address IPv6 keys are trivially bypassed by rotating addresses: bucket IPv6 by /64.
 * IPv4 (and IPv4-mapped IPv6) is keyed per address.
 */
export function ipBucket(raw: string): string {
  const ip = raw.trim().toLowerCase();
  if (!ip.includes(':')) return ip;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  if (mapped?.[1]) return mapped[1];
  const [head = '', tail] = ip.split('::', 2);
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const groups = tail === undefined ? h : [...h, ...Array<string>(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  if (groups.length < 4 || groups.slice(0, 4).some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return ip;
  return `${groups.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(':')}::/64`;
}

/** Global daily cap across all clients (spend guard). Throws 503 once `cap` analyses happened today. */
export async function enforceGlobalDailyCap(store: RateLimitStore, cap: number, now: number): Promise<void> {
  if (!(cap > 0)) return;
  const bucket = Math.floor(now / 1000 / 86400);
  const count = await store.incr(`global-d:all:${bucket}`, 86400);
  if (count > cap) throw new HttpError(503, 'service_unavailable', 'Service temporarily unavailable.');
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
