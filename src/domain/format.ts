export type Units = 'g' | 'oz';
export const GRAMS_PER_OZ = 28.3495;

export function toDisplayWeight(grams: number, units: Units): number {
  return units === 'oz' ? Math.round((grams / GRAMS_PER_OZ) * 10) / 10 : Math.round(grams);
}
export function fromDisplayWeight(value: number, units: Units): number {
  return units === 'oz' ? value * GRAMS_PER_OZ : value;
}
export function formatWeight(grams: number, units: Units): string {
  return `${toDisplayWeight(grams, units)} ${units}`;
}

/** Local calendar day key, YYYY-MM-DD. */
export function dayKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
export function dayRange(key: string): { from: string; to: string } {
  const [y, m, d] = key.split('-').map(Number);
  const from = new Date(y, m - 1, d, 0, 0, 0, 0);
  const to = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}
export function mealTypeForHour(h: number): 'breakfast' | 'lunch' | 'dinner' | 'snack' {
  if (h >= 5 && h < 11) return 'breakfast';
  if (h >= 11 && h < 15) return 'lunch';
  if (h >= 17 && h < 22) return 'dinner';
  return 'snack';
}
