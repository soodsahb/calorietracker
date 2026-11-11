import type { AnalysisT, ItemT } from '../../shared/schema';

const round1 = (n: number) => Math.round(n * 10) / 10;

export function isMacroConsistent(i: ItemT): boolean {
  const expected = 4 * i.proteinPer100g + 4 * i.carbsPer100g + 9 * i.fatPer100g;
  if (i.kcalPer100g === 0) return expected <= 1;
  return Math.abs(i.kcalPer100g - expected) / i.kcalPer100g <= 0.15;
}

/** Recompute kcal from macros for inconsistent items and lower confidence by 0.2 (clamped at 0). */
export function repairAnalysis(a: AnalysisT): AnalysisT {
  return {
    ...a,
    items: a.items.map((i) => {
      if (isMacroConsistent(i)) return i;
      const expected = 4 * i.proteinPer100g + 4 * i.carbsPer100g + 9 * i.fatPer100g;
      return {
        ...i,
        kcalPer100g: Math.min(900, Math.max(0, round1(expected))),
        confidence: Math.max(0, round1(i.confidence - 0.2)),
      };
    }),
  };
}
