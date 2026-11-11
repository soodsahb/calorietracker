# Security and quality review

Date: 2026-11-11. Scope: Expo app (`/app`, `/src`, `/shared`), Cloudflare Worker proxy (`/server`), checked against
`docs/ARCHITECTURE.md` (section 11 checklist plus sections 4 to 8). All fixes are uncommitted changes in the working tree.

## Commands run (final state)

| Command | Result |
|---|---|
| `npm test` (root, jest) | 6 suites, **69 passed** (61 before + 8 new in `__tests__/review.test.ts`) |
| `npx tsc --noEmit` (root) | exit 0 |
| `cd server && npm test` (vitest + coverage) | 5 files, **74 passed** (61 before + 13 new in `server/test/review.test.ts`); `validate.ts` 100% lines, 90.6% branches |
| `cd server && npx tsc --noEmit` | exit 0 |
| `npm audit --omit=dev` (root) | 3 moderate: `minimatch` via `@expo/fingerprint` via `expo` (see C15) |
| `cd server && npm audit --omit=dev` | 0 vulnerabilities |
| `node scripts/check-bundle-secrets.js` | passed (no `AIza` / `GEMINI` in app source or config) |
| `git grep` for `AIza…`, `sk-…`, `ghp_…`, `xox[bp]-`, `-----BEGIN` | only fake fixtures in `server/test/helpers.ts` and `__tests__/bundleSecrets.test.ts` |
| `git log --all --stat` for `.env` / `.dev.vars` | only `.env.example` (holds the public base URL only) was ever committed |

The 8 new app tests were also run against the code before the fixes: 6 of them failed, which shows they catch the bugs.

## Findings

Severity: **High**: exploitable in a default deployment with real cost or data impact. **Medium**: exploitable
under realistic conditions, or a reliability bug a user will hit. **Low**: defence-in-depth or edge case.

### Fixed

| # | Sev | Area | Finding | Fix | Test |
|---|---|---|---|---|---|
| F1 | Medium | server rate limit | **IPv6 rate-limit bypass.** The per-IP limit was keyed on the full `cf-connecting-ip`. An IPv6 client usually controls a /64 (2^64 addresses), so it could rotate addresses and never hit the per-IP 60/h limit on `/v1/register` or `/v1/analyze`. Tokens can be minted without limit, so the per-token limits did not help either. | `ipBucket()` in `server/src/middleware/rateLimit.ts` keys IPv6 by /64 (IPv4-mapped addresses become plain IPv4). | `review.test.ts`: "rotating addresses inside one /64…" (61st request returns 429) and unit cases |
| F2 | Medium | server cost | **No automatic global spend cap.** Section 6.3 asks for a global daily cap, but only the manual `KILL_SWITCH` existed, so a distributed abuser could run up Gemini spend until a human noticed. | `enforceGlobalDailyCap()` uses a per-UTC-day counter in the same store, configured by the `GLOBAL_DAILY_CAP` var (default `2000` in `wrangler.toml`, `0` disables), and returns 503 once exceeded. The counter is only incremented after the image and note are validated, right before the Gemini call. | `review.test.ts`: "global daily cap" (3 cases) |
| F3 | Medium | server auth | **Missing or weak `TOKEN_HMAC_SECRET` did not fail closed.** If the secret is unset, `TextEncoder.encode(undefined)` gives an empty key. Node rejects zero-length HMAC keys, but this depends on the runtime, and a short or guessable secret would let anyone forge install tokens. | `requireSecret()` (minimum 32 characters) runs in `issueToken` and `verifyToken`, so register and analyze return 503 and never issue a token. A missing `GEMINI_API_KEY` also returns 503 before any upstream call. The test secret was lengthened to match. | `review.test.ts`: "HMAC secret misconfiguration fails closed" (3 cases) |
| F4 | Medium | server prompt | **Note length limit bypassed via NFKC expansion.** The 300-character check ran *before* NFKC. One code point can expand to many (for example U+FDFA becomes 18 characters), so a 300-character note became 5,400 characters in the prompt, with more room for injection and higher token cost. | `validateNote` re-checks the length after sanitising. | `review.test.ts`: unit test plus end-to-end 400 with no Gemini call |
| F5 | Medium | server prompt | **Prompt injection through `previousItems[].name`.** Names are user-editable free text (up to 80 characters each, 20 items). They were zod-validated but not sanitised, so `</previous_items>` or `<user_note>` could close or open delimiters. The system instruction also did not cover `<previous_items>`. | Names go through the same `sanitiseNote` (NFKC, control and zero-width characters removed, `<>` stripped). A name that is empty after sanitising is rejected with 400. A system-instruction line was added saying that `<previous_items>` content is data only. | `review.test.ts`: "previousItems names cannot break out of their delimiters" (3 cases) |
| F6 | Medium | app privacy | **"Delete all data" left a full copy of the history on the device.** Export writes `calorietracker-export.json` (all meals and notes) to the cache directory, and delete-all did not remove it. If the DB wipe threw, photos and the token were not deleted either, and the user got no feedback (unhandled rejection). | `services/data.ts`: `deleteAllData` attempts every step (DB, photos, export file, token) and rethrows the first error. `exportFile()` is shared with Settings. Settings shows a "Delete incomplete" alert and always resets the in-memory stores. | `__tests__/review.test.ts`: "deleteAllData" (2 cases) |
| F7 | Medium | app state race | **`todayStore.load` race and stuck spinner.** Overlapping loads (focus effect plus save, or a day change) could resolve out of order and show another day's meals. A DB error left `loading: true` forever. A load still in flight during delete-all could put meals back on screen after `reset()`. | Monotonic request sequence: only the latest load writes, `loading` is cleared in `finally`, and `reset()` invalidates loads in flight. | `__tests__/review.test.ts`: "todayStore.load" (3 cases) |
| F8 | Medium | app crash path | **Meal screen spun forever on a DB error.** `mealsRepo.get(id).then(...)` had no rejection handler, causing an unhandled rejection and a permanent "Loading…". | Rejection handler added. The screen now falls through to "Meal not found." | Not unit-tested (screen component, small change) |
| F9 | Low/Med | app DB | **Migration not atomic with the version bump.** `PRAGMA user_version` was set *after* the migration transaction. If the app was killed in between, the DDL re-ran on next launch and failed ("table already exists"), so every DB call failed from then on. | The version bump now happens inside the same transaction (`user_version` is transactional in SQLite). | `__tests__/review.test.ts`: "migrations" |
| F10 | Low | app API | Concurrent first requests each called `/v1/register`, minting several tokens. Each one used up per-IP register budget, and the last write won in SecureStore. | Single-flight `registerOnce()` in `src/api/client.ts`. | `__tests__/review.test.ts`: "api client registration" |
| F11 | Low | app UI | Duplicate `suggestedAnswers` from the model became duplicate React keys in ClarifySheet (warning, and the wrong chip could highlight). | `buildClarifyPrompt` dedupes chips. | `__tests__/review.test.ts`: "clarify chips" |
| F12 | Low | app UI | History swipe-delete had no error handling (unhandled rejection, no feedback). | try/catch with an alert. | Not unit-tested |

### Remaining (not fixed)

| # | Sev | Finding | Recommendation |
|---|---|---|---|
| R1 | Medium (process) | **No CI:** there is no `.github/`, so no gitleaks, no Dependabot, no CI test run, and `check:secrets` is never run against a *built* bundle (checklist items 1, 2 and 15). | Add a workflow: `npm test`, `tsc` (root + server), `npm audit`, gitleaks, and `expo export` followed by `node scripts/check-bundle-secrets.js dist`. Add `dependabot.yml`. |
| R2 | Medium (ops) | Restricting the Google key to the Generative Language API, billing alerts, quota cap, and a paid tier with no training on prompts cannot be verified from the repo. | Do this in the Google Cloud console and record it in the runbook. |
| R3 | Low | No secret rotation procedure is documented. Rotating `TOKEN_HMAC_SECRET` invalidates all install tokens; clients recover automatically through re-register on 401. Rate-limit keys also change, which effectively resets limits once. | Add a rotation section to `server/README.md`. |
| R4 | Low | Per-token limits are weak by design: tokens are free to mint (60/h per IP or /64). The effective controls are the per-IP limit and the new global cap (F2). | v2 App Attest / Play Integrity (checklist item 17). Optionally, give fresh tokens a lower first-hour budget. |
| R5 | Low | Without a DO or KV binding, `storeFromEnv` silently falls back to a per-isolate `MemoryStore`, so rate limits become nearly ineffective. `KVStore` is not atomic (documented). | Fail closed in production when no binding exists (for example, an `ENV=production` var). |
| R6 | Low | Worst-case Worker time per request is about 4 Gemini calls × 20 s (5xx retry × schema retry), but the client times out at 25 s. | Use a total deadline budget of about 24 s across retries in `analyse()`. |
| R7 | Low | The Worker does not reject plain `http:` requests itself; it relies on Cloudflare "Always Use HTTPS" (HSTS does not apply to native clients). | Enable Always Use HTTPS on the zone, or return 403 when `new URL(c.req.url).protocol === 'http:'`. |
| R8 | Low | The schema allows protein+carbs+fat > 100 g per 100 g (each field is capped at 100 separately), so model output can be physically impossible. kcal is clamped to 900 in repair. | Clamp or scale macros in `repairAnalysis` when their sum is > 100 (and lower confidence). |
| R9 | Low | Dimension check reads only the first SOF or VP8 header. A crafted file can claim small dimensions. Impact is limited by the 1.5 MB cap, and Gemini decodes the image itself. | Acceptable for v1. |
| R10 | Low | The original camera capture (`takePictureAsync`, which keeps EXIF) and ImageManipulator outputs stay in the app cache directory until the OS evicts them. They are not removed by delete-all. | Delete the source capture after `prepareImage`, and clear the manipulator outputs in `deleteAllData`. |
| R11 | Low | Capture: a quick double tap on the shutter can start two analyses. The single-flight register (F10) shares the first caller's abort signal. | Guard `shoot`/`pick` with a busy ref. |
| R12 | Info | `npm audit` (root): 3 moderate (`minimatch` ReDoS via `@expo/fingerprint`, a build-time CLI dependency that is not in the runtime bundle). The suggested fix downgrades Expo to 52, so it does not apply. Server: 0. | Track upstream; review again on the next Expo patch. |

## Section 11 checklist

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | No Gemini/Google key or secret in app source, `app.json`, EAS config, built bundle | **Pass (source)** / not verified (bundle) | Grep finds only fake test fixtures; `check-bundle-secrets.js` passes; no `eas.json`. No built bundle exists (R1). |
| 2 | Only `EXPO_PUBLIC_API_BASE_URL` public; `.dev.vars`, `.env*` ignored; gitleaks clean | **Partial** | `src/api/index.ts` reads only that var; root `.gitignore` has `.env*` with `!.env.example`; `server/.gitignore` has `.dev.vars`. No gitleaks or CI (R1). |
| 3 | Google key restricted; billing alerts + quota cap | **Not verifiable** | Ops (R2). A server-side global cap now exists (F2). |
| 4 | Worker secrets via `wrangler secret`; rotation documented | **Partial** | `wrangler.toml` has no secrets, only comments. Missing secret now fails closed (F3). No rotation doc (R3). |
| 5 | Install token HMAC-signed, verified on every request, in SecureStore | **Pass** | `token.ts` (HMAC-SHA256, `crypto.subtle.verify`), `auth` middleware on `/v1/analyze`, `api/tokenStore.ts` (expo-secure-store). Auth tests for missing, tampered and wrong-secret tokens. |
| 6 | Rate limits per token + IP; kill switch tested | **Pass after fix** | 20/h and 100/day per token, 60/h per IP (IPv6 by /64 after F1), register IP-limited, 429 with `Retry-After`; kill switch test in `analyze.test.ts`; global cap (F2). Caveats R4 and R5. |
| 7 | Body limit before full read; MIME allow-list + magic bytes; dimension check | **Pass** | `bodyLimit.ts` checks Content-Length and then a streaming cap; `validateImage` uses the jpeg/webp allow-list, sniffs bytes and checks that the sniffed type matches the declared type, and limits the longest edge to 2048. Tests for PNG/GIF/SVG/PDF spoofing. Caveat R9. |
| 8 | Note length/normalisation/delimiting; system prompt forbids note instructions | **Pass after fix** | NFKC length bypass fixed (F4); previousItems names sanitised and covered by the system prompt (F5); inline snapshot test of the delimited note. |
| 9 | All Gemini responses zod-validated; ranges clamped; raw text never returned | **Pass** | `analyse()` runs `Analysis.safeParse`, retries once, then returns 502; extra keys are stripped (test); `repairAnalysis`; the client re-validates with the same schema; the response is `c.json(repaired)` only. Caveat R8. |
| 10 | Logs: no images, notes, IPs, model output; no stack traces | **Pass** | `logger.ts` logs only whitelisted fields; `onError` returns generic `{error, message}`; tests assert that the note, IP and key are absent from logs and responses. `grep console.` in app/src/server finds nothing besides the logger. |
| 11 | TLS/HSTS; unused routes 404; CORS off; security headers | **Pass** (caveat R7) | `securityHeaders.ts` (HSTS, nosniff, DENY, no-referrer, no-store, CSP none); `notFound` returns 404; no CORS middleware. |
| 12 | Images EXIF-stripped on device; not persisted server-side | **Pass** (caveat R10) | `prepareImage` re-encodes to JPEG through ImageManipulator (metadata dropped), 1024 px, q=0.7; the server processes the image in memory and does no KV or image storage. |
| 13 | Local DB in sandbox; delete-all wipes DB, photos, token; export works | **Pass after fix** | expo-sqlite DB in the app sandbox; `deleteAll` clears all 4 tables; F6 adds the export file and robust error handling. |
| 14 | Model output rendered as plain text only | **Pass** | All model strings go through `<Text>`; no WebView, markdown or `dangerouslySetInnerHTML` (grep). |
| 15 | Dependencies audited; Dependabot; Expo SDK current | **Partial** | Audits above (R12); Expo SDK 58; no Dependabot (R1). |
| 16 | Privacy text and data-safety forms match behaviour; "not medical advice" | **Pass (in-app)** | `PRIVACY_TEXT` and `DISCLAIMER` in Settings; disclaimer also on the meal screen. Store forms are outside the repo. |
| 17 | v2: App Attest / Play Integrity | **Open** (planned v2) | See R4. |

## Other areas checked, no issue found

- **SQL injection (expo-sqlite):** every query is parameterised. The only interpolations are the generated `?,?,…`
  placeholder list in `attachItems` and the integer `PRAGMA user_version`.
- **SSRF:** the Worker fetches only the constant `GEMINI_ENDPOINT`; no user-controlled URL is fetched. The API key is
  sent in the `x-goog-api-key` header, not the URL.
- **Unvalidated JSON:** `previousItems` (size cap + zod), Gemini output (zod), client response (zod), cache rows
  (zod on read), settings rows (type-checked against the defaults).
- **Calorie math:** `domain/nutrition.ts` matches section 5 (round at the aggregate boundary, integer milli-accumulation,
  order-independent; property tests present). Portion scaling keeps per-100 g values fixed; grams are clamped to 1–3000;
  NumberField rejects non-finite input.
- **Auth bypass:** the token format is strictly parsed, the signature uses constant-time `crypto.subtle.verify`, and the length is capped.
  `/v1/analyze` cannot be reached without `auth`.

## Files changed

Server: `src/validate.ts`, `src/gemini.ts`, `src/token.ts`, `src/config.ts`, `src/types.ts`, `src/index.ts`,
`src/middleware/rateLimit.ts`, `wrangler.toml`, `README.md`, `test/helpers.ts`, `test/auth.test.ts`,
`test/review.test.ts` (new).
App: `src/services/data.ts`, `src/state/todayStore.ts`, `src/db/migrations.ts`, `src/domain/clarify.ts`,
`src/api/client.ts`, `app/(tabs)/settings.tsx`, `app/(tabs)/history.tsx`, `app/meal/[id].tsx`,
`__tests__/review.test.ts` (new).
