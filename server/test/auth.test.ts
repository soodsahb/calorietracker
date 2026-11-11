import { describe, it, expect } from 'vitest';
import { setup, env, token, analyzeReq, SECRET } from './helpers';
import { verifyToken, issueToken } from '../src/token';

describe('register + auth', () => {
  it('register issues a verifiable HMAC token', async () => {
    const { app } = setup();
    const res = await app.request('/v1/register', { method: 'POST' }, env);
    expect(res.status).toBe(200);
    const { token: t } = (await res.json()) as { token: string };
    expect(await verifyToken(SECRET, t)).not.toBeNull();
    expect(await verifyToken('other-secret-0123456789abcdef-xyz!', t)).toBeNull();
  });

  it('missing token -> 401', async () => {
    const { app, geminiFetch } = setup();
    const res = await app.request(analyzeReq({ token: null }), {}, env);
    expect(res.status).toBe(401);
    expect(geminiFetch).not.toHaveBeenCalled();
  });

  it.each(['garbage', 'v1.abc.def', 'v1..', 'v1.a.b.c'])('invalid token %s -> 401', async (t) => {
    const { app } = setup();
    expect((await app.request(analyzeReq({ token: t }), {}, env)).status).toBe(401);
  });

  it('tampered token -> 401', async () => {
    const { app } = setup();
    const t = await token();
    const bad = t.slice(0, -2) + (t.endsWith('AA') ? 'BB' : 'AA');
    expect((await app.request(analyzeReq({ token: bad }), {}, env)).status).toBe(401);
  });

  it('token signed with wrong secret -> 401', async () => {
    const { app } = setup();
    const t = await issueToken('wrong-secret-0123456789abcdef-xyz!!');
    expect((await app.request(analyzeReq({ token: t }), {}, env)).status).toBe(401);
  });

  it('GET /healthz works without auth; unknown routes and methods 404', async () => {
    const { app } = setup();
    expect((await app.request('/healthz', {}, env)).status).toBe(200);
    expect((await app.request('/nope', {}, env)).status).toBe(404);
    expect((await app.request('/v1/analyze', { method: 'GET' }, env)).status).toBe(404);
  });

  it('sets security headers and no CORS headers', async () => {
    const { app } = setup();
    const res = await app.request('/healthz', { headers: { origin: 'https://evil.test' } }, env);
    expect(res.headers.get('strict-transport-security')).toContain('max-age');
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});
