import type { SQLiteDatabase } from 'expo-sqlite';
import { getDb } from './database';
import type { Meal, MealItem } from '@/domain/types';

interface MealRow {
  id: string; loggedAt: string; mealType: Meal['mealType']; photoUri: string | null; imageHash: string;
  note: string | null; source: Meal['source']; createdAt: string; updatedAt: string;
}
interface ItemRow extends Omit<MealItem, 'userEdited'> { userEdited: number }

const toMeal = (r: MealRow, items: MealItem[]): Meal => ({
  id: r.id, loggedAt: r.loggedAt, mealType: r.mealType, photoUri: r.photoUri ?? undefined,
  imageHash: r.imageHash, note: r.note ?? undefined, source: r.source,
  createdAt: r.createdAt, updatedAt: r.updatedAt, items,
});
const toItem = (r: ItemRow): MealItem => ({ ...r, userEdited: !!r.userEdited });

async function attachItems(db: SQLiteDatabase, rows: MealRow[]): Promise<Meal[]> {
  if (rows.length === 0) return [];
  const byMeal = new Map<string, MealItem[]>();
  // chunk to stay under SQLite variable limits
  for (let i = 0; i < rows.length; i += 500) {
    const ids = rows.slice(i, i + 500).map((r) => r.id);
    const items = await db.getAllAsync<ItemRow>(
      `SELECT * FROM meal_items WHERE mealId IN (${ids.map(() => '?').join(',')}) ORDER BY position`,
      ids,
    );
    for (const it of items) {
      const list = byMeal.get(it.mealId) ?? [];
      list.push(toItem(it));
      byMeal.set(it.mealId, list);
    }
  }
  return rows.map((r) => toMeal(r, byMeal.get(r.id) ?? []));
}

async function writeItems(db: SQLiteDatabase, meal: Meal): Promise<void> {
  await db.runAsync('DELETE FROM meal_items WHERE mealId = ?', [meal.id]);
  let pos = 0;
  for (const it of meal.items) {
    await db.runAsync(
      `INSERT INTO meal_items (id, mealId, name, grams, kcalPer100g, proteinPer100g, carbsPer100g, fatPer100g, confidence, userEdited, position)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [it.id, meal.id, it.name, it.grams, it.kcalPer100g, it.proteinPer100g, it.carbsPer100g, it.fatPer100g, it.confidence, it.userEdited ? 1 : 0, pos++],
    );
  }
}

export const mealsRepo = {
  /** Insert or replace a meal and its items atomically. */
  async save(meal: Meal): Promise<void> {
    const db = await getDb();
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `INSERT INTO meals (id, loggedAt, mealType, photoUri, imageHash, note, source, createdAt, updatedAt)
         VALUES (?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET loggedAt=excluded.loggedAt, mealType=excluded.mealType, photoUri=excluded.photoUri,
           imageHash=excluded.imageHash, note=excluded.note, source=excluded.source, updatedAt=excluded.updatedAt`,
        [meal.id, meal.loggedAt, meal.mealType, meal.photoUri ?? null, meal.imageHash, meal.note ?? null, meal.source, meal.createdAt, meal.updatedAt],
      );
      await writeItems(db, meal);
    });
  },
  async get(id: string): Promise<Meal | null> {
    const db = await getDb();
    const row = await db.getFirstAsync<MealRow>('SELECT * FROM meals WHERE id = ?', [id]);
    if (!row) return null;
    return (await attachItems(db, [row]))[0];
  },
  /** Meals with loggedAt in [fromIso, toIso). */
  async listRange(fromIso: string, toIso: string): Promise<Meal[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<MealRow>(
      'SELECT * FROM meals WHERE loggedAt >= ? AND loggedAt < ? ORDER BY loggedAt ASC',
      [fromIso, toIso],
    );
    return attachItems(db, rows);
  },
  async remove(id: string): Promise<void> {
    const db = await getDb();
    await db.runAsync('DELETE FROM meals WHERE id = ?', [id]);
  },
  async listAll(): Promise<Meal[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<MealRow>('SELECT * FROM meals ORDER BY loggedAt ASC');
    return attachItems(db, rows);
  },
  async deleteAll(): Promise<void> {
    const db = await getDb();
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM meal_items');
      await db.runAsync('DELETE FROM meals');
      await db.runAsync('DELETE FROM analysis_cache');
      await db.runAsync('DELETE FROM settings');
    });
  },
};
