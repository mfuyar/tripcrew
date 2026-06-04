const mockNotificationSelect = jest.fn();
const mockNotificationInsert = jest.fn(() => ({ select: mockNotificationSelect }));
const mockPushTokenEq = jest.fn();
const mockPushTokenIn = jest.fn(() => ({ eq: mockPushTokenEq }));
const mockPushTokenSelect = jest.fn(() => ({ in: mockPushTokenIn }));
const mockFrom = jest.fn((table: string) => {
  if (table === 'push_tokens') {
    return { select: mockPushTokenSelect };
  }
  return {
    insert: mockNotificationInsert,
  };
});
const mockChannel = jest.fn((name: string) => ({ name }));
const mockRemoveChannel = jest.fn();

jest.mock('../../lib/supabaseClient', () => ({
  supabase: {
    from: mockFrom,
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  },
}));

const mockSendBroadcast = jest.fn().mockResolvedValue(undefined);
jest.mock('../../lib/realtimeBroadcast', () => ({
  sendBroadcast: mockSendBroadcast,
}));

import { notificationService } from '../../services/notificationService';

beforeEach(() => {
  jest.clearAllMocks();
  mockPushTokenEq.mockResolvedValue({ data: [], error: null });
  mockNotificationSelect.mockResolvedValue({ data: [], error: null });
});

describe('notificationService.notifyUsers', () => {
  it('creates and broadcasts notifications only for the provided users', async () => {
    const inserted = [
      { id: 'n-1', user_id: 'user-2', title: 'Push talk ping', body: 'Ping', type: 'push_talk', is_read: false },
      { id: 'n-2', user_id: 'user-3', title: 'Push talk ping', body: 'Ping', type: 'push_talk', is_read: false },
    ];
    mockNotificationSelect.mockResolvedValueOnce({ data: inserted, error: null });

    const { data, error } = await notificationService.notifyUsers(
      ['user-2', 'user-3', 'user-2'],
      'trip-1',
      'push_talk',
      'Push talk ping',
      'Ping',
      { family_id: 'family-1', family_only: true }
    );

    expect(error).toBeNull();
    expect(data).toEqual(inserted);
    expect(mockFrom).toHaveBeenCalledWith('notifications');
    expect(mockNotificationInsert).toHaveBeenCalledWith([
      expect.objectContaining({ user_id: 'user-2', trip_id: 'trip-1', type: 'push_talk' }),
      expect.objectContaining({ user_id: 'user-3', trip_id: 'trip-1', type: 'push_talk' }),
    ]);
    expect(mockChannel).toHaveBeenCalledWith('user-notifications:user-2');
    expect(mockChannel).toHaveBeenCalledWith('user-notifications:user-3');
    expect(mockSendBroadcast).toHaveBeenCalledTimes(2);
  });

  it('returns the insert error instead of pretending the ping was sent', async () => {
    mockNotificationSelect.mockResolvedValueOnce({ data: null, error: { message: 'permission denied' } });

    const { data, error } = await notificationService.notifyUsers(
      ['user-2'],
      'trip-1',
      'push_talk',
      'Push talk ping',
      'Ping'
    );

    expect(data).toBeNull();
    expect(error).toBe('permission denied');
    expect(mockSendBroadcast).not.toHaveBeenCalled();
  });
});
