import fc from 'fast-check';
import {
  itemKcal, itemProtein, scaleItem, mealTotals, dayTotals, remaining, progress,
  macroConsistency, repairItem, clampGrams, itemMacros, NutritionItem,
} from '@/domain/nutrition';

const mk = (o: Partial<NutritionItem> = {}): NutritionItem => ({
  grams: 100, kcalPer100g: 200, proteinPer100g: 10, carbsPer100g: 20, fatPer100g: 10.0, confidence: 0.9, ...o,
});

describe('itemKcal', () => {
  it.each([[0, 0], [1, 2], [100, 200], [3000, 6000]])('%p g -> %p kcal', (g, k) => {
    expect(itemKcal(mk({ grams: g }))).toBe(k);
  });
  it('rounds half up at boundary', () => {
    expect(itemKcal(mk({ grams: 5, kcalPer100g: 10 }))).toBe(1); // 0.5
    expect(itemKcal(mk({ grams: 15, kcalPer100g: 10 }))).toBe(2); // 1.5
    expect(itemKcal(mk({ grams: 14, kcalPer100g: 10 }))).toBe(1); // 1.4
  });
  it('macros use one decimal', () => {
    expect(itemProtein(mk({ grams: 33, proteinPer100g: 7 }))).toBe(2.3); // 2.31
    expect(itemMacros(mk({ grams: 50 }))).toEqual({ kcal: 100, protein: 5, carbs: 10, fat: 5 });
  });
});

describe('scaleItem', () => {
  it.each([0.25, 1, 3])('keeps per-100g constant at %px', (f) => {
    const a = mk({ grams: 120 });
    const b = scaleItem(a, f);
    expect(b.grams).toBeCloseTo(120 * f);
    expect(b.kcalPer100g).toBe(a.kcalPer100g);
    expect(b.proteinPer100g).toBe(a.proteinPer100g);
  });
  it('clamps to schema grams range', () => {
    expect(scaleItem(mk({ grams: 2000 }), 3).grams).toBe(3000);
    expect(scaleItem(mk({ grams: 2 }), 0.25).grams).toBe(1);
  });
  it('does not mutate', () => {
    const a = mk();
    scaleItem(a, 2);
    expect(a.grams).toBe(100);
  });
});

describe('totals', () => {
  it('empty is zero', () => {
    expect(mealTotals([])).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
  });
  it('sums items before rounding', () => {
    const items = [mk({ grams: 5, kcalPer100g: 10 }), mk({ grams: 5, kcalPer100g: 10 })]; // 0.5 + 0.5
    expect(mealTotals(items).kcal).toBe(1);
  });
  it('dayTotals aggregates all meals', () => {
    const m1 = [mk({ grams: 100 })];
    const m2 = [mk({ grams: 50 }), mk({ grams: 50 })];
    expect(dayTotals([m1, m2]).kcal).toBe(400);
  });
  it('remaining may be negative; progress clamps', () => {
    expect(remaining(2000, 2300)).toBe(-300);
    expect(remaining(2000, 500)).toBe(1500);
    expect(progress(2300, 2000)).toBe(1);
    expect(progress(-5, 2000)).toBe(0);
    expect(progress(100, 0)).toBe(0);
  });
});

describe('macroConsistency / repair', () => {
  const base = { proteinPer100g: 10, carbsPer100g: 20, fatPer100g: 10 }; // expected 210
  it('passes exact and within 15%', () => {
    expect(macroConsistency({ ...base, kcalPer100g: 210 }).ok).toBe(true);
    expect(macroConsistency({ ...base, kcalPer100g: 240 }).ok).toBe(true);
  });
  it('boundary: exactly 15% passes, just over fails', () => {
    // kcal=100, expected=115 -> dev .15
    const e = { proteinPer100g: 0, carbsPer100g: 28.75, fatPer100g: 0 };
    expect(macroConsistency({ ...e, kcalPer100g: 100 }).ok).toBe(true);
    expect(macroConsistency({ ...e, kcalPer100g: 99 }).ok).toBe(false);
  });
  it('fails far off', () => {
    expect(macroConsistency({ ...base, kcalPer100g: 400 }).ok).toBe(false);
    expect(macroConsistency({ ...base, kcalPer100g: 0 }).ok).toBe(false);
  });
  it('repair recomputes kcal and lowers confidence by 0.2, clamped at 0', () => {
    const r = repairItem(mk({ kcalPer100g: 500, confidence: 0.9 }));
    expect(r.kcalPer100g).toBe(210);
    expect(r.confidence).toBeCloseTo(0.7);
    expect(repairItem(mk({ kcalPer100g: 500, confidence: 0.1 })).confidence).toBe(0);
  });
  it('repair leaves consistent items untouched', () => {
    const it = mk({ kcalPer100g: 210 });
    expect(repairItem(it)).toBe(it);
  });
});

describe('clampGrams', () => {
  it('handles bad input', () => {
    expect(clampGrams(NaN)).toBe(1);
    expect(clampGrams(-4)).toBe(1);
    expect(clampGrams(99999)).toBe(3000);
    expect(clampGrams(42)).toBe(42);
  });
});

describe('properties', () => {
  const itemArb = fc.record({
    grams: fc.integer({ min: 1, max: 3000 }),
    kcalPer100g: fc.integer({ min: 0, max: 900 }),
    proteinPer100g: fc.integer({ min: 0, max: 1000 }).map((n) => n / 10),
    carbsPer100g: fc.integer({ min: 0, max: 1000 }).map((n) => n / 10),
    fatPer100g: fc.integer({ min: 0, max: 1000 }).map((n) => n / 10),
    confidence: fc.double({ min: 0, max: 1, noNaN: true }),
  });

  it('totals are invariant to item order', () => {
    fc.assert(
      fc.property(fc.array(itemArb, { maxLength: 20 }), (items) => {
        const rev = [...items].reverse();
        const shuffled = [...items].sort((a, b) => a.grams - b.grams);
        expect(mealTotals(rev)).toEqual(mealTotals(items));
        expect(mealTotals(shuffled)).toEqual(mealTotals(items));
      }),
    );
  });

  it('scaling by f then 1/f returns original grams (in range)', () => {
    fc.assert(
      fc.property(
        itemArb.map((i) => ({ ...i, grams: Math.max(i.grams, 12) })),
        fc.double({ min: 0.25, max: 3, noNaN: true }),
        (item, f) => {
          const base = { ...item, grams: Math.min(item.grams, 900) };
          const out = scaleItem(scaleItem(base, f), 1 / f);
          expect(out.grams).toBeCloseTo(base.grams, 6);
        },
      ),
    );
  });

  it('kcal is never negative and monotonic in grams', () => {
    fc.assert(
      fc.property(itemArb, fc.integer({ min: 1, max: 3000 }), (item, g2) => {
        const a = itemKcal(item);
        const b = itemKcal({ ...item, grams: item.grams + g2 });
        expect(a).toBeGreaterThanOrEqual(0);
        expect(b).toBeGreaterThanOrEqual(a);
      }),
    );
  });

  it('day total equals meal total of concatenation', () => {
    fc.assert(
      fc.property(fc.array(fc.array(itemArb, { maxLength: 5 }), { maxLength: 5 }), (meals) => {
        expect(dayTotals(meals)).toEqual(mealTotals(meals.flat()));
      }),
    );
  });
});
