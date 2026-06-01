/**
 * SPEC §13 — Live Location
 *
 * - requestPermission / checkPermission delegate to expo-location
 * - startSharing subscribes channel and watches position
 * - stop function removes watcher and notifies peers
 * - subscribeToLocations wires up broadcast handlers
 */

import * as Location from 'expo-location';

// ── Supabase mock ─────────────────────────────────────────────────────────────

const mockSend = jest.fn().mockResolvedValue({});
const mockSubscribe = jest.fn();
const mockOn = jest.fn();

const mockChannel = {
  send: mockSend,
  subscribe: mockSubscribe,
  on: mockOn,
};
mockOn.mockReturnValue(mockChannel);
mockSubscribe.mockImplementation((cb?: (status: string) => void) => {
  cb?.('SUBSCRIBED');
  return mockChannel;
});

const mockRemoveChannel = jest.fn();
const mockSupabaseChannel = jest.fn(() => mockChannel);

jest.mock('../../lib/supabaseClient', () => ({
  supabase: {
    channel: mockSupabaseChannel,
    removeChannel: mockRemoveChannel,
  },
}));

import { locationService } from '../../services/locationService';

beforeEach(() => jest.clearAllMocks());

const tripId = 'trip-1';
const userId = 'user-1';
const familyId = 'fam-1';

// ─── §13 Permission ───────────────────────────────────────────────────────────

describe('SPEC §13 — requestPermission', () => {
  it('returns granted when user approves', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock)
      .mockResolvedValueOnce({ status: 'granted' });

    const status = await locationService.requestPermission();

    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalled();
    expect(status).toBe('granted');
  });

  it('returns denied when user refuses', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock)
      .mockResolvedValueOnce({ status: 'denied' });

    const status = await locationService.requestPermission();

    expect(status).toBe('denied');
  });
});

describe('SPEC §13 — checkPermission', () => {
  it('returns current permission without prompting', async () => {
    (Location.getForegroundPermissionsAsync as jest.Mock)
      .mockResolvedValueOnce({ status: 'granted' });

    const status = await locationService.checkPermission();

    expect(Location.getForegroundPermissionsAsync).toHaveBeenCalled();
    expect(status).toBe('granted');
  });
});

// ─── §13 startSharing ─────────────────────────────────────────────────────────

describe('SPEC §13 — startSharing', () => {
  it('creates a Realtime channel for the trip', async () => {
    await locationService.startSharing(tripId, userId, familyId, 'Alex', 'Uyar Family');

    expect(mockSupabaseChannel).toHaveBeenCalledWith(`live-location:${tripId}`);
  });

  it('calls watchPositionAsync with Balanced accuracy', async () => {
    await locationService.startSharing(tripId, userId, familyId, 'Alex', 'Uyar Family');

    expect(Location.watchPositionAsync).toHaveBeenCalledWith(
      expect.objectContaining({ accuracy: Location.Accuracy.Balanced }),
      expect.any(Function)
    );
  });

  it('returns a stop function', async () => {
    const stop = await locationService.startSharing(tripId, userId, familyId, 'Alex', 'Uyar Family');

    expect(typeof stop).toBe('function');
  });

  it('stop function removes the location watcher', async () => {
    const mockRemove = jest.fn();
    (Location.watchPositionAsync as jest.Mock).mockResolvedValueOnce({ remove: mockRemove });

    const stop = await locationService.startSharing(tripId, userId, familyId, 'Alex', 'Uyar Family');
    stop();

    expect(mockRemove).toHaveBeenCalled();
  });

  it('stop function broadcasts a location-stop event to notify peers', async () => {
    const stop = await locationService.startSharing(tripId, userId, familyId, 'Alex', 'Uyar Family');
    stop();

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'location-stop', payload: { userId } })
    );
  });

  it('stop function removes the Supabase channel', async () => {
    const stop = await locationService.startSharing(tripId, userId, familyId, 'Alex', 'Uyar Family');
    stop();

    expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannel);
  });

  it('position callback broadcasts location-update with correct shape', async () => {
    let positionCallback: ((pos: any) => void) | null = null;
    (Location.watchPositionAsync as jest.Mock).mockImplementationOnce(
      (_opts: any, cb: (pos: any) => void) => {
        positionCallback = cb;
        return Promise.resolve({ remove: jest.fn() });
      }
    );

    await locationService.startSharing(tripId, userId, familyId, 'Alex', 'Uyar Family');

    positionCallback!({
      coords: { latitude: 40.7128, longitude: -74.006, accuracy: 8, heading: 90 },
      timestamp: Date.now(),
    });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'location-update',
        payload: expect.objectContaining({
          userId,
          familyId,
          latitude: 40.7128,
          longitude: -74.006,
          isLive: true,
        }),
      })
    );
  });
});

// ─── §13 subscribeToLocations ─────────────────────────────────────────────────

describe('SPEC §13 — subscribeToLocations', () => {
  it('creates a Realtime channel for the trip', () => {
    locationService.subscribeToLocations(tripId, jest.fn());

    expect(mockSupabaseChannel).toHaveBeenCalledWith(`live-location:${tripId}`);
  });

  it('subscribes to location-update and location-stop broadcast events', () => {
    locationService.subscribeToLocations(tripId, jest.fn());

    const onCalls = (mockOn as jest.Mock).mock.calls;
    const events = onCalls.map(([, { event }]) => event);
    expect(events).toContain('location-update');
    expect(events).toContain('location-stop');
  });

  it('location-update handler adds entry to the map and calls onChange', () => {
    const onChange = jest.fn();
    let updateHandler: ((data: any) => void) | null = null;

    mockOn.mockImplementation((_type: string, { event }: { event: string }, handler: (d: any) => void) => {
      if (event === 'location-update') updateHandler = handler;
      return mockChannel;
    });

    locationService.subscribeToLocations(tripId, onChange);

    updateHandler!({
      payload: {
        userId: 'user-2', familyId: 'fam-2', latitude: 48.8566, longitude: 2.3522,
        timestamp: new Date().toISOString(), isLive: true,
      },
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    const map: Map<string, any> = onChange.mock.calls[0][0];
    expect(map.get('user-2')?.latitude).toBe(48.8566);
    expect(map.get('user-2')?.isLive).toBe(true);
  });

  it('location-stop handler marks user as not live', () => {
    const onChange = jest.fn();
    let updateHandler: ((data: any) => void) | null = null;
    let stopHandler: ((data: any) => void) | null = null;

    mockOn.mockImplementation((_type: string, { event }: { event: string }, handler: (d: any) => void) => {
      if (event === 'location-update') updateHandler = handler;
      if (event === 'location-stop') stopHandler = handler;
      return mockChannel;
    });

    locationService.subscribeToLocations(tripId, onChange);

    // First, add a live location
    updateHandler!({
      payload: { userId: 'user-2', latitude: 48.8, longitude: 2.3, timestamp: new Date().toISOString(), isLive: true },
    });

    // Then stop it
    stopHandler!({ payload: { userId: 'user-2' } });

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as Map<string, any>;
    expect(lastCall.get('user-2')?.isLive).toBe(false);
  });

  it('returns an unsubscribe function that removes the channel', () => {
    const unsubscribe = locationService.subscribeToLocations(tripId, jest.fn());
    unsubscribe();

    expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannel);
  });
});
