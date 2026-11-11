# CalorieTracker (Expo app)

Expo SDK 58, expo-router, TypeScript strict. See `docs/ARCHITECTURE.md` for the full spec.

```bash
npm install
cp .env.example .env        # set EXPO_PUBLIC_API_BASE_URL to your deployed Worker (the only public env var)
npx expo start
```

- `npm test` runs jest (nutrition math incl. property tests, API client, ClarifySheet logic, helpers, secret scan).
- `npx tsc --noEmit` type-checks the app (the `@shared/*` alias maps to `/shared`).
- `npx expo export --platform android && npm run check:secrets` bundles and greps the output for `AIza` / `GEMINI`.

The app never contains a Gemini/Google key: it talks only to the Worker proxy (`POST /v1/register`, `POST /v1/analyze`)
using an anonymous install token kept in `expo-secure-store`.

Camera and image-picker need a dev build or Expo Go on a device; export works without one.
