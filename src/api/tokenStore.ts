import * as SecureStore from 'expo-secure-store';
import type { TokenStore } from './client';

const KEY = 'install_token';

/** Install token lives only in the OS keystore via expo-secure-store. */
export const secureTokenStore: TokenStore = {
  async get() {
    try {
      return await SecureStore.getItemAsync(KEY);
    } catch {
      return null;
    }
  },
  async set(token) {
    await SecureStore.setItemAsync(KEY, token);
  },
  async clear() {
    try {
      await SecureStore.deleteItemAsync(KEY);
    } catch {
      /* ignore */
    }
  },
};
