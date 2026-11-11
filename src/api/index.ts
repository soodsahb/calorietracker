import { createApiClient } from './client';
import { secureTokenStore } from './tokenStore';

// Only EXPO_PUBLIC_API_BASE_URL is ever read from the environment. No API keys in the app.
export const api = createApiClient({
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
  tokenStore: secureTokenStore,
});
export * from './client';
