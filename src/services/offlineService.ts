import AsyncStorage from '@react-native-async-storage/async-storage';
import { OfflineQueueItem, Trip, ServiceResult } from '../types';
import { supabase } from '../lib/supabaseClient';

const QUEUE_KEY = 'tripcrew_offline_queue';
const TRIP_CACHE_PREFIX = 'tripcrew_trip_cache_';

export const offlineService = {
  async queueOperation(
    operation: OfflineQueueItem['operation'],
    table: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const item: OfflineQueueItem = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      operation,
      table,
      payload,
      created_at: new Date().toISOString(),
      retries: 0,
    };
    const queue = await offlineService.getQueue();
    queue.push(item);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  },

  async getQueue(): Promise<OfflineQueueItem[]> {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as OfflineQueueItem[]) : [];
  },

  async processQueue(): Promise<{ processed: number; failed: number }> {
    const queue = await offlineService.getQueue();
    if (!queue.length) return { processed: 0, failed: 0 };

    let processed = 0;
    let failed = 0;
    const remaining: OfflineQueueItem[] = [];

    for (const item of queue) {
      try {
        if (item.operation === 'create') {
          const { error } = await supabase.from(item.table).insert(item.payload);
          if (error) throw error;
        } else if (item.operation === 'update') {
          const { id, ...rest } = item.payload;
          const { error } = await supabase
            .from(item.table)
            .update(rest)
            .eq('id', id);
          if (error) throw error;
        } else if (item.operation === 'delete') {
          const { error } = await supabase
            .from(item.table)
            .delete()
            .eq('id', item.payload.id);
          if (error) throw error;
        }
        processed++;
      } catch (_e) {
        failed++;
        if (item.retries < 3) {
          remaining.push({ ...item, retries: item.retries + 1 });
        }
        // Items with 3+ retries are dropped
      }
    }

    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
    return { processed, failed };
  },

  async getCachedTrip(tripId: string): Promise<Trip | null> {
    const raw = await AsyncStorage.getItem(`${TRIP_CACHE_PREFIX}${tripId}`);
    return raw ? (JSON.parse(raw) as Trip) : null;
  },

  async cacheTrip(trip: Trip): Promise<void> {
    await AsyncStorage.setItem(
      `${TRIP_CACHE_PREFIX}${trip.id}`,
      JSON.stringify(trip)
    );
  },

  async clearTripCache(tripId: string): Promise<void> {
    await AsyncStorage.removeItem(`${TRIP_CACHE_PREFIX}${tripId}`);
  },

  async clearAllCache(): Promise<void> {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter((k) => k.startsWith(TRIP_CACHE_PREFIX));
    await AsyncStorage.multiRemove(cacheKeys);
    await AsyncStorage.removeItem(QUEUE_KEY);
  },
};
