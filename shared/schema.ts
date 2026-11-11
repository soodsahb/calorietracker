import { z } from 'zod';

export const Item = z.object({
  name: z.string().min(1).max(80),
  grams: z.number().min(1).max(3000),
  kcalPer100g: z.number().min(0).max(900),
  proteinPer100g: z.number().min(0).max(100),
  carbsPer100g: z.number().min(0).max(100),
  fatPer100g: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
});

export const Analysis = z.object({
  items: z.array(Item).max(20),
  needsClarification: z.boolean(),
  clarifyingQuestion: z.string().max(200).nullable(),
  suggestedAnswers: z.array(z.string().max(40)).max(4),
  notFood: z.boolean(),
});

export type ItemT = z.infer<typeof Item>;
export type AnalysisT = z.infer<typeof Analysis>;
export const NOTE_MAX = 300;
