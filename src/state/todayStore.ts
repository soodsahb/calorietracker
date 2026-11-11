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

// Monotonic request id: only the latest load may write results (out-of-order DB replies
// would otherwise show another day's meals, or resurrect meals after delete-all/reset).
let loadSeq = 0;

export const useTodayStore = create<TodayState>((set, get) => ({
  day: dayKey(new Date()),
  meals: [],
  loading: false,
  load: async (day) => {
    const seq = ++loadSeq;
    const d = day ?? dayKey(new Date());
    set({ loading: true, day: d });
    const { from, to } = dayRange(d);
    try {
      const meals = await mealsRepo.listRange(from, to);
      if (seq === loadSeq) set({ meals });
    } finally {
      if (seq === loadSeq) set({ loading: false });
    }
  },
  removeMeal: async (id) => {
    await mealsRepo.remove(id);
    await get().load(get().day);
  },
  reset: () => {
    loadSeq++;
    set({ meals: [], loading: false, day: dayKey(new Date()) });
  },
}));
