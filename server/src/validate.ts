import { Item, NOTE_MAX } from '../../shared/schema';
import { z } from 'zod';
import { ALLOWED_MIME, MAX_IMAGE_BYTES, MAX_IMAGE_EDGE, MAX_PREVIOUS_ITEMS_CHARS } from './config';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

// ---------- note ----------

const STRIP_RE = new RegExp('[\\p{Cc}\\p{Cf}\\p{Co}\\p{Cs}\\u2028\\u2029]', 'gu');

/** NFKC, collapse whitespace, strip control/format/zero-width chars and angle brackets (delimiter safety). */
export function sanitiseNote(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/\s+/gu, ' ')
    .replace(STRIP_RE, '')
    .replace(/[<>]/g, '')
    .replace(/ {2,}/g, ' ')
    .trim();
}

export function validateNote(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'string') throw new HttpError(400, 'invalid_note', 'Invalid note.');
  if (raw.length > NOTE_MAX) throw new HttpError(400, 'note_too_long', 'Note is too long.');
  const clean = sanitiseNote(raw);
  // NFKC can expand a single code point to many (e.g. U+FDFA -> 18 chars): re-check after normalising.
  if (clean.length > NOTE_MAX) throw new HttpError(400, 'note_too_long', 'Note is too long.');
  return clean.length ? clean : undefined;
}

export function validatePreviousItems(raw: unknown): z.infer<typeof Item>[] | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'string' || raw.length > MAX_PREVIOUS_ITEMS_CHARS) {
    throw new HttpError(400, 'invalid_previous_items', 'Invalid previous items.');
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'invalid_previous_items', 'Invalid previous items.');
  }
  const r = z.array(Item).max(20).safeParse(json);
  if (!r.success) throw new HttpError(400, 'invalid_previous_items', 'Invalid previous items.');
  // Names are user-editable free text that ends up in the prompt: sanitise like the note
  // (no delimiter characters, control or zero-width chars).
  const items = r.data.map((i) => ({ ...i, name: sanitiseNote(i.name) }));
  if (items.some((i) => i.name.length === 0)) {
    throw new HttpError(400, 'invalid_previous_items', 'Invalid previous items.');
  }
  return items;
}

// ---------- image ----------

export type ImageKind = 'image/jpeg' | 'image/webp';

export function sniffImage(b: Uint8Array): ImageKind | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (
    b.length >= 12 &&
    String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...b.subarray(8, 12)) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

const u16be = (b: Uint8Array, o: number) => ((b[o] ?? 0) << 8) | (b[o + 1] ?? 0);
const u16le = (b: Uint8Array, o: number) => (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8);
const u24le = (b: Uint8Array, o: number) => u16le(b, o) | ((b[o + 2] ?? 0) << 16);

export function jpegDimensions(b: Uint8Array): { width: number; height: number } | null {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const m = b[i + 1] ?? 0;
    if (m === 0xff) {
      i++;
      continue;
    }
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = u16be(b, i + 2);
    const isSof = m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
    if (isSof) return { height: u16be(b, i + 5), width: u16be(b, i + 7) };
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

export function webpDimensions(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 30) return null;
  const tag = String.fromCharCode(...b.subarray(12, 16));
  if (tag === 'VP8X') return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  if (tag === 'VP8 ') return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  if (tag === 'VP8L' && b[20] === 0x2f) {
    const bits = (b[21] ?? 0) | ((b[22] ?? 0) << 8) | ((b[23] ?? 0) << 16) | ((b[24] ?? 0) << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  return null;
}

export interface ValidImage {
  bytes: Uint8Array;
  mime: ImageKind;
}

export function validateImage(bytes: Uint8Array, declaredType: string): ValidImage {
  if (!(ALLOWED_MIME as readonly string[]).includes(declaredType)) {
    throw new HttpError(415, 'unsupported_media_type', 'Unsupported image type.');
  }
  if (bytes.length === 0) throw new HttpError(400, 'invalid_request', 'Image is empty.');
  if (bytes.length > MAX_IMAGE_BYTES) throw new HttpError(413, 'payload_too_large', 'Image is too large.');
  const kind = sniffImage(bytes);
  if (!kind || kind !== declaredType) {
    throw new HttpError(415, 'unsupported_media_type', 'Unsupported image type.');
  }
  const dims = kind === 'image/jpeg' ? jpegDimensions(bytes) : webpDimensions(bytes);
  if (!dims || dims.width < 1 || dims.height < 1) {
    throw new HttpError(415, 'unsupported_media_type', 'Unreadable image.');
  }
  if (dims.width > MAX_IMAGE_EDGE || dims.height > MAX_IMAGE_EDGE) {
    throw new HttpError(413, 'image_dimensions_too_large', 'Image dimensions are too large.');
  }
  return { bytes, mime: kind };
}
