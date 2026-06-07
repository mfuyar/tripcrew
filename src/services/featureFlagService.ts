import { supabase } from '../lib/supabaseClient';
import { defaultFeatureMap, TripFeatureFlag, TripFeatureKey } from '../constants/features';
import { ServiceResult } from '../types';

export const featureFlagService = {
  async getTripFlags(tripId: string): Promise<ServiceResult<Record<TripFeatureKey, boolean>>> {
    const defaults = defaultFeatureMap();
    const { data, error } = await supabase
      .from('trip_feature_flags')
      .select('*')
      .eq('trip_id', tripId);

    if (error) return { data: null, error: error.message };

    for (const row of (data ?? []) as TripFeatureFlag[]) {
      defaults[row.feature_key] = row.enabled;
    }
    return { data: defaults, error: null };
  },

  async setTripFlag(
    tripId: string,
    featureKey: TripFeatureKey,
    enabled: boolean
  ): Promise<ServiceResult<TripFeatureFlag>> {
    const { data, error } = await supabase.rpc('set_trip_feature_flag', {
      p_trip_id: tripId,
      p_feature_key: featureKey,
      p_enabled: enabled,
    });

    if (error) return { data: null, error: error.message };
    return { data: data as TripFeatureFlag, error: null };
  },
};
