import { HttpError } from '../validate';

/** Rejects on Content-Length before reading, and enforces the cap while streaming. */
export async function readLimitedBody(req: Request, max: number): Promise<Uint8Array> {
  const cl = req.headers.get('content-length');
  if (cl !== null) {
    const n = Number(cl);
    if (!Number.isFinite(n) || n < 0) throw new HttpError(400, 'invalid_request', 'Bad request.');
    if (n > max) throw new HttpError(413, 'payload_too_large', 'Request body is too large.');
  }
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      throw new HttpError(413, 'payload_too_large', 'Request body is too large.');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}
