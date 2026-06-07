import { supabase } from '../lib/supabaseClient';
import { Settlement, ServiceResult } from '../types';

const JOIN = '*, from_family:families!from_family_id(*), to_family:families!to_family_id(*)';

export const settlementService = {
  async createProposal(
    tripId: string,
    fromFamilyId: string,
    toFamilyId: string,
    amount: number,
    currency: string,
    notes: string | undefined,
    createdByFamilyId: string
  ): Promise<ServiceResult<Settlement>> {
    if (fromFamilyId === toFamilyId) {
      return { data: null, error: 'A family cannot pay themselves' };
    }

    const payerIsCreator = createdByFamilyId === fromFamilyId;
    const status = payerIsCreator ? 'payer_approved' : 'proposed';
    const payer_family_approved_at = payerIsCreator ? new Date().toISOString() : null;

    const { data, error } = await supabase
      .from('settlements')
      .insert({
        trip_id: tripId,
        from_family_id: fromFamilyId,
        to_family_id: toFamilyId,
        amount,
        currency,
        notes,
        status,
        payer_family_approved_at,
      })
      .select(JOIN)
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as Settlement, error: null };
  },

  async getSettlements(tripId: string, userFamilyId?: string): Promise<ServiceResult<Settlement[]>> {
    let query = supabase
      .from('settlements')
      .select(JOIN)
      .eq('trip_id', tripId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (userFamilyId) {
      query = query.or(`from_family_id.eq.${userFamilyId},to_family_id.eq.${userFamilyId}`);
    }

    const { data, error } = await query;
    if (error) return { data: null, error: error.message };
    return { data: data as Settlement[], error: null };
  },

  async getAllSettlementsForOrganizer(tripId: string): Promise<ServiceResult<Settlement[]>> {
    const { data, error } = await supabase
      .from('settlements')
      .select(JOIN)
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false });
    if (error) return { data: null, error: error.message };
    return { data: data as Settlement[], error: null };
  },

  async approveAsPayer(settlementId: string, userFamilyId: string): Promise<ServiceResult<Settlement>> {
    const { data: current, error: fetchError } = await supabase
      .from('settlements')
      .select('from_family_id, receiver_family_approved_at')
      .eq('id', settlementId)
      .single();
    if (fetchError) return { data: null, error: fetchError.message };
    if (!current) return { data: null, error: 'Settlement not found' };
    if (current.from_family_id !== userFamilyId) return { data: null, error: 'Only the payer family can approve as payer' };

    const now = new Date().toISOString();
    const newStatus = current.receiver_family_approved_at ? 'completed' : 'payer_approved';

    const { data, error } = await supabase
      .from('settlements')
      .update({ payer_family_approved_at: now, status: newStatus })
      .eq('id', settlementId)
      .select(JOIN)
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as Settlement, error: null };
  },

  async approveAsReceiver(settlementId: string, userFamilyId: string): Promise<ServiceResult<Settlement>> {
    const { data: current, error: fetchError } = await supabase
      .from('settlements')
      .select('to_family_id, payer_family_approved_at')
      .eq('id', settlementId)
      .single();
    if (fetchError) return { data: null, error: fetchError.message };
    if (!current) return { data: null, error: 'Settlement not found' };
    if (current.to_family_id !== userFamilyId) return { data: null, error: 'Only the receiver family can approve as receiver' };

    const now = new Date().toISOString();
    const newStatus = current.payer_family_approved_at ? 'completed' : 'receiver_approved';

    const { data, error } = await supabase
      .from('settlements')
      .update({ receiver_family_approved_at: now, status: newStatus })
      .eq('id', settlementId)
      .select(JOIN)
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as Settlement, error: null };
  },

  async dispute(settlementId: string, reason: string): Promise<ServiceResult<Settlement>> {
    const { data, error } = await supabase
      .from('settlements')
      .update({ status: 'disputed', dispute_reason: reason })
      .eq('id', settlementId)
      .select(JOIN)
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as Settlement, error: null };
  },

  async cancel(settlementId: string, reason: string): Promise<ServiceResult<Settlement>> {
    const { data, error } = await supabase
      .from('settlements')
      .update({ status: 'cancelled', cancel_reason: reason })
      .eq('id', settlementId)
      .select(JOIN)
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as Settlement, error: null };
  },

  async resolveDispute(settlementId: string): Promise<ServiceResult<Settlement>> {
    const { data: current, error: fetchError } = await supabase
      .from('settlements')
      .select('payer_family_approved_at, receiver_family_approved_at')
      .eq('id', settlementId)
      .single();
    if (fetchError) return { data: null, error: fetchError.message };
    if (!current) return { data: null, error: 'Settlement not found' };

    let derivedStatus: string;
    if (current.payer_family_approved_at && current.receiver_family_approved_at) {
      derivedStatus = 'completed';
    } else if (current.payer_family_approved_at) {
      derivedStatus = 'payer_approved';
    } else if (current.receiver_family_approved_at) {
      derivedStatus = 'receiver_approved';
    } else {
      derivedStatus = 'proposed';
    }

    const { data, error } = await supabase
      .from('settlements')
      .update({ status: derivedStatus, dispute_reason: null })
      .eq('id', settlementId)
      .select(JOIN)
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as Settlement, error: null };
  },

  async softDelete(settlementId: string): Promise<ServiceResult<null>> {
    const { error } = await supabase
      .from('settlements')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', settlementId);
    return { data: null, error: error?.message ?? null };
  },

  async restoreSettlement(settlementId: string): Promise<ServiceResult<null>> {
    const { error } = await supabase
      .from('settlements')
      .update({ deleted_at: null })
      .eq('id', settlementId);
    return { data: null, error: error?.message ?? null };
  },

  async permanentDelete(settlementId: string): Promise<ServiceResult<null>> {
    const { error } = await supabase
      .from('settlements')
      .delete()
      .eq('id', settlementId);
    return { data: null, error: error?.message ?? null };
  },

  async isExpenseEditLocked(tripId: string, familyId: string): Promise<boolean> {
    const { data } = await supabase
      .from('settlements')
      .select('id')
      .eq('trip_id', tripId)
      .is('deleted_at', null)
      .neq('status', 'cancelled')
      .or(`from_family_id.eq.${familyId},to_family_id.eq.${familyId}`)
      .limit(1);
    return (data?.length ?? 0) > 0;
  },
};
