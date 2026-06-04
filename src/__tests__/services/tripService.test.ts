/**
 * SPEC: Trip Service
 *
 * Tests trip creation, listing, requesting access by invite code, and deletion.
 * Covers SPEC §2.1, §2.2, §2.3.
 */

const mockSingle = jest.fn();
const mockEq = jest.fn();
const mockOrder = jest.fn();
const mockSelect = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockRpc = jest.fn();

const mockFrom = jest.fn(() => ({
  select: mockSelect.mockReturnThis(),
  insert: mockInsert.mockReturnThis(),
  update: mockUpdate.mockReturnThis(),
  delete: mockDelete.mockReturnThis(),
  upsert: jest.fn().mockResolvedValue({ error: null }),
  eq: mockEq.mockReturnThis(),
  order: mockOrder.mockReturnThis(),
  single: mockSingle,
}));

const mockGetSession = jest.fn().mockResolvedValue({
  data: { session: { user: { id: 'user-1', email: 'test@test.com', user_metadata: {} } } },
});
const mockGetUser = jest.fn().mockResolvedValue({
  data: { user: { id: 'user-1', email: 'test@test.com', user_metadata: {} } },
  error: null,
});

jest.mock('../../lib/supabaseClient', () => ({
  supabase: { from: mockFrom, rpc: mockRpc, auth: { getSession: mockGetSession, getUser: mockGetUser } },
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
    invite_code: 'ABC12345',
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

  describe('requestJoinTrip', () => {
    it('creates a pending join request for a valid invite code', async () => {
      mockRpc.mockResolvedValueOnce({
        data: { id: 'req-1', trip_id: tripId, user_id: userId, status: 'pending' },
        error: null,
      });

      const { data, error } = await tripService.requestJoinTrip(userId, 'abc12345');

      expect(error).toBeNull();
      expect(data?.status).toBe('pending');
      expect(mockRpc).toHaveBeenCalledWith('request_trip_join_by_code', {
        p_invite_code: 'ABC12345',
        p_user_id: userId,
      });
    });

    it('joinTrip remains a compatibility wrapper for requesting access', async () => {
      mockRpc.mockResolvedValueOnce({
        data: { id: 'req-1', trip_id: tripId, user_id: userId, status: 'pending' },
        error: null,
      });

      const { data, error } = await tripService.joinTrip(userId, 'ABC12345');

      expect(error).toBeNull();
      expect(data?.status).toBe('pending');
      expect(mockRpc).toHaveBeenCalledWith('request_trip_join_by_code', expect.any(Object));
    });

    it('returns error on invalid invite code', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Invalid invite code' } });

      const { data, error } = await tripService.requestJoinTrip(userId, 'INVALID');

      expect(data).toBeNull();
      expect(error).toBe('Invalid invite code');
    });

    it('reviews a join request through the approval RPC', async () => {
      mockRpc.mockResolvedValueOnce({
        data: { id: 'req-1', trip_id: tripId, user_id: 'new-user', status: 'approved' },
        error: null,
      });

      const { data, error } = await tripService.reviewJoinRequest('req-1', userId, 'approved');

      expect(error).toBeNull();
      expect(data?.status).toBe('approved');
      expect(mockRpc).toHaveBeenCalledWith('review_trip_join_request', {
        p_request_id: 'req-1',
        p_reviewer_id: userId,
        p_status: 'approved',
      });
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
