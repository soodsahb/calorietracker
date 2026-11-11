import { describe, it, expect, vi } from 'vitest';
import { setup, env, token, analyzeReq } from './helpers';
import { MemoryStore, KVStore, DurableObjectStore, RateLimiterDO, storeFromEnv } from '../src/middleware/rateLimit';

describe('rate limiting', () => {
  it('21st request in an hour -> 429 with Retry-After', async () => {
    let now = 1_700_000_000_000;
    const s = setup({ now: () => now });
    const t = await token();
    for (let i = 0; i < 20; i++) {
      const r = await s.app.request(analyzeReq({ token: t, headers: { 'cf-connecting-ip': `198.51.100.${i}` } }), {}, env);
      expect(r.status).toBe(200);
    }
    const r = await s.app.request(analyzeReq({ token: t, headers: { 'cf-connecting-ip': '198.51.100.99' } }), {}, env);
    expect(r.status).toBe(429);
    const ra = Number(r.headers.get('retry-after'));
    expect(ra).toBeGreaterThan(0);
    expect(ra).toBeLessThanOrEqual(3600);
    // another token is unaffected
    const t2 = await token();
    expect((await s.app.request(analyzeReq({ token: t2 }), {}, env)).status).toBe(200);
  });

  it('daily cap of 100 per token', async () => {
    let now = Math.floor(1_700_000_000_000 / 86_400_000) * 86_400_000;
    const s = setup({ now: () => now });
    const t = await token();
    let ok = 0;
    for (let h = 0; h < 6; h++) {
      for (let i = 0; i < 20; i++) {
        const ip = `198.51.${h}.${i}`;
        const r = await s.app.request(analyzeReq({ token: t, headers: { 'cf-connecting-ip': ip } }), {}, env);
        if (r.status === 200) ok++;
      }
      now += 3600_000;
    }
    expect(ok).toBeLessThanOrEqual(100);
    expect(ok).toBeGreaterThanOrEqual(80);
  });

  it('per-IP limit 60/hour across tokens', async () => {
    const s = setup();
    let last = 0;
    for (let i = 0; i < 61; i++) {
      const t = await token();
      last = (await s.app.request(analyzeReq({ token: t }), {}, env)).status;
    }
    expect(last).toBe(429);
  });

  it('register is IP rate limited too', async () => {
    const s = setup();
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await s.app.request('/v1/register', { method: 'POST', headers: { 'cf-connecting-ip': '1.1.1.1' } }, env)).status;
    expect(last).toBe(429);
  });

  it('counter keys contain hashes, not raw IP or token', async () => {
    const keys: string[] = [];
    const store = { incr: async (k: string) => (keys.push(k), 1) };
    const s = setup({ store });
    const t = await token();
    await s.app.request(analyzeReq({ token: t }), {}, env);
    expect(keys.length).toBe(3);
    for (const k of keys) {
      expect(k).not.toContain('203.0.113.7');
      expect(k).not.toContain(t.split('.')[1]!);
    }
  });
});

describe('stores', () => {
  it('MemoryStore counts and expires', async () => {
    let now = 0;
    const m = new MemoryStore(() => now);
    expect(await m.incr('a', 10)).toBe(1);
    expect(await m.incr('a', 10)).toBe(2);
    now = 11_000;
    expect(await m.incr('a', 10)).toBe(1);
    for (let i = 0; i < 10_001; i++) await m.incr('k' + i, 1);
    now = 100_000;
    await m.incr('z', 1);
  });

  it('KVStore increments with expirationTtl', async () => {
    const data = new Map<string, string>();
    const kv = { get: vi.fn(async (k: string) => data.get(k) ?? null), put: vi.fn(async (k: string, v: string) => void data.set(k, v)) };
    const s = new KVStore(kv as unknown as KVNamespace);
    expect(await s.incr('k', 3600)).toBe(1);
    expect(await s.incr('k', 3600)).toBe(2);
    expect(kv.put).toHaveBeenLastCalledWith('k', '2', { expirationTtl: 3600 });
  });

  it('DurableObjectStore + RateLimiterDO', async () => {
    const storage = new Map<string, unknown>();
    const setAlarm = vi.fn();
    const state = { storage: { get: async (k: string) => storage.get(k), put: async (k: string, v: unknown) => void storage.set(k, v), setAlarm, deleteAll: async () => storage.clear() } };
    const dobj = new RateLimiterDO(state as unknown as DurableObjectState);
    const ns = { idFromName: (n: string) => n, get: () => ({ fetch: (u: string, i: RequestInit) => dobj.fetch(new Request(u, i)) }) };
    const s = new DurableObjectStore(ns as unknown as DurableObjectNamespace);
    expect(await s.incr('k', 60)).toBe(1);
    expect(await s.incr('k', 60)).toBe(2);
    expect(setAlarm).toHaveBeenCalledTimes(1);
    await dobj.alarm();
    expect(storage.size).toBe(0);
  });

  it('storeFromEnv picks DO, KV, else memory', () => {
    expect(storeFromEnv({ ...env, RATE_LIMITER: {} as DurableObjectNamespace })).toBeInstanceOf(DurableObjectStore);
    expect(storeFromEnv({ ...env, RATE_LIMIT_KV: {} as KVNamespace })).toBeInstanceOf(KVStore);
    expect(storeFromEnv(env)).toBeInstanceOf(MemoryStore);
  });
});
