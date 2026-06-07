import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { LiveLocation } from '../types';

const CHANNEL = (tripId: string) => `live-location:${tripId}`;
const BROADCAST_EVENT = 'location-update';
const STOP_EVENT = 'location-stop';
const LIVE_LOCATION_FRESH_MS = 5 * 60 * 1000;
const BACKGROUND_LOCATION_TASK = 'tripcrew-background-live-location';
const ACTIVE_BACKGROUND_SESSION_KEY = 'tripcrew.activeLiveLocationSession';
const BACKGROUND_LOCATION_BUILD_ERROR =
  'Background live location is not configured in this build. Rebuild the app with iOS UIBackgroundModes location enabled, then try again.';

const TaskManager = (() => {
  try {
    return require('expo-task-manager') as typeof import('expo-task-manager');
  } catch {
    return null;
  }
})();
const isBackgroundTaskDefined = typeof TaskManager?.defineTask === 'function';

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';
type LocationListener = (location: LiveLocation) => void;

interface LiveLocationSession {
  tripId: string;
  userId: string;
  familyId?: string;
  userName: string;
  familyName?: string;
}

interface ActiveSharingSession {
  tripId: string;
  userId: string;
  listeners: Set<LocationListener>;
  stop: () => void;
}

let activeSharingSession: ActiveSharingSession | null = null;

export function isFreshLiveLocation(timestamp: string, now = Date.now()): boolean {
  const updatedAt = new Date(timestamp).getTime();
  return Number.isFinite(updatedAt) && now - updatedAt <= LIVE_LOCATION_FRESH_MS;
}

function mapLiveLocation(row: any): LiveLocation {
  return {
    userId: row.user_id,
    familyId: row.family_id ?? undefined,
    userName: row.profile?.full_name ?? undefined,
    familyName: row.family?.name ?? undefined,
    latitude: row.latitude,
    longitude: row.longitude,
    accuracy: row.accuracy ?? undefined,
    heading: row.heading ?? undefined,
    timestamp: row.updated_at,
    isLive: isFreshLiveLocation(row.updated_at),
  };
}

function toPayload(session: LiveLocationSession, pos: Location.LocationObject): LiveLocation {
  return {
    userId: session.userId,
    familyId: session.familyId,
    userName: session.userName,
    familyName: session.familyName,
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy: pos.coords.accuracy ?? undefined,
    heading: pos.coords.heading ?? undefined,
    timestamp: new Date(pos.timestamp).toISOString(),
    isLive: true,
  };
}

async function readBackgroundSession(): Promise<LiveLocationSession | null> {
  const raw = await AsyncStorage.getItem(ACTIVE_BACKGROUND_SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LiveLocationSession;
  } catch {
    await AsyncStorage.removeItem(ACTIVE_BACKGROUND_SESSION_KEY);
    return null;
  }
}

async function writeBackgroundSession(session: LiveLocationSession): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_BACKGROUND_SESSION_KEY, JSON.stringify(session));
}

async function clearBackgroundSession(): Promise<void> {
  await AsyncStorage.removeItem(ACTIVE_BACKGROUND_SESSION_KEY);
}

async function isTripLiveLocationAllowed(tripId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('trips')
    .select('is_active,status')
    .eq('id', tripId)
    .maybeSingle();

  if (error || !data) return false;
  return data.is_active !== false && data.status !== 'closed' && data.status !== 'archived';
}

async function upsertLiveLocation(payload: LiveLocation, tripId: string): Promise<void> {
  await supabase
    .from('live_locations')
    .upsert({
      trip_id: tripId,
      user_id: payload.userId,
      family_id: payload.familyId ?? null,
      latitude: payload.latitude,
      longitude: payload.longitude,
      accuracy: payload.accuracy ?? null,
      heading: payload.heading ?? null,
      updated_at: payload.timestamp,
    }, { onConflict: 'trip_id,user_id' });
}

async function deleteLiveLocation(tripId: string, userId: string): Promise<void> {
  await supabase
    .from('live_locations')
    .delete()
    .eq('trip_id', tripId)
    .eq('user_id', userId);
}

async function stopBackgroundLocationTask(): Promise<void> {
  if (!isBackgroundTaskDefined) return;
  const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  if (hasStarted) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }
}

async function startBackgroundLocationTask(): Promise<void> {
  if (!isBackgroundTaskDefined) return;
  const taskManagerAvailable = await TaskManager?.isAvailableAsync?.();
  if (!taskManagerAvailable) return;

  const available = await Location.isBackgroundLocationAvailableAsync();
  if (!available) return;

  const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  if (hasStarted) return;

  try {
    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 60_000,
      distanceInterval: 50,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'TripCrew live location',
        notificationBody: 'Sharing your location with this trip until the trip is closed or you turn it off.',
        notificationColor: '#4F7FFF',
      },
    });
  } catch (error: any) {
    const message = String(error?.message ?? error);
    if (message.includes('UIBackgroundModes') || message.includes('Background location has not been configured')) {
      throw new Error(BACKGROUND_LOCATION_BUILD_ERROR);
    }
    throw error;
  }
}

if (isBackgroundTaskDefined) {
  TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
    if (error) return;

    const session = await readBackgroundSession();
    if (!session) {
      await stopBackgroundLocationTask().catch(() => {});
      return;
    }

    const tripIsLive = await isTripLiveLocationAllowed(session.tripId);
    if (!tripIsLive) {
      await deleteLiveLocation(session.tripId, session.userId).catch(() => {});
      await clearBackgroundSession();
      await stopBackgroundLocationTask().catch(() => {});
      return;
    }

    const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations ?? [];
    for (const location of locations) {
      const payload = toPayload(session, location);
      await upsertLiveLocation(payload, session.tripId).catch(() => {});
    }
  });
}

export const locationService = {
  // ── Permission ──────────────────────────────────────────────────────────────

  async requestPermission(): Promise<PermissionStatus> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status as PermissionStatus;
  },

  async requestBackgroundPermission(): Promise<PermissionStatus> {
    const { status } = await Location.requestBackgroundPermissionsAsync();
    return status as PermissionStatus;
  },

  async checkPermission(): Promise<PermissionStatus> {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status as PermissionStatus;
  },

  async checkBackgroundPermission(): Promise<PermissionStatus> {
    const { status } = await Location.getBackgroundPermissionsAsync();
    return status as PermissionStatus;
  },

  async canUseBackgroundSharing(): Promise<boolean> {
    if (!isBackgroundTaskDefined) return false;
    const taskManagerAvailable = await TaskManager?.isAvailableAsync?.();
    if (!taskManagerAvailable) return false;
    return Location.isBackgroundLocationAvailableAsync();
  },

  // ── Sharing ─────────────────────────────────────────────────────────────────

  /**
   * Begin broadcasting this device's position to all trip members.
   * Returns a stop function — call it to stop sharing and notify others.
   */
  async startSharing(
    tripId: string,
    userId: string,
    familyId: string | undefined,
    userName: string,
    familyName: string | undefined,
    onLocation?: LocationListener
  ): Promise<() => void> {
    activeSharingSession?.stop();
    const session: LiveLocationSession = { tripId, userId, familyId, userName, familyName };

    const channel = supabase.channel(CHANNEL(tripId));
    const listeners = new Set<LocationListener>();
    if (onLocation) listeners.add(onLocation);
    let stopSharingNow = () => {};

    // Subscribe with a 6-second timeout so the UI never hangs indefinitely
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 6000); // resolve anyway after 6s
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR') {
          clearTimeout(timer);
          resolve();
        }
      });
    });

    const broadcast = (pos: Location.LocationObject) => {
      const payload = toPayload(session, pos);
      listeners.forEach((listener) => listener(payload));
      channel.send({ type: 'broadcast', event: BROADCAST_EVENT, payload });
      void (async () => {
        try {
          const tripIsLive = await isTripLiveLocationAllowed(tripId);
          if (!tripIsLive) {
            stopSharingNow();
            return;
          }
          await upsertLiveLocation(payload, tripId);
        } catch {}
      })();
    };

    // Send current position immediately — don't wait for the 8s interval
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      .then(broadcast)
      .catch(() => {});

    const locationSub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, timeInterval: 8000, distanceInterval: 5 },
      broadcast
    );

    const stop = () => {
      locationSub.remove();
      channel.send({ type: 'broadcast', event: STOP_EVENT, payload: { userId } });
      void (async () => {
        try {
          await stopBackgroundLocationTask();
          await clearBackgroundSession();
          await deleteLiveLocation(tripId, userId);
        } catch {}
      })();
      supabase.removeChannel(channel);
      if (activeSharingSession?.tripId === tripId && activeSharingSession.userId === userId) {
        activeSharingSession = null;
      }
    };
    stopSharingNow = stop;

    try {
      await writeBackgroundSession(session);
      await startBackgroundLocationTask();
    } catch (error) {
      stop();
      throw error;
    }

    activeSharingSession = { tripId, userId, listeners, stop };
    return stop;
  },

  isSharing(tripId: string, userId: string): boolean {
    return activeSharingSession?.tripId === tripId && activeSharingSession.userId === userId;
  },

  async isSharingPersisted(tripId: string, userId: string): Promise<boolean> {
    const session = await readBackgroundSession();
    return session?.tripId === tripId && session.userId === userId;
  },

  stopSharing(tripId: string, userId: string): void {
    if (this.isSharing(tripId, userId)) activeSharingSession?.stop();
    void (async () => {
      const session = await readBackgroundSession();
      if (session?.tripId === tripId && session.userId === userId) {
        await stopBackgroundLocationTask();
        await clearBackgroundSession();
        await deleteLiveLocation(tripId, userId);
      }
    })();
  },

  async stopSharingIfTripInactive(tripId: string, userId: string): Promise<boolean> {
    const allowed = await isTripLiveLocationAllowed(tripId);
    if (allowed) return false;
    this.stopSharing(tripId, userId);
    return true;
  },

  registerSharingListener(tripId: string, userId: string, listener: LocationListener): () => void {
    if (!this.isSharing(tripId, userId) || !activeSharingSession) return () => {};
    activeSharingSession.listeners.add(listener);
    return () => {
      activeSharingSession?.listeners.delete(listener);
    };
  },

  unregisterSharingListener(tripId: string, userId: string, listener: LocationListener): void {
    if (this.isSharing(tripId, userId)) {
      activeSharingSession?.listeners.delete(listener);
    }
  },

  // ── Subscribing ─────────────────────────────────────────────────────────────

  async getLiveLocations(tripId: string): Promise<LiveLocation[]> {
    const { data, error } = await supabase
      .from('live_locations')
      .select('*, profile:profiles(*), family:families(*)')
      .eq('trip_id', tripId);

    if (error || !data) return [];
    return data.map(mapLiveLocation);
  },

  /**
   * Subscribe to live location updates from all trip members.
   * Returns an unsubscribe function.
   */
  subscribeToLocations(
    tripId: string,
    onChange: (locations: Map<string, LiveLocation>) => void
  ): () => void {
    const locations = new Map<string, LiveLocation>();

    const channel: RealtimeChannel = supabase
      .channel(CHANNEL(tripId))
      .on('broadcast', { event: BROADCAST_EVENT }, ({ payload }: { payload: LiveLocation }) => {
        locations.set(payload.userId, payload);
        onChange(new Map(locations));
      })
      .on('broadcast', { event: STOP_EVENT }, ({ payload }: { payload: { userId: string } }) => {
        const existing = locations.get(payload.userId);
        if (existing) {
          locations.set(payload.userId, { ...existing, isLive: false });
          onChange(new Map(locations));
        }
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'live_locations', filter: `trip_id=eq.${tripId}` },
        ({ eventType, new: newRow, old: oldRow }: any) => {
          if (eventType === 'DELETE') {
            const userId = oldRow?.user_id;
            if (userId) locations.delete(userId);
          } else if (newRow) {
            const location = mapLiveLocation(newRow);
            const existing = locations.get(location.userId);
            locations.set(location.userId, {
              ...existing,
              ...location,
              userName: location.userName ?? existing?.userName,
              familyName: location.familyName ?? existing?.familyName,
            });
          }
          onChange(new Map(locations));
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  },
};
