/**
 * SPEC §3 — Families
 *
 * §3.1 Create Family: required fields, creator linked as family_admin in trip_members
 * §3.2 Family Members: CRUD for family membership
 */

const mockSingle = jest.fn();
const mockEq = jest.fn();
const mockOrder = jest.fn();
const mockSelect = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockRpc = jest.fn();
const mockCapacityFamilySingle = jest.fn();
const mockCapacityMembersEq = jest.fn();

const createQueryMock = (table: string) => {
  const query: Record<string, jest.Mock> = {
    select: jest.fn((columns?: string) => {
      mockSelect(columns);
      if (table === 'families' && columns === 'adults_count,children_count') {
        return {
          eq: jest.fn(() => ({ single: mockCapacityFamilySingle })),
        };
      }
      if (table === 'family_members' && columns === 'user_id') {
        return {
          eq: mockCapacityMembersEq,
        };
      }
      return query;
    }),
    insert: jest.fn((...args: unknown[]) => {
      mockInsert(...args);
      return query;
    }),
    update: jest.fn((...args: unknown[]) => {
      mockUpdate(...args);
      return query;
    }),
    delete: jest.fn((...args: unknown[]) => {
      mockDelete(...args);
      return query;
    }),
    eq: jest.fn((...args: unknown[]) => mockEq(...args) ?? query),
    order: jest.fn((...args: unknown[]) => mockOrder(...args) ?? query),
    single: jest.fn((...args: unknown[]) => mockSingle(...args)),
  };
  return query;
};

const mockFrom = jest.fn((table: string) => createQueryMock(table));

jest.mock('../../lib/supabaseClient', () => ({
  supabase: { from: mockFrom, rpc: mockRpc },
}));

import { FAMILY_FULL_ERROR, familyService } from '../../services/familyService';

beforeEach(() => {
  jest.clearAllMocks();
  mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'missing function' } });
  mockCapacityFamilySingle.mockResolvedValue({
    data: { adults_count: 2, children_count: 1 },
    error: null,
  });
  mockCapacityMembersEq.mockResolvedValue({ data: [], error: null });
});

const tripId = 'trip-1';
const userId = 'user-1';
const familyId = 'family-1';

const mockFamily = {
  id: familyId,
  trip_id: tripId,
  name: 'Uyar Family',
  adults_count: 2,
  children_count: 1,
  created_by: userId,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

// ─── §3.1 Create Family ───────────────────────────────────────────────────────

describe('SPEC §3.1 — Create Family', () => {
  it('inserts family with all required fields and returns it', async () => {
    mockSingle
      .mockResolvedValueOnce({ data: mockFamily, error: null })
      .mockResolvedValueOnce({
        data: { id: 'm1', family_id: familyId, trip_id: tripId, user_id: userId, is_admin: true },
        error: null,
      });

    const { data, error } = await familyService.createFamily(tripId, userId, {
      name: 'Uyar Family',
      adults_count: 2,
      children_count: 1,
      notes: undefined,
      color: '#3B82F6',
    });

    expect(mockFrom).toHaveBeenCalledWith('families');
    expect(error).toBeNull();
    expect(data?.name).toBe('Uyar Family');
    expect(data?.adults_count).toBe(2);
    expect(data?.children_count).toBe(1);
  });

  it('links creator to the family in trip_members after creation', async () => {
    mockSingle
      .mockResolvedValueOnce({ data: mockFamily, error: null })
      .mockResolvedValueOnce({
        data: { id: 'm1', family_id: familyId, trip_id: tripId, user_id: userId, is_admin: true },
        error: null,
      });

    await familyService.createFamily(tripId, userId, {
      name: 'Uyar Family', adults_count: 2, children_count: 0,
      notes: undefined, color: undefined,
    });

    const fromCalls = (mockFrom as jest.Mock).mock.calls.map(([t]) => t);
    expect(fromCalls).toContain('trip_members');
  });

  it('adds creator to family_members as admin after creation', async () => {
    mockSingle
      .mockResolvedValueOnce({ data: mockFamily, error: null })
      .mockResolvedValueOnce({
        data: { id: 'm1', family_id: familyId, trip_id: tripId, user_id: userId, is_admin: true },
        error: null,
      });

    await familyService.createFamily(tripId, userId, {
      name: 'Uyar Family', adults_count: 2, children_count: 0,
      notes: undefined, color: undefined,
    });

    const insertCalls = (mockInsert as jest.Mock).mock.calls;
    const adminInsert = insertCalls.find((args) => args[0]?.is_admin === true);
    expect(adminInsert).toBeDefined();
  });

  it('returns error if insert fails', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'constraint violation' } });

    const { data, error } = await familyService.createFamily(tripId, userId, {
      name: 'X', adults_count: 1, children_count: 0,
      notes: undefined, color: undefined,
    });

    expect(data).toBeNull();
    expect(error).toBeTruthy();
  });
});

// ─── getFamilies ──────────────────────────────────────────────────────────────

describe('SPEC §3 — getFamilies', () => {
  it('returns all families for a trip ordered by created_at', async () => {
    const families = [mockFamily, { ...mockFamily, id: 'family-2', name: 'Yilmaz Family' }];
    mockOrder.mockResolvedValueOnce({ data: families, error: null });

    const { data, error } = await familyService.getFamilies(tripId);

    expect(mockFrom).toHaveBeenCalledWith('families');
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
  });

  it('returns empty array when no families exist', async () => {
    mockOrder.mockResolvedValueOnce({ data: [], error: null });

    const { data } = await familyService.getFamilies(tripId);

    expect(data).toEqual([]);
  });
});

// ─── updateFamily ─────────────────────────────────────────────────────────────

describe('SPEC §3 — updateFamily', () => {
  it('updates family fields and returns updated record', async () => {
    const updated = { ...mockFamily, name: 'Uyar Family (Updated)', adults_count: 3 };
    mockSingle.mockResolvedValueOnce({ data: updated, error: null });

    const { data, error } = await familyService.updateFamily(familyId, {
      name: 'Uyar Family (Updated)',
      adults_count: 3,
    });

    expect(mockFrom).toHaveBeenCalledWith('families');
    expect(error).toBeNull();
    expect(data?.name).toBe('Uyar Family (Updated)');
    expect(data?.adults_count).toBe(3);
  });

  it('returns error if update fails', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } });

    const { data, error } = await familyService.updateFamily('unknown', { name: 'X' });

    expect(data).toBeNull();
    expect(error).toBeTruthy();
  });

  it('prevents reducing head count below current member count', async () => {
    mockCapacityMembersEq.mockResolvedValueOnce({
      data: [{ user_id: 'user-1' }, { user_id: 'user-2' }],
      error: null,
    });

    const { data, error } = await familyService.updateFamily(familyId, {
      adults_count: 1,
      children_count: 0,
    });

    expect(data).toBeNull();
    expect(error).toBe('This family already has more members than the new head count. Remove members or increase the head count first.');
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

// ─── deleteFamily ─────────────────────────────────────────────────────────────

describe('SPEC §3 — deleteFamily', () => {
  it('deletes family by id and returns no error', async () => {
    mockEq.mockResolvedValueOnce({ data: null, error: null });

    const { error } = await familyService.deleteFamily(familyId);

    expect(mockFrom).toHaveBeenCalledWith('families');
    expect(error).toBeNull();
  });

  it('clears trip member family assignment after deleting a family', async () => {
    mockEq.mockResolvedValueOnce({ data: null, error: null });

    await familyService.deleteFamily(familyId);

    expect(mockFrom).toHaveBeenCalledWith('trip_members');
    expect(mockUpdate).toHaveBeenCalledWith({ family_id: null });
  });
});

// ─── §3.2 Family Members ──────────────────────────────────────────────────────

describe('SPEC §3.2 — Family Members', () => {
  it('getFamilyMembers returns all members for a family', async () => {
    const members = [
      { id: 'm1', family_id: familyId, user_id: userId, is_admin: true, push_talk_enabled: false },
    ];
    mockEq.mockResolvedValueOnce({ data: members, error: null });

    const { data, error } = await familyService.getFamilyMembers(familyId);

    expect(mockFrom).toHaveBeenCalledWith('family_members');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].is_admin).toBe(true);
  });

  it('addFamilyMember inserts member and links in trip_members', async () => {
    const member = {
      id: 'm2', family_id: familyId, trip_id: tripId, user_id: 'user-2',
      is_admin: false, push_talk_enabled: false, created_at: '',
    };
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'missing function' } });
    mockSingle.mockResolvedValueOnce({ data: member, error: null });

    const { data, error } = await familyService.addFamilyMember(familyId, tripId, 'user-2');

    expect(error).toBeNull();
    expect(data?.user_id).toBe('user-2');
    expect(mockDelete).toHaveBeenCalled();
    // Should also update trip_members
    const fromCalls = (mockFrom as jest.Mock).mock.calls.map(([t]) => t);
    expect(fromCalls).toContain('trip_members');
  });

  it('returns a head count error when the family is full', async () => {
    mockCapacityMembersEq.mockResolvedValueOnce({
      data: [{ user_id: 'user-1' }, { user_id: 'user-2' }, { user_id: 'user-3' }],
      error: null,
    });

    const { data, error } = await familyService.addFamilyMember(familyId, tripId, 'user-4');

    expect(data).toBeNull();
    expect(error).toBe(FAMILY_FULL_ERROR);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('switches family membership through the RPC when available', async () => {
    const member = {
      id: 'm2', family_id: familyId, trip_id: tripId, user_id: userId,
      is_admin: false, push_talk_enabled: false, created_at: '',
    };
    mockRpc.mockResolvedValueOnce({ data: member, error: null });

    const { data, error } = await familyService.addFamilyMember(familyId, tripId, userId);

    expect(error).toBeNull();
    expect(data?.family_id).toBe(familyId);
    expect(mockRpc).toHaveBeenCalledWith('switch_family_membership', {
      family_uuid: familyId,
      trip_uuid: tripId,
      member_uuid: userId,
      make_admin: false,
    });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('updateFamilyMemberPushTalk toggles push_talk_enabled', async () => {
    const updated = { id: 'm1', push_talk_enabled: true };
    mockSingle.mockResolvedValueOnce({ data: updated, error: null });

    const { data, error } = await familyService.updateFamilyMemberPushTalk('m1', true);

    expect(error).toBeNull();
    expect(data?.push_talk_enabled).toBe(true);
  });

  it('removeFamilyMember deletes by familyId and userId', async () => {
    // Two chained .eq() calls — default mockReturnThis() handles chaining;
    // destructuring { error } from the chain stub gives undefined → null.

    const { error } = await familyService.removeFamilyMember(familyId, userId);

    expect(mockFrom).toHaveBeenCalledWith('family_members');
    expect(error).toBeNull();
  });

  it('removeFamilyMember clears trip member family assignment', async () => {
    const { error } = await familyService.removeFamilyMember(familyId, userId);

    expect(error).toBeNull();
    expect(mockFrom).toHaveBeenCalledWith('trip_members');
    expect(mockUpdate).toHaveBeenCalledWith({ family_id: null });
  });
});
