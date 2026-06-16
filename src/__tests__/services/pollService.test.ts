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
  eq: mockEq.mockReturnThis(),
  order: mockOrder.mockReturnThis(),
  single: mockSingle,
}));

jest.mock('../../lib/supabaseClient', () => ({
  supabase: {
    from: mockFrom,
    rpc: mockRpc,
  },
}));

jest.mock('../../services/notificationService', () => ({
  notificationService: {
    notifyTripMembers: jest.fn(),
  },
}));

import { pollService } from '../../services/pollService';

beforeEach(() => jest.clearAllMocks());

const tripId = 'trip-1';
const pollId = 'poll-1';
const optionId = 'option-1';
const userId = 'user-1';
const familyId = 'family-1';

function makePoll(overrides: Record<string, unknown> = {}) {
  return {
    id: pollId,
    trip_id: tripId,
    question: 'Where should we eat?',
    status: 'active',
    allow_multiple: false,
    created_by: userId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    options: [],
    ...overrides,
  };
}

describe('pollService.vote', () => {
  it('casts votes through the atomic RPC and returns the refreshed poll', async () => {
    const poll = makePoll();
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    mockSingle.mockResolvedValueOnce({ data: poll, error: null });

    const { data, error } = await pollService.vote(pollId, optionId, tripId, userId, familyId);

    expect(error).toBeNull();
    expect(data).toEqual(poll);
    expect(mockRpc).toHaveBeenCalledWith('cast_poll_vote', {
      p_poll_id: pollId,
      p_option_id: optionId,
      p_trip_id: tripId,
      p_user_id: userId,
      p_family_id: familyId,
    });
    expect(mockFrom).toHaveBeenCalledWith('polls');
    expect(mockEq).toHaveBeenCalledWith('id', pollId);
  });

  it('returns an RPC error without fetching the poll again', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Poll is closed' } });

    const { data, error } = await pollService.vote(pollId, optionId, tripId, userId);

    expect(data).toBeNull();
    expect(error).toBe('Poll is closed');
    expect(mockSingle).not.toHaveBeenCalled();
  });
});

describe('pollService.deletePoll', () => {
  it('soft deletes a poll by id', async () => {
    mockEq.mockResolvedValueOnce({ data: null, error: null });

    const { error } = await pollService.deletePoll(pollId);

    expect(error).toBeNull();
    expect(mockFrom).toHaveBeenCalledWith('polls');
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ is_deleted: true }));
    expect(mockEq).toHaveBeenCalledWith('id', pollId);
  });
});
