/**
 * SPEC: Trip Service
 *
 * Tests trip creation, listing, joining by invite code, and deletion.
 * Covers SPEC §2.1, §2.2, §2.3.
 */

const mockSingle = jest.fn();
const mockEq = jest.fn();
const mockOrder = jest.fn();
const mockSelect = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();

const mockFrom = jest.fn(() => ({
  select: mockSelect.mockReturnThis(),
  insert: mockInsert.mockReturnThis(),
  update: mockUpdate.mockReturnThis(),
  delete: mockDelete.mockReturnThis(),
  eq: mockEq.mockReturnThis(),
  order: mockOrder.mockReturnThis(),
  single: mockSingle,
}));

jest.mock('../../lib/supabaseClient', () => ({
  supabase: { from: mockFrom },
}));

import { tripService } from '../../services/tripService';

beforeEach(() => jest.clearAllMocks());

describe('tripService', () => {
  const userId = 'user-1';
  const tripId = 'trip-1';

  const mockTrip = {
    id: tripId,
    name: 'Beach Week',
    destination: 'Marbella',
    start_date: '2024-07-01',
    end_date: '2024-07-07',
    currency: 'USD',
    created_by: userId,
    is_active: true,
    invite_code: 'ABC123',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };

  describe('createTrip', () => {
    // SPEC §2.1: Trip created, creator added as trip_organizer
    it('creates a trip and inserts creator as organizer', async () => {
      mockSingle.mockResolvedValueOnce({ data: mockTrip, error: null });
      // Second insert (trip_members) uses default mockReturnThis — result ignored by service

      const input = {
        name: 'Beach Week',
        destination: 'Marbella',
        start_date: '2024-07-01',
        end_date: '2024-07-07',
        currency: 'USD',
      };

      const { data, error } = await tripService.createTrip(userId, input);

      expect(mockFrom).toHaveBeenCalledWith('trips');
      expect(mockFrom).toHaveBeenCalledWith('trip_members');
      expect(error).toBeNull();
      expect(data?.name).toBe('Beach Week');
      expect(data?.invite_code).toBeDefined();
    });

    // DB failure → error returned
    it('returns error if trip insert fails', async () => {
      mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } });

      const { data, error } = await tripService.createTrip(userId, {
        name: 'Fail Trip',
        destination: 'Nowhere',
        start_date: '2024-07-01',
        end_date: '2024-07-07',
        currency: 'USD',
      });

      expect(data).toBeNull();
      expect(error).toBe('DB error');
    });
  });

  describe('getMyTrips', () => {
    // SPEC §2.3: Shows trips user belongs to, sorted by start_date desc
    it('returns trips for a user', async () => {
      const rows = [
        { trips: mockTrip },
        { trips: { ...mockTrip, id: 'trip-2', name: 'Alps Week' } },
      ];
      mockOrder.mockResolvedValueOnce({ data: rows, error: null });

      const { data, error } = await tripService.getMyTrips(userId);

      expect(mockFrom).toHaveBeenCalledWith('trip_members');
      expect(error).toBeNull();
      expect(data).toHaveLength(2);
      expect(data?.[0].name).toBe('Beach Week');
    });

    it('returns empty array if user has no trips', async () => {
      mockOrder.mockResolvedValueOnce({ data: [], error: null });

      const { data, error } = await tripService.getMyTrips(userId);

      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });

  describe('joinTrip', () => {
    // SPEC §2.2: Valid invite code → user added as member
    it('adds user to trip on valid invite code when not already a member', async () => {
      // Call 1: find trip by invite code
      mockSingle.mockResolvedValueOnce({ data: mockTrip, error: null });
      // Call 2: check existing membership → not found
      mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'No rows' } });
      // Call 3: insert member → uses default mock (result ignored)

      const { data, error } = await tripService.joinTrip(userId, 'ABC123');

      expect(mockFrom).toHaveBeenCalledWith('trips');
      expect(mockFrom).toHaveBeenCalledWith('trip_members');
      expect(error).toBeNull();
      expect(data?.id).toBe(tripId);
    });

    // Already a member → returns trip without re-inserting
    it('returns existing trip if user is already a member', async () => {
      mockSingle.mockResolvedValueOnce({ data: mockTrip, error: null }); // trip lookup
      mockSingle.mockResolvedValueOnce({ data: { id: 'mem-1' }, error: null }); // existing member

      const { data, error } = await tripService.joinTrip(userId, 'ABC123');

      expect(error).toBeNull();
      expect(data?.id).toBe(tripId);
      // trip_members insert should NOT be called a second time
      const insertCalls = (mockFrom as jest.Mock).mock.calls.filter(([t]) => t === 'trip_members');
      expect(insertCalls).toHaveLength(1); // only the select check, no insert
    });

    // SPEC §2.2: Invalid invite code → error
    it('returns error on invalid invite code', async () => {
      mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } });

      const { data, error } = await tripService.joinTrip(userId, 'INVALID');

      expect(data).toBeNull();
      expect(error).toBe('Invalid invite code');
    });
  });

  describe('getTripById', () => {
    it('returns a trip by id', async () => {
      mockSingle.mockResolvedValueOnce({ data: mockTrip, error: null });

      const { data, error } = await tripService.getTripById(tripId);

      expect(error).toBeNull();
      expect(data?.id).toBe(tripId);
    });
  });

  describe('deleteTrip', () => {
    it('deletes a trip and returns no error', async () => {
      mockEq.mockResolvedValueOnce({ data: null, error: null });

      const { error } = await tripService.deleteTrip(tripId);

      expect(mockFrom).toHaveBeenCalledWith('trips');
      expect(error).toBeNull();
    });
  });
});
