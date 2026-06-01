import { supabase } from '../lib/supabaseClient';
import { Car, CarPassenger, ServiceResult } from '../types';

export const carService = {
  async createCar(
    tripId: string,
    userId: string,
    input: Pick<Car, 'name' | 'driver_family_id' | 'driver_user_id' | 'total_seats' | 'notes'>
  ): Promise<ServiceResult<Car>> {
    const { data, error } = await supabase
      .from('cars')
      .insert({ ...input, trip_id: tripId, created_by: userId })
      .select('*, driver_family:families(*), passengers:car_passengers(*, family:families(*))')
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as Car, error: null };
  },

  async getCars(tripId: string): Promise<ServiceResult<Car[]>> {
    const { data, error } = await supabase
      .from('cars')
      .select('*, driver_family:families(*), passengers:car_passengers(*, family:families(*))')
      .eq('trip_id', tripId)
      .order('created_at');
    if (error) return { data: null, error: error.message };
    return { data: data as Car[], error: null };
  },

  async updateCar(
    carId: string,
    updates: Partial<Pick<Car, 'name' | 'driver_family_id' | 'driver_user_id' | 'total_seats' | 'notes'>>
  ): Promise<ServiceResult<Car>> {
    const { data, error } = await supabase
      .from('cars')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', carId)
      .select('*, driver_family:families(*)')
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as Car, error: null };
  },

  async deleteCar(carId: string): Promise<ServiceResult<null>> {
    const { error } = await supabase.from('cars').delete().eq('id', carId);
    return { data: null, error: error?.message ?? null };
  },

  async addPassenger(
    carId: string,
    tripId: string,
    familyId: string,
    passengerName: string,
    userId?: string
  ): Promise<ServiceResult<CarPassenger>> {
    const { data, error } = await supabase
      .from('car_passengers')
      .insert({
        car_id: carId,
        trip_id: tripId,
        family_id: familyId,
        user_id: userId ?? null,
        passenger_name: passengerName,
      })
      .select('*, family:families(*)')
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as CarPassenger, error: null };
  },

  async removePassenger(passengerId: string): Promise<ServiceResult<null>> {
    const { error } = await supabase
      .from('car_passengers')
      .delete()
      .eq('id', passengerId);
    return { data: null, error: error?.message ?? null };
  },
};
