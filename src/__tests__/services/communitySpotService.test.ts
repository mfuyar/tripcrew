const mockSingle = jest.fn();
const mockEq = jest.fn();
const mockIn = jest.fn();
const mockLimit = jest.fn();
const mockOrder = jest.fn();
const mockSelect = jest.fn();
const mockInsert = jest.fn();
const mockRpc = jest.fn();
const mockGetSession = jest.fn();
const mockGetPublicUrl = jest.fn();
const mockStorageFrom = jest.fn(() => ({
  getPublicUrl: mockGetPublicUrl,
}));
const mockExpoFetch = jest.fn();
const mockRenderAsync = jest.fn();
const mockReset = jest.fn().mockReturnThis();
const mockResize = jest.fn().mockReturnThis();
const mockSaveAsync = jest.fn();

const mockFrom = jest.fn(() => ({
  select: mockSelect.mockReturnThis(),
  insert: mockInsert.mockReturnThis(),
  eq: mockEq.mockReturnThis(),
  in: mockIn.mockReturnThis(),
  order: mockOrder.mockReturnThis(),
  limit: mockLimit,
  single: mockSingle,
}));

jest.mock('../../lib/supabaseClient', () => ({
  supabaseUrl: 'https://project.supabase.co',
  supabaseAnonKey: 'anon-key',
  supabase: {
    auth: { getSession: mockGetSession },
    from: mockFrom,
    rpc: mockRpc,
    storage: { from: mockStorageFrom },
  },
}));

jest.mock('expo-file-system', () => ({
  File: function MockFile(this: { uri: string; type: string; size: number; base64: () => Promise<string> }, uri: string) {
    this.uri = uri;
    this.type = 'image/jpeg';
    this.size = 12345;
    this.base64 = jest.fn().mockResolvedValue('base64-image');
  },
}));

jest.mock('expo/fetch', () => ({ fetch: mockExpoFetch }));

jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: {
    manipulate: jest.fn(() => ({
      renderAsync: mockRenderAsync,
      reset: mockReset,
      resize: mockResize,
    })),
  },
  SaveFormat: { JPEG: 'jpeg' },
}));

import { communitySpotService } from '../../services/communitySpotService';

const originalFetch = global.fetch;
const originalGeminiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn();
  process.env.EXPO_PUBLIC_GEMINI_API_KEY = originalGeminiKey;
  mockGetSession.mockResolvedValue({ data: { session: { access_token: 'user-token' } } });
  mockGetPublicUrl.mockReturnValue({ data: { publicUrl: 'https://storage.example.com/community.jpg' } });
  mockExpoFetch.mockResolvedValue({ ok: true });
  mockRenderAsync
    .mockResolvedValueOnce({ width: 1200, height: 800 })
    .mockResolvedValueOnce({ saveAsync: mockSaveAsync });
  mockSaveAsync.mockResolvedValue({ uri: 'file:///cache/community.jpg' });
});

afterAll(() => {
  global.fetch = originalFetch;
  process.env.EXPO_PUBLIC_GEMINI_API_KEY = originalGeminiKey;
});

const spot = {
  id: 'spot-1',
  user_id: 'user-1',
  name: 'Secret Overlook',
  category: 'hidden_gem',
  description: 'Quiet sunset view locals love.',
  latitude: 40,
  longitude: -73,
  upvotes_count: 5,
  comments_count: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  distance_miles: 2.4,
  comments: [{ id: 'comment-1', content: 'Bring a picnic.' }],
};

describe('communitySpotService.getNearby', () => {
  it('loads nearby community spots through the distance RPC', async () => {
    mockRpc.mockResolvedValueOnce({ data: [spot], error: null });

    const { data, error } = await communitySpotService.getNearby(40, -73, 10, 'user-1');

    expect(error).toBeNull();
    expect(data).toEqual([spot]);
    expect(mockRpc).toHaveBeenCalledWith('get_nearby_community_spots', {
      p_latitude: 40,
      p_longitude: -73,
      p_radius_miles: 10,
      p_user_id: 'user-1',
      p_limit: 50,
    });
  });

  it('treats missing community schema as no nearby spots', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Could not find the table 'public.community_spots' in the schema cache" },
    });

    const { data, error } = await communitySpotService.getNearby(40, -73, 10, 'user-1');

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

describe('communitySpotService moderation helpers', () => {
  it('detects bad language in community spot text', () => {
    expect(communitySpotService.containsBadLanguage('quiet beach')).toBe(false);
    expect(communitySpotService.containsBadLanguage('this place is shit')).toBe(true);
  });

  it('directly rejects bad-language spot text without inserting', async () => {
    const { data, error } = await communitySpotService.create('user-1', {
      name: 'Bad spot',
      category: 'other',
      description: 'this place is shit',
      latitude: 40,
      longitude: -73,
    });

    expect(data).toBeNull();
    expect(error).toBe('This spot cannot be posted.');
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('directly rejects clearly adult or unsafe photos before upload', async () => {
    process.env.EXPO_PUBLIC_GEMINI_API_KEY = 'gemini-key';
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                adult: true,
                unsafe: false,
                uncertain: false,
                reason: 'Photo contains content that cannot be posted.',
              }),
            }],
          },
        }],
      }),
    });

    const { data, error } = await communitySpotService.create('user-1', {
      name: 'Beach',
      category: 'outdoor',
      description: 'Nice place',
      latitude: 40,
      longitude: -73,
      photoUri: 'file:///local/photo.jpg',
    });

    expect(data).toBeNull();
    expect(error).toBe('Photo contains content that cannot be posted.');
    expect(mockExpoFetch).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

describe('communitySpotService AI helpers', () => {
  it('builds a guide prompt with location, radius, post details, comments, and popularity', () => {
    const prompt = communitySpotService.buildNearbyGuidePrompt(40, -73, [spot as any], 10);

    expect(prompt).toContain('friendly local guide');
    expect(prompt).toContain('40, -73');
    expect(prompt).toContain('Secret Overlook');
    expect(prompt).toContain('Upvotes: 5');
    expect(prompt).toContain('Bring a picnic.');
  });

  it('summarizes nearby spots by category as a local-guide fallback', () => {
    const summary = communitySpotService.summarizeNearbySpots([spot as any]);

    expect(summary).toContain('Hidden gems');
    expect(summary).toContain('Secret Overlook');
    expect(summary).toContain('2.4 mi');
  });

  it('loads Gemini favorite places as spot-shaped suggestions', async () => {
    process.env.EXPO_PUBLIC_GEMINI_API_KEY = 'gemini-key';
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify([{
                name: 'Rosemary Beach Town Center',
                category: 'food',
                description: 'A walkable spot with cafes and shops near the beach.',
                address: 'Rosemary Beach, FL',
                latitude: 30.2791,
                longitude: -86.0163,
              }]),
            }],
          },
        }],
      }),
    });

    const { data, error } = await communitySpotService.getGeminiFavorites(30.28, -86.02, 10);

    expect(error).toBeNull();
    expect(data?.[0]).toMatchObject({
      source: 'gemini',
      name: 'Rosemary Beach Town Center',
      category: 'food',
      latitude: 30.2791,
      longitude: -86.0163,
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('generativelanguage.googleapis.com'),
      expect.objectContaining({ method: 'POST' })
    );
  });
});
