# CalorieTracker proxy (Cloudflare Worker, Hono)

Routes: `POST /v1/register`, `POST /v1/analyze` (multipart `image`, optional `note`, `previousItems`), `GET /healthz`. Everything else 404.
See `docs/ARCHITECTURE.md` section 6 for the security pipeline.

## Setup
```
npm install
wrangler secret put GEMINI_API_KEY
wrangler secret put TOKEN_HMAC_SECRET
```
Local dev: create `.dev.vars` (git-ignored) with both values, then `npm run dev`.
Kill switch: set `KILL_SWITCH=1` var to make `/v1/analyze` return 503.

## Rate limiting
`RateLimitStore` interface (`src/middleware/rateLimit.ts`): `MemoryStore` (tests/dev), `KVStore`, `DurableObjectStore`
(`RateLimiterDO`, enabled in `wrangler.toml`). Selected from bindings: DO, else KV, else memory.
Limits: token 20/h and 100/day, IP 60/h (IP only stored hashed).

## Tests
`npm test` (vitest + coverage gate on `src/validate.ts`), `npm run typecheck`.
Gemini fetch is injected via `createApp({ geminiFetch })`; tests never hit the network.
`/shared/schema.ts` is imported directly; `zod` is aliased to this package's copy (tsconfig paths + vitest alias).
