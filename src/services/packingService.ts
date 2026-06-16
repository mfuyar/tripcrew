import { supabase } from '../lib/supabaseClient';
import { PackingItem, PackingItemVersion, PackingStatus, ServiceResult } from '../types';

export const packingService = {
  async addItem(
    tripId: string,
    userId: string,
    input: Pick<PackingItem, 'name' | 'category' | 'quantity' | 'assigned_family_id' | 'notes' | 'is_essential'> & Pick<Partial<PackingItem>, 'group_id'>
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
      .eq('is_deleted', false)
      .order('category')
      .order('group_id')
      .order('created_at')
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
    const { error } = await supabase
      .from('packing_items')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId);
    return { data: null, error: error?.message ?? null };
  },

  async getItemVersions(itemId: string): Promise<ServiceResult<PackingItemVersion[]>> {
    const { data, error } = await supabase
      .from('packing_item_versions')
      .select('*')
      .eq('packing_item_id', itemId)
      .order('version_number', { ascending: false });
    if (error) return { data: null, error: error.message };
    return { data: data as PackingItemVersion[], error: null };
  },

  async updateStatus(
    itemId: string,
    status: PackingStatus
  ): Promise<ServiceResult<PackingItem>> {
    return packingService.updateItem(itemId, { status });
  },
};
