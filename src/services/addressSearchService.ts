import * as Location from 'expo-location';
import { ServiceResult } from '../types';

export interface AddressSuggestion {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
}

interface NominatimResult {
  place_id?: number;
  osm_id?: number;
  display_name?: string;
  lat: string;
  lon: string;
}

export const addressSearchService = {
  async search(query: string, limit = 5): Promise<ServiceResult<AddressSuggestion[]>> {
    const trimmed = query.trim();
    if (trimmed.length < 3) return { data: [], error: null };

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=${limit}&q=${encodeURIComponent(trimmed)}`,
        {
          headers: {
            Accept: 'application/json',
            'Accept-Language': 'en',
          },
        }
      );

      if (response.ok) {
        const json = (await response.json()) as NominatimResult[];
        return {
          data: json
            .map((item, index) => ({
              id: String(item.place_id ?? item.osm_id ?? `${trimmed}-${index}`),
              label: item.display_name ?? trimmed,
              latitude: Number(item.lat),
              longitude: Number(item.lon),
            }))
            .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude)),
          error: null,
        };
      }
    } catch {
      // Fall through to device geocoder. It is less rich, but works as a backup.
    }

    try {
      const locations = await Location.geocodeAsync(trimmed);
      return {
        data: locations.slice(0, limit).map((item, index) => ({
          id: `${trimmed}-${index}`,
          label: trimmed,
          latitude: item.latitude,
          longitude: item.longitude,
        })),
        error: null,
      };
    } catch (error: any) {
      return { data: null, error: error?.message ?? 'Address search failed' };
    }
  },
};
