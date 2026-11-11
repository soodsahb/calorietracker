import { create } from 'zustand';
import { settingsRepo } from '@/db/settingsRepo';
import { DEFAULT_SETTINGS, type Settings } from '@/domain/types';

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<Settings>) => Promise<void>;
  reset: () => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  load: async () => {
    set({ settings: await settingsRepo.load(), loaded: true });
  },
  update: async (patch) => {
    set({ settings: { ...get().settings, ...patch } });
    await settingsRepo.save(patch);
  },
  reset: () => set({ settings: DEFAULT_SETTINGS }),
}));
