import { getDb } from './database';
import { DEFAULT_SETTINGS, type Settings } from '@/domain/types';

export function parseSettings(rows: { key: string; value: string }[]): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  for (const { key, value } of rows) {
    try {
      const v = JSON.parse(value);
      if (key in DEFAULT_SETTINGS && typeof v === typeof (DEFAULT_SETTINGS as any)[key]) (out as any)[key] = v;
    } catch {
      /* ignore corrupt row */
    }
  }
  if (out.units !== 'g' && out.units !== 'oz') out.units = 'g';
  return out;
}

export const settingsRepo = {
  async load(): Promise<Settings> {
    const db = await getDb();
    return parseSettings(await db.getAllAsync('SELECT key, value FROM settings'));
  },
  async save(patch: Partial<Settings>): Promise<void> {
    const db = await getDb();
    await db.withTransactionAsync(async () => {
      for (const [k, v] of Object.entries(patch)) {
        await db.runAsync('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [k, JSON.stringify(v)]);
      }
    });
  },
};
