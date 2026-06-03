/**
 * SPEC §9 — Shared Album
 *
 * - getMedia returns reverse-chronological order
 * - Caption editing (updateCaption)
 * - deleteMedia (service layer — RLS enforces uploader/organizer check)
 */

const mockSingle = jest.fn();
const mockEq = jest.fn();
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
  order: mockOrder.mockReturnThis(),
  single: mockSingle,
}));

const mockGetPublicUrl = jest.fn();
const mockStorageFrom = jest.fn(() => ({
  getPublicUrl: mockGetPublicUrl,
}));
const mockExpoFetch = jest.fn();

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
  File: class MockFile {
    uri: string;
    type: string;

    constructor(uri: string) {
      this.uri = uri;
      this.type = uri.endsWith('.m4a') ? 'audio/x-m4a' : 'image/jpeg';
    }
  },
}));

jest.mock('expo/fetch', () => ({
  fetch: mockExpoFetch,
}));

import { mediaService } from '../../services/mediaService';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue({ data: { session: { access_token: 'user-token' } } });
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
    expect(error).toBeNull();
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
});
