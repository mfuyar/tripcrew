import * as Location from 'expo-location';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { LiveLocation } from '../types';

const CHANNEL = (tripId: string) => `live-location:${tripId}`;
const BROADCAST_EVENT = 'location-update';
const STOP_EVENT = 'location-stop';

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';
type LocationListener = (location: LiveLocation) => void;

interface ActiveSharingSession {
  tripId: string;
  userId: string;
  listeners: Set<LocationListener>;
  stop: () => void;
}

let activeSharingSession: ActiveSharingSession | null = null;

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
    isLive: true,
  };
}

export const locationService = {
  // ── Permission ──────────────────────────────────────────────────────────────

  async requestPermission(): Promise<PermissionStatus> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status as PermissionStatus;
  },

  async checkPermission(): Promise<PermissionStatus> {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status as PermissionStatus;
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

    const channel = supabase.channel(CHANNEL(tripId));
    const listeners = new Set<LocationListener>();
    if (onLocation) listeners.add(onLocation);

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
      const payload: LiveLocation = {
        userId, familyId, userName, familyName,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? undefined,
        heading: pos.coords.heading ?? undefined,
        timestamp: new Date(pos.timestamp).toISOString(),
        isLive: true,
      };
      listeners.forEach((listener) => listener(payload));
      channel.send({ type: 'broadcast', event: BROADCAST_EVENT, payload });
      void (async () => {
        try {
          await supabase
            .from('live_locations')
            .upsert({
              trip_id: tripId,
              user_id: userId,
              family_id: familyId ?? null,
              latitude: payload.latitude,
              longitude: payload.longitude,
              accuracy: payload.accuracy ?? null,
              heading: payload.heading ?? null,
              updated_at: payload.timestamp,
            }, { onConflict: 'trip_id,user_id' });
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
          await supabase
            .from('live_locations')
            .delete()
            .eq('trip_id', tripId)
            .eq('user_id', userId);
        } catch {}
      })();
      supabase.removeChannel(channel);
      if (activeSharingSession?.tripId === tripId && activeSharingSession.userId === userId) {
        activeSharingSession = null;
      }
    };

    activeSharingSession = { tripId, userId, listeners, stop };
    return stop;
  },

  isSharing(tripId: string, userId: string): boolean {
    return activeSharingSession?.tripId === tripId && activeSharingSession.userId === userId;
  },

  stopSharing(tripId: string, userId: string): void {
    if (this.isSharing(tripId, userId)) activeSharingSession?.stop();
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
      .subscribe();

    return () => supabase.removeChannel(channel);
  },
};
