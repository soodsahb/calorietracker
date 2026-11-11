export const GEMINI_MODEL = 'gemini-2.5-flash';
export const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
export const GEMINI_TIMEOUT_MS = 20_000;
export const MAX_BODY_BYTES = 1.5 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
export const MAX_IMAGE_EDGE = 2048;
export const MAX_PREVIOUS_ITEMS_CHARS = 20_000;
export const ALLOWED_MIME = ['image/jpeg', 'image/webp'] as const;

export const LIMITS = {
  tokenHour: { max: 20, windowSec: 3600 },
  tokenDay: { max: 100, windowSec: 86400 },
  ipHour: { max: 60, windowSec: 3600 },
} as const;
