import { Analysis, type AnalysisT } from '@shared/schema';
import { getDb } from './database';

export const CACHE_TTL_MS = 7 * 24 * 3600 * 1000;

export const cacheRepo = {
  async get(imageHash: string, noteHash: string, now = Date.now()): Promise<AnalysisT | null> {
    const db = await getDb();
    const row = await db.getFirstAsync<{ responseJson: string; createdAt: number }>(
      'SELECT responseJson, createdAt FROM analysis_cache WHERE imageHash = ? AND noteHash = ?',
      [imageHash, noteHash],
    );
    if (!row || now - row.createdAt > CACHE_TTL_MS) return null;
    try {
      const p = Analysis.safeParse(JSON.parse(row.responseJson));
      return p.success ? p.data : null;
    } catch {
      return null;
    }
  },
  async put(imageHash: string, noteHash: string, value: AnalysisT, now = Date.now()): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      'INSERT OR REPLACE INTO analysis_cache (imageHash, noteHash, responseJson, createdAt) VALUES (?,?,?,?)',
      [imageHash, noteHash, JSON.stringify(value), now],
    );
    await db.runAsync('DELETE FROM analysis_cache WHERE createdAt < ?', [now - CACHE_TTL_MS]);
  },
};
