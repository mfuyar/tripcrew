import { supabase } from '../lib/supabaseClient';
import { PackingItem, PackingStatus, ServiceResult } from '../types';

export const packingService = {
  async addItem(
    tripId: string,
    userId: string,
    input: Pick<PackingItem, 'name' | 'category' | 'quantity' | 'assigned_family_id' | 'notes' | 'is_essential'>
  ): Promise<ServiceResult<PackingItem>> {
    const { data, error } = await supabase
      .from('packing_items')
      .insert({
        ...input,
        trip_id: tripId,
        added_by: userId,
        status: 'unpacked',
      })
      .select('*, assigned_family:families(*)')
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as PackingItem, error: null };
  },

  async getItems(tripId: string): Promise<ServiceResult<PackingItem[]>> {
    const { data, error } = await supabase
      .from('packing_items')
      .select('*, assigned_family:families(*)')
      .eq('trip_id', tripId)
      .order('category')
      .order('name');
    if (error) return { data: null, error: error.message };
    return { data: data as PackingItem[], error: null };
  },

  async updateItem(
    itemId: string,
    updates: Partial<Omit<PackingItem, 'id' | 'trip_id' | 'added_by' | 'created_at' | 'assigned_family'>>
  ): Promise<ServiceResult<PackingItem>> {
    const { data, error } = await supabase
      .from('packing_items')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', itemId)
      .select('*, assigned_family:families(*)')
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as PackingItem, error: null };
  },

  async deleteItem(itemId: string): Promise<ServiceResult<null>> {
    const { error } = await supabase.from('packing_items').delete().eq('id', itemId);
    return { data: null, error: error?.message ?? null };
  },

  async updateStatus(
    itemId: string,
    status: PackingStatus
  ): Promise<ServiceResult<PackingItem>> {
    return packingService.updateItem(itemId, { status });
  },
};
