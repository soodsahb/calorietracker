import { b64url, hmacSign, hmacVerify, sha256Hex } from './crypto';
import { MIN_SECRET_LENGTH } from './config';
import { HttpError } from './validate';

/**
 * Fail closed when the HMAC secret is missing or weak. An unset Worker secret would otherwise
 * become an empty/guessable HMAC key and let anyone mint valid install tokens.
 */
export function requireSecret(secret: string | undefined): string {
  if (typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH) {
    throw new HttpError(503, 'service_unavailable', 'Service temporarily unavailable.');
  }
  return secret;
}

/** Install token: `v1.<random id>.<HMAC-SHA256(secret, "v1.<id>")>` */
export async function issueToken(secret: string): Promise<string> {
  requireSecret(secret);
  const id = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const sig = await hmacSign(secret, `v1.${id}`);
  return `v1.${id}.${sig}`;
}

export async function verifyToken(secret: string, token: string): Promise<{ id: string } | null> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1' || !parts[1] || !parts[2]) return null;
  if (token.length > 200) return null;
  requireSecret(secret);
  return (await hmacVerify(secret, `v1.${parts[1]}`, parts[2])) ? { id: parts[1] } : null;
}

export async function tokenPrefix(token: string): Promise<string> {
  return (await sha256Hex(token)).slice(0, 8);
}
