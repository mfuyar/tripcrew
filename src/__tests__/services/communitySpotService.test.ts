const mockSingle = jest.fn();
const mockEq = jest.fn();
const mockIn = jest.fn();
const mockLimit = jest.fn();
const mockOrder = jest.fn();
const mockSelect = jest.fn();
const mockInsert = jest.fn();
const mockRpc = jest.fn();

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
    auth: { getSession: jest.fn() },
    from: mockFrom,
    rpc: mockRpc,
    storage: { from: jest.fn() },
  },
}));

jest.mock('expo-file-system', () => ({
  File: function MockFile(this: { uri: string; type: string; size: number }, uri: string) {
    this.uri = uri;
    this.type = 'image/jpeg';
    this.size = 12345;
  },
}));

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));

jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: jest.fn() },
  SaveFormat: { JPEG: 'jpeg' },
}));

import { communitySpotService } from '../../services/communitySpotService';

beforeEach(() => jest.clearAllMocks());

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
});
