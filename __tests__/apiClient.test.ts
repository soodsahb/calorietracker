import { createApiClient, ApiError, TokenStore } from '@/api/client';

const goodAnalysis = {
  items: [{ name: 'Rice', grams: 150, kcalPer100g: 130, proteinPer100g: 2.7, carbsPer100g: 28, fatPer100g: 0.3, confidence: 0.9 }],
  needsClarification: false, clarifyingQuestion: null, suggestedAnswers: [], notFood: false,
};
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

function memStore(initial: string | null = 'tok'): TokenStore & { value: string | null } {
  const s = {
    value: initial,
    get: async () => s.value,
    set: async (t: string) => { s.value = t; },
    clear: async () => { s.value = null; },
  };
  return s;
}
const mk = (fetchImpl: jest.Mock, store = memStore(), extra = {}) =>
  createApiClient({ baseUrl: 'https://api.test/', tokenStore: store, fetchImpl: fetchImpl as any, sleep: async () => {}, ...extra });
const input = { imageUri: 'file:///x.jpg' };

describe('api client', () => {
  it('POSTs multipart with bearer token and parses analysis', async () => {
    const f = jest.fn().mockResolvedValue(json(goodAnalysis));
    const out = await mk(f).analyze({ ...input, note: ' no sugar ' });
    expect(out.items[0].name).toBe('Rice');
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://api.test/v1/analyze');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers['Content-Type']).toBeUndefined(); // boundary set by runtime
  });

  it('registers when no token, stores it', async () => {
    const store = memStore(null);
    const f = jest.fn()
      .mockResolvedValueOnce(json({ token: 'new' }))
      .mockResolvedValueOnce(json(goodAnalysis));
    await mk(f, store).analyze(input);
    expect(f.mock.calls[0][0]).toBe('https://api.test/v1/register');
    expect(store.value).toBe('new');
    expect(f.mock.calls[1][1].headers.Authorization).toBe('Bearer new');
  });

  it('re-registers once on 401 then retries', async () => {
    const store = memStore('old');
    const f = jest.fn()
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({ token: 'fresh' }))
      .mockResolvedValueOnce(json(goodAnalysis));
    await mk(f, store).analyze(input);
    expect(store.value).toBe('fresh');
    expect(f).toHaveBeenCalledTimes(3);
  });

  it('401 twice -> unauthorized', async () => {
    const f = jest.fn()
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({ token: 'fresh' }))
      .mockResolvedValueOnce(json({}, 401));
    await expect(mk(f).analyze(input)).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('maps 429 with Retry-After', async () => {
    const f = jest.fn().mockResolvedValue(json({}, 429, { 'Retry-After': '120' }));
    const e = await mk(f).analyze(input).catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ code: 'rate_limited', status: 429, retryAfterSeconds: 120, retryable: true });
    expect(f).toHaveBeenCalledTimes(1); // never auto-retry 429
  });

  it.each([[413, 'payload_too_large'], [415, 'unsupported_media'], [400, 'bad_request'], [503, 'service_unavailable'], [504, 'timeout']])(
    'maps %p -> %p', async (status, code) => {
      const f = jest.fn().mockResolvedValue(json({}, status));
      await expect(mk(f).analyze(input)).rejects.toMatchObject({ code });
    });

  it('retries 502 once with backoff then succeeds', async () => {
    const sleep = jest.fn().mockResolvedValue(undefined);
    const f = jest.fn().mockResolvedValueOnce(json({}, 502)).mockResolvedValueOnce(json(goodAnalysis));
    await mk(f, memStore(), { sleep }).analyze(input);
    expect(f).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(500);
  });

  it('persistent 502 -> server error', async () => {
    const f = jest.fn().mockResolvedValue(json({}, 502));
    await expect(mk(f).analyze(input)).rejects.toMatchObject({ code: 'server' });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('network failure -> network error after retry', async () => {
    const f = jest.fn().mockRejectedValue(new TypeError('fail'));
    await expect(mk(f).analyze(input)).rejects.toMatchObject({ code: 'network', retryable: true });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('times out via AbortController', async () => {
    const f = jest.fn((_u: string, init: RequestInit) => new Promise((_res, rej) => {
      init.signal!.addEventListener('abort', () => rej(new Error('aborted')));
    }));
    await expect(mk(f as any, memStore(), { timeoutMs: 20 }).analyze(input)).rejects.toMatchObject({ code: 'timeout' });
  });

  it('user cancel -> cancelled, no retry', async () => {
    const ctrl = new AbortController();
    const f = jest.fn((_u: string, init: RequestInit) => new Promise((_res, rej) => {
      init.signal!.addEventListener('abort', () => rej(new Error('aborted')));
    }));
    const p = mk(f as any).analyze({ ...input, signal: ctrl.signal });
    setTimeout(() => ctrl.abort(), 5);
    await expect(p).rejects.toMatchObject({ code: 'cancelled' });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed / out-of-range model output', async () => {
    const bad = { ...goodAnalysis, items: [{ ...goodAnalysis.items[0], grams: 99999 }] };
    await expect(mk(jest.fn().mockResolvedValue(json(bad))).analyze(input)).rejects.toMatchObject({ code: 'invalid_response' });
    const notJson = new Response('<html>', { status: 200 });
    await expect(mk(jest.fn().mockResolvedValue(notJson)).analyze(input)).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('missing base url -> config error without calling fetch', async () => {
    const f = jest.fn();
    const c = createApiClient({ baseUrl: undefined, tokenStore: memStore(), fetchImpl: f as any });
    await expect(c.analyze(input)).rejects.toMatchObject({ code: 'config' });
    expect(f).not.toHaveBeenCalled();
  });
});
