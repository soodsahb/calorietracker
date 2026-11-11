import { useColorScheme } from 'react-native';

export interface Palette {
  bg: string; surface: string; surfaceAlt: string; border: string;
  text: string; textMuted: string; primary: string; onPrimary: string;
  danger: string; warn: string; ok: string;
  protein: string; carbs: string; fat: string; ringTrack: string;
}

export const light: Palette = {
  bg: '#F6F7F9', surface: '#FFFFFF', surfaceAlt: '#EEF0F4', border: '#DADDE3',
  text: '#14171C', textMuted: '#555D6B', primary: '#0B7A53', onPrimary: '#FFFFFF',
  danger: '#B3261E', warn: '#9A5B00', ok: '#0B7A53',
  protein: '#3B5BDB', carbs: '#C2570C', fat: '#8A3FBF', ringTrack: '#E3E6EC',
};
export const dark: Palette = {
  bg: '#0E1013', surface: '#181B20', surfaceAlt: '#22262D', border: '#2F343C',
  text: '#F2F4F7', textMuted: '#A3AAB6', primary: '#3DDC97', onPrimary: '#06281A',
  danger: '#FF8A80', warn: '#FFB74D', ok: '#3DDC97',
  protein: '#8EA2FF', carbs: '#FFA45C', fat: '#D49BFF', ringTrack: '#2A2F37',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = { sm: 8, md: 14, lg: 22, pill: 999 } as const;
export const MIN_TOUCH = 44;

export function useTheme(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}
