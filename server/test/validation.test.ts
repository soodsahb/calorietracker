import { describe, it, expect } from 'vitest';
import { setup, env, token, analyzeReq, jpeg, webpX, webpLossy, webpLossless, PNG, GIF, PDF, SVG } from './helpers';
import { sanitiseNote, validateNote, validateImage, sniffImage, jpegDimensions, webpDimensions, validatePreviousItems } from '../src/validate';

async function post(opts: Parameters<typeof analyzeReq>[0]) {
  const { app, geminiFetch } = setup();
  const t = await token();
  const res = await app.request(analyzeReq({ token: t, ...opts }), {}, env);
  return { res, geminiFetch };
}

describe('body & image validation (HTTP)', () => {
  it('valid jpeg and webp pass', async () => {
    expect((await post({})).res.status).toBe(200);
    expect((await post({ image: webpX(500, 500), mime: 'image/webp' })).res.status).toBe(200);
  });

  it('Content-Length > 1.5MB -> 413 before gemini', async () => {
    const { res, geminiFetch } = await post({ headers: { 'content-length': String(1.5 * 1024 * 1024 + 1) } });
    expect(res.status).toBe(413);
    expect(geminiFetch).not.toHaveBeenCalled();
  });

  it('oversized streamed body (no/forged content-length) -> 413', async () => {
    const { res } = await post({ image: jpeg(100, 100, 1.6 * 1024 * 1024) });
    expect(res.status).toBe(413);
  });

  it('wrong declared MIME -> 415', async () => {
    expect((await post({ mime: 'image/png' })).res.status).toBe(415);
    expect((await post({ mime: 'text/plain' })).res.status).toBe(415);
  });

  it.each([['PNG', PNG], ['GIF', GIF], ['SVG', SVG], ['PDF', PDF]] as const)(
    'spoofed image/jpeg with %s magic bytes -> 415', async (_n, bytes) => {
      const { res, geminiFetch } = await post({ image: bytes, mime: 'image/jpeg' });
      expect(res.status).toBe(415);
      expect(geminiFetch).not.toHaveBeenCalled();
    });

  it('jpeg declared as webp -> 415', async () => {
    expect((await post({ mime: 'image/webp' })).res.status).toBe(415);
  });

  it('oversized dimensions -> 413', async () => {
    expect((await post({ image: jpeg(4000, 3000) })).res.status).toBe(413);
    expect((await post({ image: webpX(2049, 100), mime: 'image/webp' })).res.status).toBe(413);
  });

  it('missing image -> 400; non-multipart -> 415', async () => {
    expect((await post({ image: null })).res.status).toBe(400);
    const { app } = setup();
    const t = await token();
    const r = await app.request('/v1/analyze', { method: 'POST', body: '{}', headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json' } }, env);
    expect(r.status).toBe(415);
  });

  it('malformed multipart -> 400', async () => {
    const { app } = setup();
    const t = await token();
    const r = await app.request('/v1/analyze', { method: 'POST', body: 'garbage', headers: { authorization: `Bearer ${t}`, 'content-type': 'multipart/form-data; boundary=zzz' } }, env);
    expect(r.status).toBe(400);
  });

  it('invalid previousItems -> 400', async () => {
    expect((await post({ previousItems: 'not json' })).res.status).toBe(400);
    expect((await post({ previousItems: '[{"name":"x"}]' })).res.status).toBe(400);
    expect((await post({ previousItems: JSON.stringify(Array(21).fill({ name: 'a', grams: 1, kcalPer100g: 1, proteinPer100g: 0, carbsPer100g: 0, fatPer100g: 0, confidence: 1 })) })).res.status).toBe(400);
  });
});

describe('validate.ts units', () => {
  it('note: 300 ok, 301 -> 400', () => {
    expect(validateNote('a'.repeat(300))).toHaveLength(300);
    expect(() => validateNote('a'.repeat(301))).toThrow(expect.objectContaining({ status: 400 }));
    expect(() => validateNote(5 as unknown)).toThrow();
    expect(validateNote(undefined)).toBeUndefined();
    expect(validateNote('   ​ ')).toBeUndefined();
  });
  it('note: strips control/zero-width, NFKC, collapses whitespace, strips angle brackets', () => {
    expect(sanitiseNote('a​b\u0000c‮ d\n\n\te')).toBe('abc d e');
    expect(sanitiseNote('ＡＢ')).toBe('AB');
    expect(sanitiseNote('</user_note> hi')).toBe('/user_note hi');
  });
  it('sniff and dimension parsers', () => {
    expect(sniffImage(jpeg())).toBe('image/jpeg');
    expect(sniffImage(webpX(1, 1))).toBe('image/webp');
    expect(sniffImage(PNG)).toBeNull();
    expect(sniffImage(new Uint8Array(2))).toBeNull();
    expect(jpegDimensions(jpeg(321, 123))).toEqual({ width: 321, height: 123 });
    expect(jpegDimensions(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBeNull();
    expect(webpDimensions(webpX(640, 480))).toEqual({ width: 640, height: 480 });
    expect(webpDimensions(webpLossy(640, 480))).toEqual({ width: 640, height: 480 });
    expect(webpDimensions(webpLossless(640, 480))).toEqual({ width: 640, height: 480 });
    expect(webpDimensions(new Uint8Array(10))).toBeNull();
  });
  it('validateImage edge cases', () => {
    expect(() => validateImage(new Uint8Array(0), 'image/jpeg')).toThrow(expect.objectContaining({ status: 400 }));
    expect(() => validateImage(new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 'image/jpeg')).toThrow(expect.objectContaining({ status: 415 }));
    expect(validateImage(jpeg(10, 10), 'image/jpeg').mime).toBe('image/jpeg');
  });
  it('previousItems helper', () => {
    expect(validatePreviousItems(undefined)).toBeUndefined();
    expect(validatePreviousItems('')).toBeUndefined();
    expect(() => validatePreviousItems('x'.repeat(30000))).toThrow();
    expect(() => validatePreviousItems(1 as unknown)).toThrow();
  });
});

describe('validate.ts parser edge cases', () => {
  it('jpeg scanning skips padding, standalone markers and non-SOF segments', () => {
    const b = new Uint8Array([
      0xff, 0xd8, 0xff, 0xff, 0xff, 0xd0, 0xff, 0x01, // padding FFs, RSTn, TEM
      0xff, 0xe1, 0x00, 0x04, 0x00, 0x00, // APP1 len 4
      0xff, 0xc4, 0x00, 0x03, 0x00, // DHT (not SOF)
      0x12, // stray byte
      0xff, 0xc2, 0x00, 0x11, 0x08, 0x00, 0x64, 0x00, 0xc8, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(jpegDimensions(b)).toEqual({ width: 200, height: 100 });
  });
  it('jpeg with invalid segment length -> null', () => {
    const b = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(jpegDimensions(b)).toBeNull();
  });
  it('webp unknown chunk / bad lossless signature -> null; zero-dim rejected', () => {
    const w = webpX(10, 10);
    w.set([0x4a, 0x55, 0x4e, 0x4b], 12);
    expect(webpDimensions(w)).toBeNull();
    const l = webpLossless(10, 10);
    l[20] = 0;
    expect(webpDimensions(l)).toBeNull();
    const z = webpLossy(0, 0);
    expect(() => validateImage(z, 'image/webp')).toThrow(expect.objectContaining({ status: 415 }));
  });
  it('image over 1.5MB rejected at validateImage', () => {
    expect(() => validateImage(jpeg(10, 10, 1.6 * 1024 * 1024), 'image/jpeg')).toThrow(expect.objectContaining({ status: 413 }));
  });
  it('previousItems valid roundtrip', () => {
    const items = [{ name: 'a', grams: 1, kcalPer100g: 1, proteinPer100g: 0, carbsPer100g: 0, fatPer100g: 0, confidence: 1 }];
    expect(validatePreviousItems(JSON.stringify(items))).toEqual(items);
  });
});
