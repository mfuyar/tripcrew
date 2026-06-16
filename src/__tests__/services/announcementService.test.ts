const mockEq = jest.fn();
const mockLimit = jest.fn();
const mockOrder = jest.fn();
const mockSelect = jest.fn();
const mockFrom = jest.fn(() => ({
  select: mockSelect.mockReturnThis(),
  eq: mockEq.mockReturnThis(),
  order: mockOrder.mockReturnThis(),
  limit: mockLimit,
}));

jest.mock('../../lib/supabaseClient', () => ({
  supabase: {
    from: mockFrom,
  },
}));

jest.mock('../../services/notificationService', () => ({
  notificationService: {
    notifyTripMembers: jest.fn(),
  },
}));

import { announcementService } from '../../services/announcementService';

beforeEach(() => jest.clearAllMocks());

describe('announcementService.getLatest', () => {
  it('loads a lightweight latest-announcements list for the dashboard', async () => {
    const rows = [{ id: 'ann-1', title: 'Meet at 9', priority: 'normal' }];
    mockLimit.mockResolvedValueOnce({ data: rows, error: null });

    const { data, error } = await announcementService.getLatest('trip-1', 3);

    expect(error).toBeNull();
    expect(data).toEqual(rows);
    expect(mockFrom).toHaveBeenCalledWith('announcements');
    expect(mockSelect).toHaveBeenCalledWith('id, title, content, priority, created_at, created_by, creator:profiles!announcements_created_by_fkey(id, full_name, email)');
    expect(mockEq).toHaveBeenCalledWith('trip_id', 'trip-1');
    expect(mockEq).toHaveBeenCalledWith('is_archived', false);
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(mockLimit).toHaveBeenCalledWith(3);
  });

  it('returns an error when the dashboard query fails', async () => {
    mockLimit.mockResolvedValueOnce({ data: null, error: { message: 'Nope' } });

    const { data, error } = await announcementService.getLatest('trip-1');

    expect(data).toBeNull();
    expect(error).toBe('Nope');
  });
});
