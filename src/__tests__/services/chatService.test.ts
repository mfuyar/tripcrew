/**
 * SPEC §8 — Real-time Chat
 *
 * - Messages fetched and ordered by created_at ascending
 * - Supports text, image, audio message types
 * - Push talk messages carry isPushTalk flag
 * - sendMessage stores all required fields
 */

const mockSingle = jest.fn();
const mockEq = jest.fn();
const mockOrder = jest.fn();
const mockLimit = jest.fn();
const mockSelect = jest.fn();
const mockInsert = jest.fn();

const mockFrom = jest.fn(() => ({
  select: mockSelect.mockReturnThis(),
  insert: mockInsert.mockReturnThis(),
  eq: mockEq.mockReturnThis(),
  order: mockOrder.mockReturnThis(),
  limit: mockLimit.mockReturnThis(),
  single: mockSingle,
}));

// Minimal Realtime channel stub
const mockSend = jest.fn().mockResolvedValue({});
const mockChannel = {
  on: jest.fn().mockReturnThis(),
  subscribe: jest.fn().mockReturnThis(),
  send: mockSend,
};
const mockRemoveChannel = jest.fn();

jest.mock('../../lib/supabaseClient', () => ({
  supabase: {
    from: mockFrom,
    channel: jest.fn(() => mockChannel),
    removeChannel: mockRemoveChannel,
  },
}));

import { chatService } from '../../services/chatService';

beforeEach(() => jest.clearAllMocks());

const tripId = 'trip-1';
const userId = 'user-1';
const familyId = 'fam-1';

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: `msg-${Date.now()}`,
    trip_id: tripId,
    user_id: userId,
    family_id: familyId,
    content: 'Hello!',
    message_type: 'text',
    is_push_talk: false,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ─── §8 getMessages ───────────────────────────────────────────────────────────

describe('SPEC §8 — getMessages', () => {
  it('fetches messages for a trip ordered by created_at ascending', async () => {
    const messages = [makeMessage(), makeMessage({ content: 'Hi back!' })];
    mockLimit.mockResolvedValueOnce({ data: messages, error: null });

    const { data, error } = await chatService.getMessages(tripId);

    expect(mockFrom).toHaveBeenCalledWith('messages');
    expect(error).toBeNull();
    expect(data).toHaveLength(2);

    // Must be ascending order (oldest first)
    const orderCalls = (mockOrder as jest.Mock).mock.calls;
    expect(orderCalls.some(([col, opts]) => col === 'created_at' && opts?.ascending === true)).toBe(true);
  });

  it('returns empty array when no messages exist', async () => {
    mockLimit.mockResolvedValueOnce({ data: [], error: null });

    const { data } = await chatService.getMessages(tripId);

    expect(data).toEqual([]);
  });

  it('respects the limit parameter', async () => {
    mockLimit.mockResolvedValueOnce({ data: [], error: null });

    await chatService.getMessages(tripId, 20);

    const limitCalls = (mockLimit as jest.Mock).mock.calls;
    expect(limitCalls.some(([n]) => n === 20)).toBe(true);
  });

  it('returns error if query fails', async () => {
    mockLimit.mockResolvedValueOnce({ data: null, error: { message: 'connection error' } });

    const { data, error } = await chatService.getMessages(tripId);

    expect(data).toBeNull();
    expect(error).toBe('connection error');
  });
});

// ─── §8 sendMessage — text ────────────────────────────────────────────────────

describe('SPEC §8 — sendMessage (text)', () => {
  it('inserts text message with correct fields', async () => {
    const msg = makeMessage({ content: 'See you at 3pm' });
    mockSingle.mockResolvedValueOnce({ data: msg, error: null });

    const { data, error } = await chatService.sendMessage(
      tripId, userId, 'See you at 3pm', familyId
    );

    expect(mockFrom).toHaveBeenCalledWith('messages');
    expect(error).toBeNull();
    expect(data?.content).toBe('See you at 3pm');
    expect(data?.message_type).toBe('text');
    expect(data?.is_push_talk).toBe(false);
  });

  it('includes family_id in message when provided', async () => {
    const msg = makeMessage();
    mockSingle.mockResolvedValueOnce({ data: msg, error: null });

    await chatService.sendMessage(tripId, userId, 'Hi!', familyId);

    const insertCalls = (mockInsert as jest.Mock).mock.calls;
    expect(insertCalls[0][0].family_id).toBe(familyId);
  });
});

// ─── §8 sendMessage — image ───────────────────────────────────────────────────

describe('SPEC §8 — sendMessage (image)', () => {
  it('inserts image message with media_url and mime_type', async () => {
    const msg = makeMessage({
      message_type: 'image',
      media_url: 'https://cdn.example.com/photo.jpg',
      mime_type: 'image/jpeg',
    });
    mockSingle.mockResolvedValueOnce({ data: msg, error: null });

    const { data, error } = await chatService.sendMessage(
      tripId, userId, 'Photo', familyId,
      'image', 'https://cdn.example.com/photo.jpg', 'image/jpeg'
    );

    expect(error).toBeNull();
    expect(data?.message_type).toBe('image');
    expect(data?.media_url).toBeDefined();
  });
});

// ─── §8 sendMessage — audio ───────────────────────────────────────────────────

describe('SPEC §8 — sendMessage (audio)', () => {
  it('inserts audio message with duration_seconds', async () => {
    const msg = makeMessage({
      message_type: 'audio',
      media_url: 'https://cdn.example.com/audio.m4a',
      duration_seconds: 12.5,
    });
    mockSingle.mockResolvedValueOnce({ data: msg, error: null });

    const { data, error } = await chatService.sendMessage(
      tripId, userId, 'Voice note', familyId,
      'audio', 'https://cdn.example.com/audio.m4a', 'audio/m4a', 12.5
    );

    expect(error).toBeNull();
    expect(data?.message_type).toBe('audio');
    expect(data?.duration_seconds).toBe(12.5);
  });
});

// ─── §8 sendMessage — push talk ───────────────────────────────────────────────

describe('SPEC §8 — sendMessage (push talk)', () => {
  it('sets is_push_talk flag for push talk messages', async () => {
    const msg = makeMessage({ message_type: 'audio', is_push_talk: true });
    mockSingle.mockResolvedValueOnce({ data: msg, error: null });

    const { data, error } = await chatService.sendMessage(
      tripId, userId, 'Push talk!', familyId,
      'audio', 'https://cdn.example.com/push.m4a', 'audio/m4a', 3.2, true
    );

    expect(error).toBeNull();
    expect(data?.is_push_talk).toBe(true);

    const insertCalls = (mockInsert as jest.Mock).mock.calls;
    expect(insertCalls[0][0].is_push_talk).toBe(true);
  });
});

// ─── §8 subscribeToMessages / unsubscribe ─────────────────────────────────────

describe('SPEC §8 — Realtime subscription', () => {
  it('creates a Realtime channel for the trip', () => {
    const { supabase } = require('../../lib/supabaseClient');
    chatService.subscribeToMessages(tripId, jest.fn());
    expect(supabase.channel).toHaveBeenCalledWith(`chat:${tripId}`);
  });

  it('unsubscribe removes the channel', () => {
    const { supabase } = require('../../lib/supabaseClient');
    chatService.unsubscribe(mockChannel as any);
    expect(supabase.removeChannel).toHaveBeenCalledWith(mockChannel);
  });
});
