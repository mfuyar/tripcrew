const mockGeocodeAsync = jest.fn();

jest.mock('expo-location', () => ({
  geocodeAsync: mockGeocodeAsync,
}));

import { addressSearchService } from '../../services/addressSearchService';

const originalFetch = global.fetch;

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn();
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe('addressSearchService.search', () => {
  it('returns no suggestions for short queries', async () => {
    const { data, error } = await addressSearchService.search('be');

    expect(error).toBeNull();
    expect(data).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('maps address search results into suggestions', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => [{
        place_id: 123,
        display_name: 'Rosemary Beach, Walton County, Florida, United States',
        lat: '30.2791',
        lon: '-86.0163',
      }],
    });

    const { data, error } = await addressSearchService.search('Rosemary Beach');

    expect(error).toBeNull();
    expect(data?.[0]).toEqual({
      id: '123',
      label: 'Rosemary Beach, Walton County, Florida, United States',
      latitude: 30.2791,
      longitude: -86.0163,
    });
  });

  it('falls back to Expo geocoding if network search fails', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    mockGeocodeAsync.mockResolvedValueOnce([{ latitude: 30.2791, longitude: -86.0163 }]);

    const { data, error } = await addressSearchService.search('Rosemary Beach');

    expect(error).toBeNull();
    expect(data?.[0]).toEqual({
      id: 'Rosemary Beach-0',
      label: 'Rosemary Beach',
      latitude: 30.2791,
      longitude: -86.0163,
    });
  });

  describe('with EXPO_PUBLIC_GOOGLE_PLACES_API_KEY set', () => {
    const originalKey = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;

    beforeEach(() => {
      process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY = 'test-google-key';
    });

    afterEach(() => {
      process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY = originalKey;
    });

    it('maps Google geocoding results into suggestions', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'OK',
          results: [{
            place_id: 'abc123',
            formatted_address: 'Rosemary Beach, FL 32461, USA',
            geometry: { location: { lat: 30.2791, lng: -86.0163 } },
          }],
        }),
      });

      const { data, error } = await addressSearchService.search('Rosemary Beach');

      expect(error).toBeNull();
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('maps.googleapis.com');
      expect(data?.[0]).toEqual({
        id: 'abc123',
        label: 'Rosemary Beach, FL 32461, USA',
        latitude: 30.2791,
        longitude: -86.0163,
      });
    });

    it('falls back to OpenStreetMap if Google returns no results', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'ZERO_RESULTS', results: [] }) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{
            place_id: 123,
            display_name: 'Rosemary Beach, Walton County, Florida, United States',
            lat: '30.2791',
            lon: '-86.0163',
          }],
        });

      const { data, error } = await addressSearchService.search('Rosemary Beach');

      expect(error).toBeNull();
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(data?.[0]).toEqual({
        id: '123',
        label: 'Rosemary Beach, Walton County, Florida, United States',
        latitude: 30.2791,
        longitude: -86.0163,
      });
    });
  });
});
