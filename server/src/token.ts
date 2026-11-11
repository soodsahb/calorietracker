import { b64url, hmacSign, hmacVerify, sha256Hex } from './crypto';

/** Install token: `v1.<random id>.<HMAC-SHA256(secret, "v1.<id>")>` */
export async function issueToken(secret: string): Promise<string> {
  const id = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const sig = await hmacSign(secret, `v1.${id}`);
  return `v1.${id}.${sig}`;
}

export async function verifyToken(secret: string, token: string): Promise<{ id: string } | null> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1' || !parts[1] || !parts[2]) return null;
  if (token.length > 200) return null;
  return (await hmacVerify(secret, `v1.${parts[1]}`, parts[2])) ? { id: parts[1] } : null;
}

export async function tokenPrefix(token: string): Promise<string> {
  return (await sha256Hex(token)).slice(0, 8);
}
