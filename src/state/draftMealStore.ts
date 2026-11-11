import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
import type { AnalysisT } from '@shared/schema';
import { clampGrams, scaleItem, SLIDER_MAX, SLIDER_MIN } from '@/domain/nutrition';
import type { Meal, MealItem, MealType } from '@/domain/types';
import { mealTypeForHour } from '@/domain/format';

export type DraftItem = Omit<MealItem, 'mealId'>;

export interface Draft {
  /** existing meal id when editing; undefined for a new meal */
  mealId?: string;
  createdAt?: string;
  loggedAt: string;
  mealType: MealType;
  photoUri?: string;
  imageHash: string;
  note: string;
  source: 'ai' | 'manual';
  items: DraftItem[];
  /** latest analysis metadata (question + chips) when available */
  analysis?: Pick<AnalysisT, 'needsClarification' | 'clarifyingQuestion' | 'suggestedAnswers' | 'notFood'>;
  portion: number;
  baseGrams: Record<string, number>;
}

interface DraftState {
  draft: Draft | null;
  startFromAnalysis: (p: { photoUri: string; imageHash: string; note: string; analysis: AnalysisT }) => void;
  startManual: () => void;
  startFromMeal: (m: Meal) => void;
  applyReanalysis: (note: string, analysis: AnalysisT) => void;
  setPortion: (factor: number) => void;
  updateItem: (id: string, patch: Partial<Omit<DraftItem, 'id'>>) => void;
  addItem: () => void;
  removeItem: (id: string) => void;
  setMealType: (t: MealType) => void;
  clear: () => void;
}

const newId = () => Crypto.randomUUID();

export function toDraftItems(analysis: AnalysisT): DraftItem[] {
  return analysis.items.map((i) => ({ ...i, id: newId(), userEdited: false }));
}
const snapshot = (items: DraftItem[]): Record<string, number> =>
  Object.fromEntries(items.map((i) => [i.id, i.grams]));
const meta = (a: AnalysisT): Draft['analysis'] => ({
  needsClarification: a.needsClarification,
  clarifyingQuestion: a.clarifyingQuestion,
  suggestedAnswers: a.suggestedAnswers,
  notFood: a.notFood,
});

export const useDraftMealStore = create<DraftState>((set, get) => ({
  draft: null,

  startFromAnalysis: ({ photoUri, imageHash, note, analysis }) => {
    const items = toDraftItems(analysis);
    const now = new Date();
    set({
      draft: {
        loggedAt: now.toISOString(), mealType: mealTypeForHour(now.getHours()), photoUri, imageHash, note,
        source: 'ai', items, analysis: meta(analysis), portion: 1, baseGrams: snapshot(items),
      },
    });
  },

  startManual: () => {
    const now = new Date();
    set({
      draft: {
        loggedAt: now.toISOString(), mealType: mealTypeForHour(now.getHours()), imageHash: '', note: '',
        source: 'manual', items: [], portion: 1, baseGrams: {},
      },
    });
  },

  startFromMeal: (m) => {
    const items = m.items.map(({ mealId: _m, ...rest }) => rest);
    set({
      draft: {
        mealId: m.id, createdAt: m.createdAt, loggedAt: m.loggedAt, mealType: m.mealType, photoUri: m.photoUri,
        imageHash: m.imageHash, note: m.note ?? '', source: m.source, items, portion: 1, baseGrams: snapshot(items),
      },
    });
  },

  applyReanalysis: (note, analysis) => {
    const d = get().draft;
    if (!d) return;
    const items = toDraftItems(analysis);
    set({ draft: { ...d, note, items, analysis: meta(analysis), portion: 1, baseGrams: snapshot(items) } });
  },

  setPortion: (factor) => {
    const d = get().draft;
    if (!d) return;
    const f = Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, factor));
    const items = d.items.map((it) => {
      const base = d.baseGrams[it.id] ?? it.grams / d.portion;
      return scaleItem({ ...it, grams: base }, f) as DraftItem;
    });
    set({ draft: { ...d, items, portion: f } });
  },

  updateItem: (id, patch) => {
    const d = get().draft;
    if (!d) return;
    const baseGrams = { ...d.baseGrams };
    const items = d.items.map((it) => {
      if (it.id !== id) return it;
      const next = { ...it, ...patch, userEdited: true };
      if (patch.grams !== undefined) {
        next.grams = clampGrams(patch.grams);
        // keep slider relative to the edited value
        baseGrams[id] = next.grams / d.portion;
      }
      return next;
    });
    set({ draft: { ...d, items, baseGrams } });
  },

  addItem: () => {
    const d = get().draft;
    if (!d) return;
    const item: DraftItem = {
      id: newId(), name: 'New item', grams: 100, kcalPer100g: 100, proteinPer100g: 5, carbsPer100g: 15, fatPer100g: 2,
      confidence: 1, userEdited: true,
    };
    set({ draft: { ...d, items: [...d.items, item], baseGrams: { ...d.baseGrams, [item.id]: item.grams / d.portion } } });
  },

  removeItem: (id) => {
    const d = get().draft;
    if (!d) return;
    set({ draft: { ...d, items: d.items.filter((i) => i.id !== id) } });
  },

  setMealType: (t) => {
    const d = get().draft;
    if (d) set({ draft: { ...d, mealType: t } });
  },

  clear: () => set({ draft: null }),
}));
