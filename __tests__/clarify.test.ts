import { shouldClarify, buildClarifyPrompt, lowConfidenceIndexes, composeNote, DEFAULT_QUESTION, CLARIFY_THRESHOLD } from '@/domain/clarify';

const item = (confidence: number) => ({ confidence });
const a = (over: object = {}) => ({
  items: [item(0.9), item(0.8)] as any[],
  needsClarification: false,
  clarifyingQuestion: null,
  suggestedAnswers: [],
  ...over,
});

describe('ClarifySheet logic', () => {
  it('threshold is 0.6', () => expect(CLARIFY_THRESHOLD).toBe(0.6));
  it('not shown when all confident and model does not ask', () => {
    expect(shouldClarify(a())).toBe(false);
  });
  it('shown when any item < 0.6', () => {
    expect(shouldClarify(a({ items: [item(0.9), item(0.59)] }))).toBe(true);
  });
  it('exactly 0.6 is not low', () => {
    expect(shouldClarify(a({ items: [item(0.6)] }))).toBe(false);
  });
  it('shown when model sets needsClarification', () => {
    expect(shouldClarify(a({ needsClarification: true }))).toBe(true);
  });
  it('lowConfidenceIndexes', () => {
    expect(lowConfidenceIndexes([item(0.1), item(0.7), item(0.5)])).toEqual([0, 2]);
  });
  it('uses model question and trims/limits chips', () => {
    const p = buildClarifyPrompt(a({ clarifyingQuestion: ' What bread? ', suggestedAnswers: ['White', ' ', 'Rye', 'a', 'b', 'c'] }));
    expect(p.question).toBe('What bread?');
    expect(p.chips).toEqual(['White', 'Rye', 'a', 'b']);
  });
  it('falls back to a default question', () => {
    expect(buildClarifyPrompt(a()).question).toBe(DEFAULT_QUESTION);
  });
  it('composeNote merges chip and text, capped', () => {
    expect(composeNote('Rye', 'with ham', 300)).toBe('Rye. with ham');
    expect(composeNote(null, '  ', 300)).toBe('');
    expect(composeNote(null, 'x'.repeat(500), 300)).toHaveLength(300);
  });
});
