import type { AnalysisT, ItemT } from '@shared/schema';
import { api } from '@/api';
import { cacheRepo } from '@/db/cacheRepo';
import { hashText } from '@/image/prepare';

export function normalizeNote(note?: string): string {
  return (note ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

/** Cache-first analysis keyed by (imageHash, noteHash). */
export async function analyzeWithCache(p: {
  imageUri: string; imageHash: string; note?: string; previousItems?: ItemT[]; signal?: AbortSignal;
}): Promise<AnalysisT> {
  const note = normalizeNote(p.note);
  const noteHash = note ? await hashText(note) : 'none';
  if (!p.previousItems?.length) {
    const hit = await cacheRepo.get(p.imageHash, noteHash).catch(() => null);
    if (hit) return hit;
  }
  const res = await api.analyze({ imageUri: p.imageUri, note, previousItems: p.previousItems, signal: p.signal });
  await cacheRepo.put(p.imageHash, noteHash, res).catch(() => {});
  return res;
}
