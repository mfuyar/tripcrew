/**
 * SPEC §2 — Trips
 *
 * §2.1 Create Trip: required fields, creator added as trip_organizer, invite code generated
 * §2.2 Join Trip: validates code, adds user as member role
 * §2.3 Trip List: only user's trips, sorted by start_date desc
 */

const mockSingle = jest.fn();
const mockEq = jest.fn();
const mockOrder = jest.fn();
const mockSelect = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();

const mockFrom = jest.fn((table: string) => ({
  select: mockSelect.mockReturnThis(),
  insert: mockInsert.mockReturnThis(),
  update: mockUpdate.mockReturnThis(),
  delete: mockDelete.mockReturnThis(),
  upsert: table === 'profiles' ? mockUpsert : jest.fn().mockReturnThis(),
  eq: mockEq.mockReturnThis(),
  order: mockOrder.mockReturnThis(),
  single: mockSingle,
}));

const mockGetSession = jest.fn().mockResolvedValue({
  data: { session: { user: { id: 'user-1', email: 'test@test.com', user_metadata: {} } } },
});
const mockUpsert = jest.fn().mockResolvedValue({ error: null });

jest.mock('../../lib/supabaseClient', () => ({
  supabase: {
    from: mockFrom,
    auth: { getSession: mockGetSession },
  },
}));

import { tripService } from '../../services/tripService';

beforeEach(() => jest.clearAllMocks());

const userId = 'user-1';
const tripId = 'trip-1';

const tripInput = {
  name: 'Greek Island Hop',
  destination: 'Santorini',
  start_date: '2024-08-01',
  end_date: '2024-08-10',
  currency: 'EUR',
};

// ─── §2.1 Create Trip ─────────────────────────────────────────────────────────

describe('SPEC §2.1 — Create Trip', () => {
  it('inserts trip with all required fields', async () => {
    const created = { id: tripId, ...tripInput, created_by: userId, invite_code: 'ABC123', is_active: true };
    mockSingle.mockResolvedValueOnce({ data: created, error: null });

    const { data, error } = await tripService.createTrip(userId, tripInput);

    expect(error).toBeNull();
    expect(mockFrom).toHaveBeenCalledWith('trips');
    expect(data?.name).toBe('Greek Island Hop');
    expect(data?.destination).toBe('Santorini');
    expect(data?.currency).toBe('EUR');
  });

  it('auto-generates an invite_code', async () => {
    const created = { id: tripId, ...tripInput, created_by: userId, invite_code: 'XY9Z2K', is_active: true };
    mockSingle.mockResolvedValueOnce({ data: created, error: null });

    const { data } = await tripService.createTrip(userId, tripInput);

    expect(data?.invite_code).toBeDefined();
    expect(data?.invite_code.length).toBeGreaterThan(0);
  });

  it('automatically adds creator to trip_members after creation', async () => {
    const created = { id: tripId, ...tripInput, created_by: userId, invite_code: 'ABC123', is_active: true };
    mockSingle.mockResolvedValueOnce({ data: created, error: null });

    await tripService.createTrip(userId, tripInput);

    // Second from() call must be trip_members
    const fromCalls = (mockFrom as jest.Mock).mock.calls;
    expect(fromCalls.some(([t]) => t === 'trip_members')).toBe(true);
  });

  it('creator is inserted with trip_organizer role', async () => {
    const created = { id: tripId, ...tripInput, created_by: userId, invite_code: 'ABC123', is_active: true };
    mockSingle.mockResolvedValueOnce({ data: created, error: null });

    await tripService.createTrip(userId, tripInput);

    // Check the insert payload to trip_members includes role = trip_organizer
    const insertCalls = (mockInsert as jest.Mock).mock.calls;
    const memberInsert = insertCalls.find((args) =>
      args[0] && args[0].role === 'trip_organizer'
    );
    expect(memberInsert).toBeDefined();
  });

  it('returns error if DB insert fails', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'unique constraint violation' } });

    const { data, error } = await tripService.createTrip(userId, tripInput);

    expect(data).toBeNull();
    expect(error).toBeTruthy();
  });
});

// ─── §2.2 Join Trip ───────────────────────────────────────────────────────────

describe('SPEC §2.2 — Join Trip', () => {
  const mockTrip = { id: tripId, ...tripInput, created_by: 'other-user', invite_code: 'ABC123' };

  it('returns trip on valid invite code for new member', async () => {
    mockSingle
      .mockResolvedValueOnce({ data: mockTrip, error: null })       // trip lookup
      .mockResolvedValueOnce({ data: null, error: { message: 'No rows' } }); // not yet member

    const { data, error } = await tripService.joinTrip(userId, 'ABC123');

    expect(error).toBeNull();
    expect(data?.id).toBe(tripId);
  });

  it('new member is added with member role', async () => {
    mockSingle
      .mockResolvedValueOnce({ data: mockTrip, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'No rows' } });

    await tripService.joinTrip(userId, 'ABC123');

    const insertCalls = (mockInsert as jest.Mock).mock.calls;
    const memberInsert = insertCalls.find((args) =>
      args[0] && args[0].role === 'member'
    );
    expect(memberInsert).toBeDefined();
  });

  it('invite code lookup is case-insensitive (uppercased before query)', async () => {
    mockSingle
      .mockResolvedValueOnce({ data: mockTrip, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'No rows' } });

    await tripService.joinTrip(userId, 'abc123'); // lowercase input

    const eqCalls = (mockEq as jest.Mock).mock.calls;
    const inviteCodeCall = eqCalls.find(([col, val]) => col === 'invite_code' && val === 'ABC123');
    expect(inviteCodeCall).toBeDefined();
  });

  it('returns error on invalid invite code', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } });

    const { data, error } = await tripService.joinTrip(userId, 'XXXXXX');

    expect(data).toBeNull();
    expect(error).toBe('Invalid invite code');
  });

  it('returns trip without re-inserting if already a member', async () => {
    mockSingle
      .mockResolvedValueOnce({ data: mockTrip, error: null })
      .mockResolvedValueOnce({ data: { id: 'mem-1' }, error: null }); // already member

    const { data, error } = await tripService.joinTrip(userId, 'ABC123');

    expect(error).toBeNull();
    expect(data?.id).toBe(tripId);
    // insert into trip_members should NOT be called a second time
    const insertCalls = (mockInsert as jest.Mock).mock.calls;
    const tripMemberInserts = insertCalls.filter(
      (args) => args[0] && args[0].role === 'member'
    );
    expect(tripMemberInserts).toHaveLength(0);
  });
});

// ─── §2.3 Trip List ───────────────────────────────────────────────────────────

describe('SPEC §2.3 — Trip List', () => {
  it('queries trip_members for the user (only user trips)', async () => {
    mockOrder.mockResolvedValueOnce({ data: [], error: null });

    await tripService.getMyTrips(userId);

    expect(mockFrom).toHaveBeenCalledWith('trip_members');
    const eqCalls = (mockEq as jest.Mock).mock.calls;
    expect(eqCalls.some(([col, val]) => col === 'user_id' && val === userId)).toBe(true);
  });

  it('orders by created_at descending', async () => {
    mockOrder.mockResolvedValueOnce({ data: [], error: null });

    await tripService.getMyTrips(userId);

    const orderCalls = (mockOrder as jest.Mock).mock.calls;
    expect(orderCalls.some(([col, opts]) => col === 'joined_at' && opts?.ascending === false)).toBe(true);
  });

  it('returns extracted trips from membership rows', async () => {
    const rows = [
      { trips: { id: 'trip-1', name: 'Beach Week' } },
      { trips: { id: 'trip-2', name: 'Alps Trip' } },
    ];
    mockOrder.mockResolvedValueOnce({ data: rows, error: null });

    const { data } = await tripService.getMyTrips(userId);

    expect(data).toHaveLength(2);
    expect(data![0].name).toBe('Beach Week');
    expect(data![1].name).toBe('Alps Trip');
  });
});
