import { supabase } from '../lib/supabaseClient';
import { Settlement, PaymentStatus, ServiceResult } from '../types';

export const settlementService = {
  async createSettlement(
    tripId: string,
    input: Pick<Settlement, 'from_family_id' | 'to_family_id' | 'amount' | 'currency' | 'notes'>
  ): Promise<ServiceResult<Settlement>> {
    const { data, error } = await supabase
      .from('settlements')
      .insert({ ...input, trip_id: tripId, status: 'pending' })
      .select('*, from_family:families!from_family_id(*), to_family:families!to_family_id(*)')
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as Settlement, error: null };
  },

  async getSettlements(tripId: string): Promise<ServiceResult<Settlement[]>> {
    const { data, error } = await supabase
      .from('settlements')
      .select('*, from_family:families!from_family_id(*), to_family:families!to_family_id(*)')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false });
    if (error) return { data: null, error: error.message };
    return { data: data as Settlement[], error: null };
  },

  async updatePaymentStatus(
    settlementId: string,
    status: PaymentStatus
  ): Promise<ServiceResult<Settlement>> {
    const updates: Partial<Settlement> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (status === 'confirmed') {
      updates.confirmed_at = new Date().toISOString();
    }
    const { data, error } = await supabase
      .from('settlements')
      .update(updates)
      .eq('id', settlementId)
      .select('*, from_family:families!from_family_id(*), to_family:families!to_family_id(*)')
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as Settlement, error: null };
  },

  async confirmPayment(settlementId: string): Promise<ServiceResult<Settlement>> {
    return settlementService.updatePaymentStatus(settlementId, 'confirmed');
  },

  async deleteSettlement(settlementId: string): Promise<ServiceResult<null>> {
    const { error } = await supabase
      .from('settlements')
      .delete()
      .eq('id', settlementId);
    return { data: null, error: error?.message ?? null };
  },
};
