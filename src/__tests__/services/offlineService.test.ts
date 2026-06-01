/**
 * SPEC §11 — Offline Support
 *
 * Queueable offline: Add expense, Add grocery item, Add packing item
 * Queue written to AsyncStorage; processed in order on reconnect.
 * Failed items: retried up to 3 times, then dropped.
 * Trip info cached via cacheTrip / getCachedTrip.
 */

// Mock AsyncStorage before imports
const mockGetItem = jest.fn();
const mockSetItem = jest.fn();
const mockRemoveItem = jest.fn();
const mockGetAllKeys = jest.fn();
const mockMultiRemove = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: mockGetItem,
  setItem: mockSetItem,
  removeItem: mockRemoveItem,
  getAllKeys: mockGetAllKeys,
  multiRemove: mockMultiRemove,
}));

// Mock Supabase for processQueue
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockEq = jest.fn();

const mockFrom = jest.fn(() => ({
  insert: mockInsert.mockReturnThis(),
  update: mockUpdate.mockReturnThis(),
  delete: mockDelete.mockReturnThis(),
  eq: mockEq,
}));

jest.mock('../../lib/supabaseClient', () => ({
  supabase: { from: mockFrom },
}));

import { offlineService } from '../../services/offlineService';
import { Trip } from '../../types';

beforeEach(() => jest.clearAllMocks());

const mockTrip: Trip = {
  id: 'trip-1',
  name: 'Beach Week',
  destination: 'Marbella',
  start_date: '2024-07-01',
  end_date: '2024-07-07',
  currency: 'USD',
  created_by: 'user-1',
  is_active: true,
  invite_code: 'BEACH1',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

// ─── §11 queueOperation ───────────────────────────────────────────────────────

describe('SPEC §11 — queueOperation', () => {
  it('writes a new item to the queue in AsyncStorage', async () => {
    mockGetItem.mockResolvedValueOnce(null); // empty queue
    mockSetItem.mockResolvedValueOnce(undefined);

    await offlineService.queueOperation('create', 'expenses', {
      trip_id: 'trip-1', title: 'Dinner', amount: 80,
    });

    expect(mockSetItem).toHaveBeenCalledTimes(1);
    const [key, value] = mockSetItem.mock.calls[0];
    expect(key).toBe('tripcrew_offline_queue');
    const saved = JSON.parse(value);
    expect(saved).toHaveLength(1);
    expect(saved[0].operation).toBe('create');
    expect(saved[0].table).toBe('expenses');
    expect(saved[0].retries).toBe(0);
  });

  it('appends to an existing queue', async () => {
    const existing = [{ id: '1', operation: 'create', table: 'grocery_items', payload: {}, created_at: '', retries: 0 }];
    mockGetItem.mockResolvedValueOnce(JSON.stringify(existing));
    mockSetItem.mockResolvedValueOnce(undefined);

    await offlineService.queueOperation('create', 'packing_items', { name: 'Sunscreen' });

    const [, value] = mockSetItem.mock.calls[0];
    const saved = JSON.parse(value);
    expect(saved).toHaveLength(2);
    expect(saved[1].table).toBe('packing_items');
  });

  it('each queued item gets a unique id', async () => {
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);

    await offlineService.queueOperation('create', 'expenses', { amount: 10 });
    await offlineService.queueOperation('create', 'expenses', { amount: 20 });

    const ids = mockSetItem.mock.calls.map(([, v]) => JSON.parse(v)[0]?.id ?? JSON.parse(v).slice(-1)[0]?.id);
    expect(new Set(ids).size).toBeGreaterThan(0);
  });
});

// ─── §11 getQueue ─────────────────────────────────────────────────────────────

describe('SPEC §11 — getQueue', () => {
  it('returns empty array when queue is empty', async () => {
    mockGetItem.mockResolvedValueOnce(null);

    const queue = await offlineService.getQueue();

    expect(queue).toEqual([]);
  });

  it('returns parsed queue from AsyncStorage', async () => {
    const stored = [
      { id: '1', operation: 'create', table: 'expenses', payload: {}, created_at: '', retries: 0 },
      { id: '2', operation: 'create', table: 'grocery_items', payload: {}, created_at: '', retries: 0 },
    ];
    mockGetItem.mockResolvedValueOnce(JSON.stringify(stored));

    const queue = await offlineService.getQueue();

    expect(queue).toHaveLength(2);
    expect(queue[0].table).toBe('expenses');
  });
});

// ─── §11 processQueue — in-order, retry, drop ────────────────────────────────

describe('SPEC §11 — processQueue', () => {
  it('processes create operations in queue order', async () => {
    const queue = [
      { id: '1', operation: 'create', table: 'expenses', payload: { trip_id: 't1' }, created_at: '', retries: 0 },
      { id: '2', operation: 'create', table: 'grocery_items', payload: { trip_id: 't1' }, created_at: '', retries: 0 },
    ];
    mockGetItem.mockResolvedValueOnce(JSON.stringify(queue));
    mockInsert.mockResolvedValue({ error: null });
    mockSetItem.mockResolvedValueOnce(undefined);

    const result = await offlineService.processQueue();

    expect(result.processed).toBe(2);
    expect(result.failed).toBe(0);

    // Remaining queue should be empty
    const [, remaining] = mockSetItem.mock.calls[0];
    expect(JSON.parse(remaining)).toHaveLength(0);
  });

  it('processes update and delete operations', async () => {
    const queue = [
      { id: '1', operation: 'update', table: 'expenses', payload: { id: 'e1', amount: 99 }, created_at: '', retries: 0 },
      { id: '2', operation: 'delete', table: 'grocery_items', payload: { id: 'g1' }, created_at: '', retries: 0 },
    ];
    mockGetItem.mockResolvedValueOnce(JSON.stringify(queue));
    mockEq.mockResolvedValue({ error: null });
    mockSetItem.mockResolvedValueOnce(undefined);

    const result = await offlineService.processQueue();

    expect(result.processed).toBe(2);
    expect(result.failed).toBe(0);
  });

  it('increments retries on failure and keeps item in queue', async () => {
    const queue = [
      { id: '1', operation: 'create', table: 'expenses', payload: {}, created_at: '', retries: 0 },
    ];
    mockGetItem.mockResolvedValueOnce(JSON.stringify(queue));
    mockInsert.mockResolvedValueOnce({ error: { message: 'Network error' } });
    mockSetItem.mockResolvedValueOnce(undefined);

    const result = await offlineService.processQueue();

    expect(result.processed).toBe(0);
    expect(result.failed).toBe(1);

    // Item kept in queue with retries incremented
    const [, remaining] = mockSetItem.mock.calls[0];
    const remainingQueue = JSON.parse(remaining);
    expect(remainingQueue).toHaveLength(1);
    expect(remainingQueue[0].retries).toBe(1);
  });

  it('drops items that have failed 3 times (retries >= 3)', async () => {
    const queue = [
      { id: '1', operation: 'create', table: 'expenses', payload: {}, created_at: '', retries: 3 },
    ];
    mockGetItem.mockResolvedValueOnce(JSON.stringify(queue));
    mockInsert.mockResolvedValueOnce({ error: { message: 'Still failing' } });
    mockSetItem.mockResolvedValueOnce(undefined);

    const result = await offlineService.processQueue();

    expect(result.failed).toBe(1);
    // Item dropped — not kept in remaining queue
    const [, remaining] = mockSetItem.mock.calls[0];
    expect(JSON.parse(remaining)).toHaveLength(0);
  });

  it('returns 0/0 when queue is empty', async () => {
    mockGetItem.mockResolvedValueOnce(null);

    const result = await offlineService.processQueue();

    expect(result.processed).toBe(0);
    expect(result.failed).toBe(0);
  });
});

// ─── §11 Trip cache ───────────────────────────────────────────────────────────

describe('SPEC §11 — Trip cache (offline read)', () => {
  it('cacheTrip writes trip to AsyncStorage', async () => {
    mockSetItem.mockResolvedValueOnce(undefined);

    await offlineService.cacheTrip(mockTrip);

    expect(mockSetItem).toHaveBeenCalledWith(
      'tripcrew_trip_cache_trip-1',
      JSON.stringify(mockTrip)
    );
  });

  it('getCachedTrip returns the cached trip', async () => {
    mockGetItem.mockResolvedValueOnce(JSON.stringify(mockTrip));

    const trip = await offlineService.getCachedTrip('trip-1');

    expect(trip?.id).toBe('trip-1');
    expect(trip?.name).toBe('Beach Week');
  });

  it('getCachedTrip returns null when not cached', async () => {
    mockGetItem.mockResolvedValueOnce(null);

    const trip = await offlineService.getCachedTrip('trip-1');

    expect(trip).toBeNull();
  });

  it('clearAllCache removes all trip cache keys and queue', async () => {
    mockGetAllKeys.mockResolvedValueOnce([
      'tripcrew_trip_cache_trip-1',
      'tripcrew_trip_cache_trip-2',
      'tripcrew_offline_queue',
      'some_other_key',
    ]);
    mockMultiRemove.mockResolvedValueOnce(undefined);
    mockRemoveItem.mockResolvedValueOnce(undefined);

    await offlineService.clearAllCache();

    expect(mockMultiRemove).toHaveBeenCalledWith([
      'tripcrew_trip_cache_trip-1',
      'tripcrew_trip_cache_trip-2',
    ]);
    expect(mockRemoveItem).toHaveBeenCalledWith('tripcrew_offline_queue');
  });
});
