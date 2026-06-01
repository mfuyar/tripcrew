import * as Location from 'expo-location';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { LiveLocation } from '../types';

const CHANNEL = (tripId: string) => `live-location:${tripId}`;
const BROADCAST_EVENT = 'location-update';
const STOP_EVENT = 'location-stop';

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

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
    familyName: string | undefined
  ): Promise<() => void> {
    const channel = supabase.channel(CHANNEL(tripId));

    await new Promise<void>((resolve) => {
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve();
      });
    });

    const locationSub = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 8000,   // every 8 seconds
        distanceInterval: 5,  // or every 5 metres moved
      },
      (pos) => {
        const payload: LiveLocation = {
          userId,
          familyId,
          userName,
          familyName,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? undefined,
          heading: pos.coords.heading ?? undefined,
          timestamp: new Date(pos.timestamp).toISOString(),
          isLive: true,
        };
        channel.send({ type: 'broadcast', event: BROADCAST_EVENT, payload });
      }
    );

    return () => {
      locationSub.remove();
      // Notify others this user stopped sharing
      channel.send({ type: 'broadcast', event: STOP_EVENT, payload: { userId } });
      supabase.removeChannel(channel);
    };
  },

  // ── Subscribing ─────────────────────────────────────────────────────────────

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
