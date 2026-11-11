/**
 * Regression tests for issues listed in docs/REVIEW.md (app side).
 */
const mockListRange = jest.fn();
const mockDeleteAll = jest.fn();
const mockTokenClear = jest.fn();
const mockFileDelete = jest.fn();
let mockFileExists = true;
const mockDeleteAllPhotos = jest.fn();

jest.mock('@/db/mealsRepo', () => ({
  mealsRepo: {
    listRange: (...a: unknown[]) => mockListRange(...a),
    deleteAll: (...a: unknown[]) => mockDeleteAll(...a),
    listAll: jest.fn(async () => []),
  },
}));
jest.mock('@/db/settingsRepo', () => ({ settingsRepo: { load: jest.fn(async () => ({})) } }));
jest.mock('@/api/tokenStore', () => ({ secureTokenStore: { clear: (...a: unknown[]) => mockTokenClear(...a) } }));
jest.mock('@/image/photos', () => ({ deleteAllPhotos: () => mockDeleteAllPhotos() }));
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache' },
  File: jest.fn().mockImplementation((dir: string, name: string) => ({
    uri: `${dir}/${name}`,
    get exists() {
      return mockFileExists;
    },
    delete: () => mockFileDelete(`${dir}/${name}`),
  })),
}));

import { useTodayStore } from '@/state/todayStore';
import { deleteAllData, EXPORT_FILE_NAME } from '@/services/data';
import { migrate, MIGRATIONS } from '@/db/migrations';
import { buildClarifyPrompt } from '@/domain/clarify';
import { createApiClient, type TokenStore } from '@/api/client';
import type { Meal } from '@/domain/types';

const meal = (id: string): Meal => ({
  id, loggedAt: '2025-01-01T12:00:00.000Z', mealType: 'lunch', imageHash: '', source: 'manual',
  createdAt: '', updatedAt: '', items: [],
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFileExists = true;
  useTodayStore.getState().reset();
});

describe('todayStore.load', () => {
  it('a slow, older load cannot overwrite a newer one (out-of-order replies)', async () => {
    const slow = deferred<Meal[]>();
    const fast = deferred<Meal[]>();
    mockListRange.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);
    const p1 = useTodayStore.getState().load('2025-01-01');
    const p2 = useTodayStore.getState().load('2025-01-02');
    fast.resolve([meal('new-day')]);
    await p2;
    slow.resolve([meal('old-day')]);
    await p1;
    const s = useTodayStore.getState();
    expect(s.day).toBe('2025-01-02');
    expect(s.meals.map((m) => m.id)).toEqual(['new-day']);
    expect(s.loading).toBe(false);
  });

  it('DB error does not leave loading stuck', async () => {
    mockListRange.mockRejectedValueOnce(new Error('db'));
    await expect(useTodayStore.getState().load('2025-01-01')).rejects.toThrow('db');
    expect(useTodayStore.getState().loading).toBe(false);
  });

  it('reset() discards an in-flight load (no meals resurrected after delete-all)', async () => {
    const d = deferred<Meal[]>();
    mockListRange.mockReturnValueOnce(d.promise);
    const p = useTodayStore.getState().load('2025-01-01');
    useTodayStore.getState().reset();
    d.resolve([meal('stale')]);
    await p;
    expect(useTodayStore.getState().meals).toEqual([]);
  });
});

describe('deleteAllData', () => {
  it('also removes the leftover export file (contains full history)', async () => {
    await deleteAllData();
    expect(mockDeleteAll).toHaveBeenCalled();
    expect(mockDeleteAllPhotos).toHaveBeenCalled();
    expect(mockTokenClear).toHaveBeenCalled();
    expect(mockFileDelete).toHaveBeenCalledWith(`file:///cache/${EXPORT_FILE_NAME}`);
  });

  it('still wipes photos, export and token when the DB wipe fails, then reports the error', async () => {
    mockDeleteAll.mockRejectedValueOnce(new Error('locked'));
    await expect(deleteAllData()).rejects.toThrow('locked');
    expect(mockDeleteAllPhotos).toHaveBeenCalled();
    expect(mockFileDelete).toHaveBeenCalled();
    expect(mockTokenClear).toHaveBeenCalled();
  });
});

describe('migrations', () => {
  it('bumps user_version inside the same transaction as the DDL', async () => {
    const log: string[] = [];
    let inTx = false;
    const db = {
      execAsync: jest.fn(async (sql: string) => { log.push(`${inTx ? 'tx' : 'no-tx'}:${sql.trim().slice(0, 30)}`); }),
      getFirstAsync: jest.fn(async () => ({ user_version: 0 })),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => { inTx = true; try { await fn(); } finally { inTx = false; } }),
    };
    await migrate(db as never);
    const bumps = log.filter((l) => l.includes('user_version'));
    expect(bumps).toHaveLength(MIGRATIONS.length);
    for (const b of bumps) expect(b.startsWith('tx:')).toBe(true);
  });
});

describe('clarify chips', () => {
  it('dedupes suggested answers (they are used as React keys)', () => {
    const p = buildClarifyPrompt({ items: [], needsClarification: true, clarifyingQuestion: 'q', suggestedAnswers: ['Ham', ' Ham ', 'Cheese', 'Ham'] });
    expect(p.chips).toEqual(['Ham', 'Cheese']);
  });
});

describe('api client registration', () => {
  it('concurrent first requests register only once', async () => {
    const store: TokenStore & { value: string | null } = {
      value: null,
      get: async () => store.value,
      set: async (t) => { store.value = t; },
      clear: async () => { store.value = null; },
    };
    const ok = {
      items: [], needsClarification: false, clarifyingQuestion: null, suggestedAnswers: [], notFood: true,
    };
    const f = jest.fn(async (url: string) =>
      new Response(JSON.stringify(url.endsWith('/v1/register') ? { token: 'tok' } : ok), { status: 200 }),
    );
    const api = createApiClient({ baseUrl: 'https://api.test', tokenStore: store, fetchImpl: f as never, sleep: async () => {} });
    await Promise.all([api.analyze({ imageUri: 'file:///a.jpg' }), api.analyze({ imageUri: 'file:///b.jpg' })]);
    expect(f.mock.calls.filter(([u]) => String(u).endsWith('/v1/register'))).toHaveLength(1);
  });
});
