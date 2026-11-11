import { create } from 'zustand';
import { mealsRepo } from '@/db/mealsRepo';
import { dayKey, dayRange } from '@/domain/format';
import type { Meal } from '@/domain/types';

interface TodayState {
  day: string;
  meals: Meal[];
  loading: boolean;
  load: (day?: string) => Promise<void>;
  removeMeal: (id: string) => Promise<void>;
  reset: () => void;
}

export const useTodayStore = create<TodayState>((set, get) => ({
  day: dayKey(new Date()),
  meals: [],
  loading: false,
  load: async (day) => {
    const d = day ?? dayKey(new Date());
    set({ loading: true, day: d });
    const { from, to } = dayRange(d);
    const meals = await mealsRepo.listRange(from, to);
    set({ meals, loading: false });
  },
  removeMeal: async (id) => {
    await mealsRepo.remove(id);
    await get().load(get().day);
  },
  reset: () => set({ meals: [], day: dayKey(new Date()) }),
}));
