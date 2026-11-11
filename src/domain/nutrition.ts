/**
 * Pure calorie / macro math. No React Native imports.
 * Derived values are never persisted; always computed here.
 * Totals are accumulated at 1/1000 precision as integers (exact + order independent)
 * and rounded only at the aggregate boundary.
 */

export interface NutritionItem {
  grams: number;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  confidence: number;
}

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export const SLIDER_MIN = 0.25;
export const SLIDER_MAX = 3;
export const MACRO_TOLERANCE = 0.15;
export const MIN_GRAMS = 1;
export const MAX_GRAMS = 3000;

const round1 = (n: number): number => Math.round(n * 10) / 10;
const scaled = (grams: number, per100: number): number => (grams * per100) / 100;
const MILLI = 1000;
const milli = (n: number): number => Math.round(n * MILLI);

export function itemKcal(item: Pick<NutritionItem, 'grams' | 'kcalPer100g'>): number {
  return Math.round(scaled(item.grams, item.kcalPer100g));
}
export function itemProtein(item: Pick<NutritionItem, 'grams' | 'proteinPer100g'>): number {
  return round1(scaled(item.grams, item.proteinPer100g));
}
export function itemCarbs(item: Pick<NutritionItem, 'grams' | 'carbsPer100g'>): number {
  return round1(scaled(item.grams, item.carbsPer100g));
}
export function itemFat(item: Pick<NutritionItem, 'grams' | 'fatPer100g'>): number {
  return round1(scaled(item.grams, item.fatPer100g));
}
export function itemMacros(item: NutritionItem): Macros {
  return {
    kcal: itemKcal(item),
    protein: itemProtein(item),
    carbs: itemCarbs(item),
    fat: itemFat(item),
  };
}

/** Multiplies grams only; per-100g values are fixed. Grams are clamped to the schema range. */
export function scaleItem<T extends NutritionItem>(item: T, factor: number): T {
  const grams = Math.min(MAX_GRAMS, Math.max(MIN_GRAMS, item.grams * factor));
  return { ...item, grams };
}

export const ZERO_MACROS: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

export function mealTotals(items: readonly NutritionItem[]): Macros {
  let k = 0;
  let p = 0;
  let c = 0;
  let f = 0;
  for (const it of items) {
    k += milli(scaled(it.grams, it.kcalPer100g));
    p += milli(scaled(it.grams, it.proteinPer100g));
    c += milli(scaled(it.grams, it.carbsPer100g));
    f += milli(scaled(it.grams, it.fatPer100g));
  }
  return {
    kcal: Math.round(k / MILLI),
    protein: round1(p / MILLI),
    carbs: round1(c / MILLI),
    fat: round1(f / MILLI),
  };
}

/** Totals across several meals, computed from the raw items (not from rounded meal totals). */
export function dayTotals(meals: readonly (readonly NutritionItem[])[]): Macros {
  return mealTotals(meals.flat());
}

/** goal - consumed. Negative means over goal. */
export function remaining(goal: number, consumed: number): number {
  return goal - consumed;
}

/** consumed/goal clamped to [0,1] for ring/bar display. */
export function progress(consumed: number, goal: number): number {
  if (!(goal > 0)) return 0;
  return Math.min(1, Math.max(0, consumed / goal));
}

export function macroKcal(item: Pick<NutritionItem, 'proteinPer100g' | 'carbsPer100g' | 'fatPer100g'>): number {
  return 4 * item.proteinPer100g + 4 * item.carbsPer100g + 9 * item.fatPer100g;
}

export interface Consistency {
  ok: boolean;
  /** kcal implied by 4P+4C+9F per 100 g */
  expectedKcal: number;
  /** relative deviation |kcal - expected| / kcal */
  deviation: number;
}

export function macroConsistency(
  item: Pick<NutritionItem, 'kcalPer100g' | 'proteinPer100g' | 'carbsPer100g' | 'fatPer100g'>,
): Consistency {
  const expectedKcal = macroKcal(item);
  const diff = Math.abs(item.kcalPer100g - expectedKcal);
  if (item.kcalPer100g === 0) {
    return { ok: expectedKcal === 0, expectedKcal, deviation: expectedKcal === 0 ? 0 : Infinity };
  }
  const deviation = diff / item.kcalPer100g;
  // small epsilon so exact-boundary values are not rejected by float noise
  return { ok: deviation <= MACRO_TOLERANCE + 1e-9, expectedKcal, deviation };
}

/** Recompute kcal from macros and lower confidence by 0.2 (floored at 0) when inconsistent. */
export function repairItem<T extends NutritionItem>(item: T): T {
  if (macroConsistency(item).ok) return item;
  return {
    ...item,
    kcalPer100g: Math.max(0, Math.round(macroKcal(item) * 10) / 10),
    confidence: Math.max(0, Math.round((item.confidence - 0.2) * 100) / 100),
  };
}

export function clampGrams(g: number): number {
  if (!Number.isFinite(g)) return MIN_GRAMS;
  return Math.min(MAX_GRAMS, Math.max(MIN_GRAMS, g));
}
