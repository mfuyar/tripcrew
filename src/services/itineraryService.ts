import { supabase } from '../lib/supabaseClient';
import { ItineraryItem, ItineraryAttendance, ServiceResult } from '../types';

export const itineraryService = {
  async createItem(
    tripId: string,
    userId: string,
    input: Omit<ItineraryItem, 'id' | 'trip_id' | 'created_by' | 'created_at' | 'updated_at' | 'attendance'>
  ): Promise<ServiceResult<ItineraryItem>> {
    const { data, error } = await supabase
      .from('itinerary_items')
      .insert({ ...input, trip_id: tripId, created_by: userId })
      .select()
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as ItineraryItem, error: null };
  },

  async getItems(tripId: string): Promise<ServiceResult<ItineraryItem[]>> {
    const { data, error } = await supabase
      .from('itinerary_items')
      .select('*, attendance:itinerary_attendance(*, family:families(*))')
      .eq('trip_id', tripId)
      .order('start_datetime');
    if (error) return { data: null, error: error.message };
    return { data: data as ItineraryItem[], error: null };
  },

  async updateItem(
    itemId: string,
    updates: Partial<Omit<ItineraryItem, 'id' | 'trip_id' | 'created_by' | 'created_at' | 'attendance'>>
  ): Promise<ServiceResult<ItineraryItem>> {
    const { data, error } = await supabase
      .from('itinerary_items')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', itemId)
      .select()
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as ItineraryItem, error: null };
  },

  async deleteItem(itemId: string): Promise<ServiceResult<null>> {
    const { error } = await supabase
      .from('itinerary_items')
      .delete()
      .eq('id', itemId);
    return { data: null, error: error?.message ?? null };
  },

  async updateAttendance(
    itemId: string,
    tripId: string,
    familyId: string,
    isAttending: boolean,
    notes?: string
  ): Promise<ServiceResult<ItineraryAttendance>> {
    const { data, error } = await supabase
      .from('itinerary_attendance')
      .upsert(
        {
          itinerary_item_id: itemId,
          trip_id: tripId,
          family_id: familyId,
          is_attending: isAttending,
          notes: notes ?? null,
        },
        { onConflict: 'itinerary_item_id,family_id' }
      )
      .select()
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as ItineraryAttendance, error: null };
  },
};
