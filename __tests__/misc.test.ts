import { targetSize, toHex } from '@/image/prepare';
import { groupByDay } from '@/domain/history';
import { dayKey, dayRange, fromDisplayWeight, toDisplayWeight, mealTypeForHour } from '@/domain/format';
import { parseSettings } from '@/db/settingsRepo';
import { DEFAULT_SETTINGS, type Meal } from '@/domain/types';

describe('image/prepare helpers', () => {
  it('targetSize fits longest edge to 1024, never upscales', () => {
    expect(targetSize(4000, 3000)).toEqual({ width: 1024, height: 768 });
    expect(targetSize(3000, 4000)).toEqual({ width: 768, height: 1024 });
    expect(targetSize(800, 600)).toEqual({ width: 800, height: 600 });
  });
  it('toHex', () => expect(toHex(new Uint8Array([0, 15, 255]).buffer)).toBe('000fff'));
});

describe('format', () => {
  it('oz conversion round-trips approx', () => {
    expect(toDisplayWeight(100, 'g')).toBe(100);
    expect(toDisplayWeight(28.3495, 'oz')).toBe(1);
    expect(fromDisplayWeight(1, 'oz')).toBeCloseTo(28.3495);
  });
  it('dayRange spans 24h-ish local day containing key', () => {
    const { from, to } = dayRange('2025-03-10');
    expect(new Date(to).getTime()).toBeGreaterThan(new Date(from).getTime());
    expect(dayKey(new Date(from))).toBe('2025-03-10');
  });
  it('mealTypeForHour', () => {
    expect(mealTypeForHour(8)).toBe('breakfast');
    expect(mealTypeForHour(13)).toBe('lunch');
    expect(mealTypeForHour(19)).toBe('dinner');
    expect(mealTypeForHour(23)).toBe('snack');
  });
});

describe('history / settings', () => {
  const meal = (iso: string, grams: number): Meal => ({
    id: iso, loggedAt: iso, mealType: 'lunch', imageHash: '', source: 'manual', createdAt: iso, updatedAt: iso,
    items: [{ id: 'i' + iso, mealId: iso, name: 'x', grams, kcalPer100g: 100, proteinPer100g: 0, carbsPer100g: 0, fatPer100g: 0, confidence: 1, userEdited: false }],
  });
  it('groups by local day, newest first, with totals', () => {
    const days = groupByDay([meal(new Date(2025, 0, 1, 12).toISOString(), 100), meal(new Date(2025, 0, 2, 12).toISOString(), 200), meal(new Date(2025, 0, 2, 18).toISOString(), 50)]);
    expect(days.map((d) => d.key)).toEqual(['2025-01-02', '2025-01-01']);
    expect(days[0].kcal).toBe(250);
  });
  it('parseSettings falls back to defaults on bad rows', () => {
    const s = parseSettings([{ key: 'kcalGoal', value: '1800' }, { key: 'units', value: '"stone"' }, { key: 'fatGoal', value: 'oops' }, { key: 'storePhotos', value: 'false' }]);
    expect(s.kcalGoal).toBe(1800);
    expect(s.units).toBe('g');
    expect(s.fatGoal).toBe(DEFAULT_SETTINGS.fatGoal);
    expect(s.storePhotos).toBe(false);
  });
});
