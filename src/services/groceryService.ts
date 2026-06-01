import { supabase } from '../lib/supabaseClient';
import { GroceryItem, ServiceResult } from '../types';

export const groceryService = {
  async addItem(
    tripId: string,
    userId: string,
    input: Pick<GroceryItem, 'name' | 'quantity' | 'category' | 'assigned_family_id' | 'notes'>
  ): Promise<ServiceResult<GroceryItem>> {
    const { data, error } = await supabase
      .from('grocery_items')
      .insert({ ...input, trip_id: tripId, added_by: userId, is_purchased: false })
      .select('*, assigned_family:families(*)')
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as GroceryItem, error: null };
  },

  async getItems(tripId: string): Promise<ServiceResult<GroceryItem[]>> {
    const { data, error } = await supabase
      .from('grocery_items')
      .select('*, assigned_family:families(*)')
      .eq('trip_id', tripId)
      .order('created_at');
    if (error) return { data: null, error: error.message };
    return { data: data as GroceryItem[], error: null };
  },

  async updateItem(
    itemId: string,
    updates: Partial<Omit<GroceryItem, 'id' | 'trip_id' | 'added_by' | 'created_at' | 'assigned_family'>>
  ): Promise<ServiceResult<GroceryItem>> {
    const { data, error } = await supabase
      .from('grocery_items')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', itemId)
      .select('*, assigned_family:families(*)')
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as GroceryItem, error: null };
  },

  async deleteItem(itemId: string): Promise<ServiceResult<null>> {
    const { error } = await supabase.from('grocery_items').delete().eq('id', itemId);
    return { data: null, error: error?.message ?? null };
  },

  async markPurchased(
    itemId: string,
    userId: string
  ): Promise<ServiceResult<GroceryItem>> {
    const { data, error } = await supabase
      .from('grocery_items')
      .update({
        is_purchased: true,
        purchased_by: userId,
        purchased_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId)
      .select('*, assigned_family:families(*)')
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as GroceryItem, error: null };
  },

  async assignFamily(
    itemId: string,
    familyId: string | null
  ): Promise<ServiceResult<GroceryItem>> {
    const { data, error } = await supabase
      .from('grocery_items')
      .update({ assigned_family_id: familyId, updated_at: new Date().toISOString() })
      .eq('id', itemId)
      .select('*, assigned_family:families(*)')
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as GroceryItem, error: null };
  },
};
