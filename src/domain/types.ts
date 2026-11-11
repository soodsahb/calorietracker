export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export interface MealItem {
  id: string;
  mealId: string;
  name: string;
  grams: number;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  confidence: number;
  userEdited: boolean;
}

export interface Meal {
  id: string;
  loggedAt: string;
  mealType: MealType;
  photoUri?: string;
  imageHash: string;
  note?: string;
  source: 'ai' | 'manual';
  createdAt: string;
  updatedAt: string;
  items: MealItem[];
}

export interface Settings {
  kcalGoal: number;
  proteinGoal: number;
  carbsGoal: number;
  fatGoal: number;
  units: 'g' | 'oz';
  storePhotos: boolean;
}
export const DEFAULT_SETTINGS: Settings = {
  kcalGoal: 2000, proteinGoal: 120, carbsGoal: 220, fatGoal: 65, units: 'g', storePhotos: true,
};
