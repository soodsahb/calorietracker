import type { AnalysisT } from '@shared/schema';

export const CLARIFY_THRESHOLD = 0.6;
export const DEFAULT_QUESTION = 'Can you tell us a bit more about this meal?';

type ClarifyInput = Pick<AnalysisT, 'items' | 'needsClarification'> &
  Partial<Pick<AnalysisT, 'clarifyingQuestion' | 'suggestedAnswers'>>;

export function lowConfidenceIndexes(items: readonly { confidence: number }[]): number[] {
  const out: number[] = [];
  items.forEach((it, i) => {
    if (it.confidence < CLARIFY_THRESHOLD) out.push(i);
  });
  return out;
}

/** The sheet shows when the model asks for it or any item is below the threshold. */
export function shouldClarify(a: ClarifyInput): boolean {
  return a.needsClarification || lowConfidenceIndexes(a.items).length > 0;
}

export interface ClarifyPrompt {
  question: string;
  chips: string[];
}

export function buildClarifyPrompt(a: ClarifyInput): ClarifyPrompt {
  const q = a.clarifyingQuestion?.trim();
  return {
    question: q ? q : DEFAULT_QUESTION,
    chips: (a.suggestedAnswers ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 4),
  };
}

/** Combine a chip answer and free text into the single note sent on re-analysis. */
export function composeNote(chip: string | null, freeText: string, max: number): string {
  const parts = [chip?.trim(), freeText.trim()].filter((s): s is string => !!s);
  return parts.join('. ').slice(0, max);
}
