/**
 * SPEC §9 — Shared Album
 *
 * - getMedia returns reverse-chronological order
 * - Caption editing (updateCaption)
 * - deleteMedia (service layer — RLS enforces uploader/organizer check)
 */

const mockSingle = jest.fn();
const mockEq = jest.fn();
const mockNeq = jest.fn();
const mockIn = jest.fn();
const mockNot = jest.fn();
const mockLt = jest.fn();
const mockOrder = jest.fn();
const mockSelect = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockGetSession = jest.fn();

const mockFrom = jest.fn(() => ({
  select: mockSelect.mockReturnThis(),
  insert: mockInsert.mockReturnThis(),
  update: mockUpdate.mockReturnThis(),
  delete: mockDelete.mockReturnThis(),
  eq: mockEq.mockReturnThis(),
  neq: mockNeq.mockReturnThis(),
  in: mockIn.mockReturnThis(),
  not: mockNot.mockReturnThis(),
  lt: mockLt.mockReturnThis(),
  order: mockOrder.mockReturnThis(),
  single: mockSingle,
}));

const mockGetPublicUrl = jest.fn();
const mockCreateSignedUrl = jest.fn();
const mockCreateSignedUrls = jest.fn();
const mockRemove = jest.fn();
const mockStorageFrom = jest.fn(() => ({
  getPublicUrl: mockGetPublicUrl,
  createSignedUrl: mockCreateSignedUrl,
  createSignedUrls: mockCreateSignedUrls,
  remove: mockRemove,
}));
const mockExpoFetch = jest.fn();
const mockResize = jest.fn().mockReturnThis();
const mockReset = jest.fn().mockReturnThis();
const mockRenderAsync = jest.fn();
const mockSaveAsync = jest.fn();
const mockManipulateAsync = jest.fn();

jest.mock('../../lib/supabaseClient', () => ({
  supabaseUrl: 'https://project.supabase.co',
  supabaseAnonKey: 'anon-key',
  supabase: {
    auth: { getSession: mockGetSession },
    from: mockFrom,
    storage: { from: mockStorageFrom },
  },
}));

jest.mock('expo-file-system', () => ({
  File: function MockFile(this: { uri: string; type: string; size: number }, uri: string) {
    this.uri = uri;
    this.type = uri.endsWith('.m4a') ? 'audio/x-m4a' : 'image/jpeg';
    this.size = 12345;
  },
}));

jest.mock('expo/fetch', () => ({
  fetch: mockExpoFetch,
}));

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: mockManipulateAsync,
  ImageManipulator: {
    manipulate: jest.fn(() => ({
      renderAsync: mockRenderAsync,
      reset: mockReset,
      resize: mockResize,
    })),
  },
  SaveFormat: { JPEG: 'jpeg' },
}));

import { mediaService } from '../../services/mediaService';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue({ data: { session: { access_token: 'user-token' } } });
  mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.example.com/object?token=abc' }, error: null });
  mockCreateSignedUrls.mockResolvedValue({ data: [] });
  mockManipulateAsync.mockResolvedValue({ uri: 'file:///cache/compressed.jpg', width: 1200, height: 1600 });
  mockRenderAsync
    .mockResolvedValueOnce({ width: 3024, height: 4032 })
    .mockResolvedValueOnce({ saveAsync: mockSaveAsync });
  mockSaveAsync.mockResolvedValue({ uri: 'file:///cache/compressed.jpg', width: 1200, height: 1600 });
});

const tripId = 'trip-1';
const userId = 'user-1';
const mediaId = 'media-1';

function makeMedia(overrides: Record<string, unknown> = {}) {
  return {
    id: mediaId,
    trip_id: tripId,
    uploaded_by: userId,
    media_type: 'photo',
    url: 'https://cdn.example.com/img.jpg',
    caption: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// ─── §9 getMedia — reverse-chronological ─────────────────────────────────────

describe('SPEC §9 — getMedia (reverse-chronological grid)', () => {
  it('orders results by created_at descending (newest first)', async () => {
    mockOrder.mockResolvedValueOnce({ data: [makeMedia()], error: null });

    await mediaService.getMedia(tripId);

    const orderCalls = (mockOrder as jest.Mock).mock.calls;
    expect(orderCalls.some(([col, opts]) => col === 'created_at' && opts?.ascending === false)).toBe(true);
    expect(mockIn).toHaveBeenCalledWith('media_type', ['photo', 'video']);
  });

  it('returns all media for the trip', async () => {
    const items = [makeMedia(), makeMedia({ id: 'media-2', media_type: 'video' })];
    mockOrder.mockResolvedValueOnce({ data: items, error: null });

    const { data, error } = await mediaService.getMedia(tripId);

    expect(error).toBeNull();
    expect(data).toHaveLength(2);
  });

  it('returns empty array when trip has no media', async () => {
    mockOrder.mockResolvedValueOnce({ data: [], error: null });

    const { data } = await mediaService.getMedia(tripId);

    expect(data).toEqual([]);
  });

  it('returns error if query fails', async () => {
    mockOrder.mockResolvedValueOnce({ data: null, error: { message: 'Query failed' } });

    const { data, error } = await mediaService.getMedia(tripId);

    expect(data).toBeNull();
    expect(error).toBe('Query failed');
  });
});

// ─── §9 updateCaption (full-screen viewer with caption editing) ───────────────

describe('SPEC §9 — updateCaption', () => {
  it('updates caption and returns updated media record', async () => {
    const updated = makeMedia({ caption: 'Sunset at the beach' });
    mockSingle.mockResolvedValueOnce({ data: updated, error: null });

    const { data, error } = await mediaService.updateCaption(mediaId, 'Sunset at the beach');

    expect(mockFrom).toHaveBeenCalledWith('trip_media');
    expect(error).toBeNull();
    expect(data?.caption).toBe('Sunset at the beach');
  });

  it('returns error if caption update fails', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } });

    const { data, error } = await mediaService.updateCaption('bad-id', 'caption');

    expect(data).toBeNull();
    expect(error).toBeTruthy();
  });
});

// ─── §9 deleteMedia ───────────────────────────────────────────────────────────

describe('SPEC §9 — deleteMedia (uploader or organizer only — enforced by RLS)', () => {
  it('deletes media by id and returns no error', async () => {
    mockEq.mockResolvedValueOnce({ data: null, error: null });

    const { error } = await mediaService.deleteMedia(mediaId);

    expect(mockFrom).toHaveBeenCalledWith('trip_media');
    expect(error).toBeNull();
  });

  it('returns error if delete fails (e.g. RLS rejects non-uploader)', async () => {
    mockEq.mockResolvedValueOnce({ data: null, error: { message: 'new row violates row-level security policy' } });

    const { error } = await mediaService.deleteMedia(mediaId);

    expect(error).toBeTruthy();
  });
});

// ─── §9 uploadMedia ───────────────────────────────────────────────────────────

describe('SPEC §9 — uploadMedia', () => {
  it('uploads file to storage and inserts record', async () => {
    mockExpoFetch.mockResolvedValueOnce({ ok: true });
    mockGetPublicUrl.mockReturnValueOnce({
      data: { publicUrl: 'https://storage.example.com/trip-1/user-1/1234.jpg' },
    });
    const inserted = makeMedia({ url: 'https://storage.example.com/trip-1/user-1/1234.jpg' });
    mockSingle.mockResolvedValueOnce({ data: inserted, error: null });

    const { data, error } = await mediaService.uploadMedia(
      tripId, userId, undefined, 'file:///local/photo.jpg', 'photo', 'Our first night'
    );

    expect(mockStorageFrom).toHaveBeenCalledWith('trip-media');
    expect(mockExpoFetch).toHaveBeenCalledWith(
      expect.stringMatching(
        /^https:\/\/project\.supabase\.co\/storage\/v1\/object\/trip-media\/trip-1\/user-1\/\d+\.jpg$/
      ),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer user-token',
          apikey: 'anon-key',
          'Content-Type': 'image/jpeg',
        }),
      })
    );
    expect(error).toBeNull();
    expect(data?.url).toContain('https://');
    expect(mockManipulateAsync).toHaveBeenCalledWith(
      'file:///local/photo.jpg',
      [{ resize: { width: 1600 } }],
      { compress: 0.78, format: 'jpeg' }
    );
  });

  it('normalizes iOS m4a audio to a supported MIME type', async () => {
    mockExpoFetch.mockResolvedValueOnce({ ok: true });
    mockGetPublicUrl.mockReturnValueOnce({
      data: { publicUrl: 'https://storage.example.com/trip-1/user-1/1234.m4a' },
    });
    const inserted = makeMedia({
      media_type: 'audio',
      url: 'https://storage.example.com/trip-1/user-1/1234.m4a',
    });
    mockSingle.mockResolvedValueOnce({ data: inserted, error: null });

    const { error } = await mediaService.uploadMedia(
      tripId, userId, undefined, 'file:///local/recording.m4a', 'audio'
    );

    expect(mockExpoFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\.m4a$/),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'audio/mp4',
        }),
      })
    );
    const insertCalls = (mockInsert as jest.Mock).mock.calls;
    expect(insertCalls[0][0]).toEqual(expect.objectContaining({
      media_type: 'audio',
      mime_type: 'audio/mp4',
      file_size: 12345,
    }));
    expect(error).toBeNull();
  });

  it('uses supported audio MIME types for mp3 and wav uploads', async () => {
    mockExpoFetch.mockResolvedValue({ ok: true });
    mockGetPublicUrl.mockReturnValue({
      data: { publicUrl: 'https://storage.example.com/trip-1/user-1/audio' },
    });
    mockSingle.mockResolvedValue({ data: makeMedia({ media_type: 'audio' }), error: null });

    await mediaService.uploadMedia(tripId, userId, undefined, 'file:///local/message.mp3', 'audio');
    await mediaService.uploadMedia(tripId, userId, undefined, 'file:///local/message.wav', 'audio');

    expect(mockExpoFetch).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'audio/mpeg' }),
      })
    );
    expect(mockExpoFetch).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'audio/wav' }),
      })
    );
  });

  it('returns error if storage upload fails', async () => {
    mockExpoFetch.mockResolvedValueOnce({
      ok: false,
      text: () => Promise.resolve('Storage quota exceeded'),
    });

    const { data, error } = await mediaService.uploadMedia(
      tripId, userId, undefined, 'file:///local/photo.jpg', 'photo'
    );

    expect(data).toBeNull();
    expect(error).toBe('Storage quota exceeded');
  });

  it('uploads chat photos without inserting trip_media and signs them for 7 days', async () => {
    mockExpoFetch.mockResolvedValueOnce({ ok: true });

    const { data, error } = await mediaService.uploadChatMedia(
      tripId, userId, 'file:///local/chat-photo.heic', 'photo'
    );

    expect(error).toBeNull();
    expect(data).toEqual({ url: 'https://signed.example.com/object?token=abc', mime_type: 'image/jpeg' });
    expect(mockFrom).not.toHaveBeenCalledWith('trip_media');
    expect(mockCreateSignedUrl).toHaveBeenCalledWith(
      expect.stringMatching(/^chat\/trip-1\/user-1\/\d+\.jpg$/),
      60 * 60 * 24 * 7
    );
    expect(mockExpoFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/object\/trip-media\/chat\/trip-1\/user-1\/\d+\.jpg$/),
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'image/jpeg' }),
      })
    );
  });
});

// ─── Ephemeral chat media cleanup ─────────────────────────────────────────────

describe('deleteExpiredChatMedia', () => {
  it('deletes expired chat media storage objects and message rows', async () => {
    mockLt.mockResolvedValueOnce({
      data: [
        {
          id: 'msg-1',
          message_type: 'image',
          media_url: 'https://project.supabase.co/storage/v1/object/sign/trip-media/chat/trip-1/user-1/old.jpg?token=x',
        },
        {
          id: 'msg-2',
          message_type: 'image',
          media_url: 'https://project.supabase.co/storage/v1/object/sign/trip-media/trip-1/user-1/saved.jpg?token=x',
        },
        {
          id: 'msg-3',
          message_type: 'audio',
          media_url: 'https://project.supabase.co/storage/v1/object/sign/trip-media/trip-1/user-1/old.m4a?token=x',
        },
      ],
      error: null,
    });
    const cutoff = new Date('2026-06-02T12:00:00.000Z');
    const { data, error } = await mediaService.deleteExpiredChatMedia(tripId, cutoff);

    expect(error).toBeNull();
    expect(data).toBe(2);
    expect(mockFrom).toHaveBeenCalledWith('messages');
    expect(mockIn).toHaveBeenCalledWith('message_type', ['image', 'audio']);
    expect(mockNot).toHaveBeenCalledWith('media_url', 'is', null);
    expect(mockLt).toHaveBeenCalledWith('created_at', cutoff.toISOString());
    expect(mockRemove).toHaveBeenCalledWith(['chat/trip-1/user-1/old.jpg', 'trip-1/user-1/old.m4a']);
    expect(mockDelete).toHaveBeenCalled();
    expect(mockIn).toHaveBeenCalledWith('id', ['msg-1', 'msg-3']);
  });
});
