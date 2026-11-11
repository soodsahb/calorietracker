import type { SQLiteDatabase } from 'expo-sqlite';

/** Each entry migrates from version i to i+1. PRAGMA user_version tracks progress. */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE meals (
    id TEXT PRIMARY KEY NOT NULL,
    loggedAt TEXT NOT NULL,
    mealType TEXT NOT NULL,
    photoUri TEXT,
    imageHash TEXT NOT NULL,
    note TEXT,
    source TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
  CREATE INDEX idx_meals_loggedAt ON meals(loggedAt);
  CREATE TABLE meal_items (
    id TEXT PRIMARY KEY NOT NULL,
    mealId TEXT NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    grams REAL NOT NULL,
    kcalPer100g REAL NOT NULL,
    proteinPer100g REAL NOT NULL,
    carbsPer100g REAL NOT NULL,
    fatPer100g REAL NOT NULL,
    confidence REAL NOT NULL,
    userEdited INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_items_mealId ON meal_items(mealId);
  CREATE TABLE settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  CREATE TABLE analysis_cache (
    imageHash TEXT NOT NULL,
    noteHash TEXT NOT NULL,
    responseJson TEXT NOT NULL,
    createdAt INTEGER NOT NULL,
    PRIMARY KEY (imageHash, noteHash)
  );
  `,
];

export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let v = row?.user_version ?? 0;
  while (v < MIGRATIONS.length) {
    const sql = MIGRATIONS[v];
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
    });
    v += 1;
    await db.execAsync(`PRAGMA user_version = ${v};`);
  }
}
