import { dayKey } from './format';
import { mealTotals } from './nutrition';
import type { Meal } from './types';

export interface Day { key: string; meals: Meal[]; kcal: number }

export function groupByDay(meals: Meal[]): Day[] {
  const map = new Map<string, Meal[]>();
  for (const m of meals) {
    const k = dayKey(new Date(m.loggedAt));
    map.set(k, [...(map.get(k) ?? []), m]);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, ms]) => ({ key, meals: ms, kcal: mealTotals(ms.flatMap((m) => m.items)).kcal }));
}
