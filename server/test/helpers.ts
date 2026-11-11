import { vi } from 'vitest';
import { createApp, type AppDeps } from '../src/index';
import { MemoryStore } from '../src/middleware/rateLimit';
import { issueToken } from '../src/token';
import type { Env, LogEntry } from '../src/types';

export const SECRET = 'test-hmac-secret';
export const API_KEY = 'AIzaSyFAKEKEYFORTESTS0000000000000000';
export const env: Env = { GEMINI_API_KEY: API_KEY, TOKEN_HMAC_SECRET: SECRET };

export function jpeg(w = 800, h = 600, extra = 0): Uint8Array {
  const head = [
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, // SOI + tiny APP0
    0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03,
    0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
  ];
  const out = new Uint8Array(head.length + 2 + extra);
  out.set(head);
  out.set([0xff, 0xd9], head.length + extra);
  return out;
}

export function webpX(w: number, h: number): Uint8Array {
  const b = new Uint8Array(40);
  b.set([0x52, 0x49, 0x46, 0x46, 32, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0]);
  const w1 = w - 1, h1 = h - 1;
  b.set([w1 & 255, (w1 >> 8) & 255, (w1 >> 16) & 255, h1 & 255, (h1 >> 8) & 255, (h1 >> 16) & 255], 24);
  return b;
}

export function webpLossy(w: number, h: number): Uint8Array {
  const b = new Uint8Array(40);
  b.set([0x52, 0x49, 0x46, 0x46, 32, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20, 10, 0, 0, 0]);
  b.set([w & 255, w >> 8, h & 255, h >> 8], 26);
  return b;
}

export function webpLossless(w: number, h: number): Uint8Array {
  const b = new Uint8Array(40);
  b.set([0x52, 0x49, 0x46, 0x46, 32, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c, 10, 0, 0, 0, 0x2f]);
  const bits = (w - 1) | ((h - 1) << 14);
  b.set([bits & 255, (bits >> 8) & 255, (bits >> 16) & 255, (bits >>> 24) & 255], 21);
  return b;
}

export const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]);
export const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0]);
export const PDF = new TextEncoder().encode('%PDF-1.4\n%....');
export const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

export const goodItem = {
  name: 'Rice', grams: 150, kcalPer100g: 130, proteinPer100g: 2.7, carbsPer100g: 28, fatPer100g: 0.3, confidence: 0.9,
};
export const goodAnalysis = {
  items: [goodItem], needsClarification: false, clarifyingQuestion: null, suggestedAnswers: [], notFood: false,
};

export const geminiOk = (a: unknown = goodAnalysis) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(a) }] } }] }), {
    status: 200, headers: { 'content-type': 'application/json' },
  });

export function setup(over: Partial<AppDeps> = {}) {
  const geminiFetch = vi.fn(async () => geminiOk());
  const logs: LogEntry[] = [];
  const store = new MemoryStore();
  const app = createApp({ geminiFetch, store, logger: { log: (e) => logs.push(e) }, ...over });
  return { app, geminiFetch, logs, store };
}

export async function token() {
  return issueToken(SECRET);
}

export function analyzeReq(opts: {
  token?: string | null;
  image?: Uint8Array | null;
  mime?: string;
  note?: string;
  previousItems?: string;
  headers?: Record<string, string>;
}) {
  const fd = new FormData();
  if (opts.image !== null) {
    fd.set('image', new File([(opts.image ?? jpeg()) as BlobPart], 'm.jpg', { type: opts.mime ?? 'image/jpeg' }));
  }
  if (opts.note !== undefined) fd.set('note', opts.note);
  if (opts.previousItems !== undefined) fd.set('previousItems', opts.previousItems);
  const headers: Record<string, string> = { 'cf-connecting-ip': '203.0.113.7', ...opts.headers };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  return new Request('https://x.test/v1/analyze', { method: 'POST', body: fd, headers });
}
