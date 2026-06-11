import { supabase } from '../lib/supabaseClient';
import { Notification, Profile, Settlement, ServiceResult } from '../types';
import { notificationService } from './notificationService';

const JOIN = '*, from_family:families!from_family_id(*), to_family:families!to_family_id(*)';

function formatSettlementAmount(settlement: Pick<Settlement, 'amount' | 'currency'>): string {
  const currency = settlement.currency || 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(settlement.amount);
  } catch {
    return `${currency} ${settlement.amount.toFixed(2)}`;
  }
}

function familyName(settlement: Settlement, familyId?: string | null): string {
  if (settlement.from_family_id === familyId) return settlement.from_family?.name ?? 'Payer family';
  if (settlement.to_family_id === familyId) return settlement.to_family?.name ?? 'Receiver family';
  return 'Family';
}

function payerName(settlement: Settlement): string {
  if (settlement.settlement_type === 'person') {
    return settlement.from_user?.full_name ?? settlement.from_user?.email ?? 'Payer';
  }
  return familyName(settlement, settlement.from_family_id);
}

function receiverName(settlement: Settlement): string {
  if (settlement.settlement_type === 'person') {
    return settlement.to_user?.full_name ?? settlement.to_user?.email ?? 'Receiver';
  }
  return familyName(settlement, settlement.to_family_id);
}

async function hydratePersonProfiles<T extends Settlement | Settlement[]>(input: T): Promise<T> {
  const settlements = Array.isArray(input) ? input : [input];
  const profileIds = Array.from(new Set(
    settlements
      .flatMap((settlement) => [settlement.from_user_id, settlement.to_user_id])
      .filter(Boolean) as string[]
  ));

  if (profileIds.length === 0) return input;

  const { data } = await supabase
    .from('profiles')
    .select('id, email, full_name, avatar_url, phone, created_at, updated_at')
    .in('id', profileIds);

  const profilesById = new Map((data ?? []).map((profile: Profile) => [profile.id, profile]));
  settlements.forEach((settlement) => {
    if (settlement.from_user_id) settlement.from_user = profilesById.get(settlement.from_user_id);
    if (settlement.to_user_id) settlement.to_user = profilesById.get(settlement.to_user_id);
  });
  return input;
}

async function getSettlementRecipientIds(settlement: Settlement, excludeUserId?: string): Promise<string[]> {
  const ids = new Set<string>();

  if (settlement.settlement_type === 'person') {
    if (settlement.from_user_id) ids.add(settlement.from_user_id);
    if (settlement.to_user_id) ids.add(settlement.to_user_id);
  } else {
    const familyIds = [settlement.from_family_id, settlement.to_family_id].filter(Boolean) as string[];
    const { data: familyMembers } = await supabase
      .from('family_members')
      .select('user_id')
      .eq('trip_id', settlement.trip_id)
      .in('family_id', familyIds);

    (familyMembers ?? []).forEach((row: { user_id: string }) => ids.add(row.user_id));
  }

  if (excludeUserId) ids.delete(excludeUserId);
  return [...ids];
}

async function getOrganizerRecipientIds(settlement: Settlement, excludeUserId?: string): Promise<string[]> {
  const { data: organizers } = await supabase
    .from('trip_members')
    .select('user_id')
    .eq('trip_id', settlement.trip_id)
    .eq('role', 'trip_organizer');
  const ids = new Set((organizers ?? []).map((row: { user_id: string }) => row.user_id));
  if (excludeUserId) ids.delete(excludeUserId);
  return [...ids];
}

async function notifySettlementStakeholders(
  settlement: Settlement,
  title: string,
  body: string,
  event: string,
  excludeUserId?: string,
  type: Notification['type'] = 'settlement_request'
): Promise<void> {
  const userIds = await getSettlementRecipientIds(settlement, excludeUserId);
  if (userIds.length === 0) return;

  await notificationService.notifyUsers(userIds, settlement.trip_id, type, title, body, {
    type,
    event,
    trip_id: settlement.trip_id,
    settlement_id: settlement.id,
    settlement_type: settlement.settlement_type ?? 'family',
    from_family_id: settlement.from_family_id,
    to_family_id: settlement.to_family_id,
    from_user_id: settlement.from_user_id,
    to_user_id: settlement.to_user_id,
    status: settlement.status,
  });
}

async function notifyTripSettlementEvent(
  settlement: Settlement,
  title: string,
  body: string,
  event: string,
  excludeUserId?: string,
  type: Notification['type'] = 'payment_confirmed'
): Promise<void> {
  if (!excludeUserId) {
    await notifySettlementStakeholders(settlement, title, body, event, undefined, type);
    return;
  }

  await notificationService.notifyTripMembers(
    settlement.trip_id,
    excludeUserId,
    type,
    title,
    body,
    {
      type,
      event,
      trip_id: settlement.trip_id,
      settlement_id: settlement.id,
      settlement_type: settlement.settlement_type ?? 'family',
      from_family_id: settlement.from_family_id,
      to_family_id: settlement.to_family_id,
      from_user_id: settlement.from_user_id,
      to_user_id: settlement.to_user_id,
      status: settlement.status,
    }
  );
}

async function notifyConfirmationUpdate(
  settlement: Settlement,
  title: string,
  body: string,
  event: string,
  actorUserId?: string
): Promise<void> {
  const [stakeholderIds, organizerIds] = await Promise.all([
    getSettlementRecipientIds(settlement, actorUserId),
    getOrganizerRecipientIds(settlement, actorUserId),
  ]);
  const userIds = Array.from(new Set([...stakeholderIds, ...organizerIds]));
  if (userIds.length === 0) return;

  await notificationService.notifyUsers(userIds, settlement.trip_id, 'settlement_request', title, body, {
    type: 'settlement_request',
    event,
    trip_id: settlement.trip_id,
    settlement_id: settlement.id,
    settlement_type: settlement.settlement_type ?? 'family',
    status: settlement.status,
  });
}

export const settlementService = {
  async createFamilySettlementRequest(
    tripId: string,
    fromFamilyId: string,
    toFamilyId: string,
    amount: number,
    currency: string,
    notes: string | undefined,
    actorUserId?: string
  ): Promise<ServiceResult<Settlement>> {
    if (fromFamilyId === toFamilyId) {
      return { data: null, error: 'A family cannot pay themselves' };
    }

    const { data, error } = await supabase
      .from('settlements')
      .insert({
        settlement_type: 'family',
        trip_id: tripId,
        from_family_id: fromFamilyId,
        to_family_id: toFamilyId,
        amount,
        currency,
        notes,
        status: 'proposed',
      })
      .select(JOIN)
      .single();
    if (error) return { data: null, error: error.message };
    const settlement = await hydratePersonProfiles(data as Settlement);
    const amountLabel = formatSettlementAmount(settlement);

    await notifySettlementStakeholders(
      settlement,
      '💸 Settlement requested',
      `${payerName(settlement)} should pay ${receiverName(settlement)} ${amountLabel}. Please confirm after payment.`,
      'settlement_requested',
      actorUserId,
      'settlement_request'
    );
    return { data: settlement, error: null };
  },

  async createPersonSettlementRequest(
    tripId: string,
    fromUserId: string,
    toUserId: string,
    amount: number,
    currency: string,
    notes: string | undefined,
    actorUserId?: string
  ): Promise<ServiceResult<Settlement>> {
    if (fromUserId === toUserId) {
      return { data: null, error: 'A person cannot pay themselves' };
    }

    const { data, error } = await supabase
      .from('settlements')
      .insert({
        settlement_type: 'person',
        trip_id: tripId,
        from_user_id: fromUserId,
        to_user_id: toUserId,
        amount,
        currency,
        notes,
        status: 'proposed',
      })
      .select(JOIN)
      .single();
    if (error) return { data: null, error: error.message };
    const settlement = await hydratePersonProfiles(data as Settlement);
    await notifySettlementStakeholders(
      settlement,
      '💸 Personal settlement requested',
      `${payerName(settlement)} should pay ${receiverName(settlement)} ${formatSettlementAmount(settlement)}. Please confirm after payment.`,
      'settlement_requested',
      actorUserId,
      'settlement_request'
    );
    return { data: settlement, error: null };
  },

  async recordSettlement(
    tripId: string,
    fromFamilyId: string,
    toFamilyId: string,
    amount: number,
    currency: string,
    notes: string | undefined,
    actorUserId?: string
  ): Promise<ServiceResult<Settlement>> {
    return settlementService.createFamilySettlementRequest(
      tripId,
      fromFamilyId,
      toFamilyId,
      amount,
      currency,
      notes,
      actorUserId
    );
  },

  async createProposal(
    tripId: string,
    fromFamilyId: string,
    toFamilyId: string,
    amount: number,
    currency: string,
    notes: string | undefined,
    _createdByFamilyId: string,
    actorUserId?: string
  ): Promise<ServiceResult<Settlement>> {
    return settlementService.recordSettlement(
      tripId,
      fromFamilyId,
      toFamilyId,
      amount,
      currency,
      notes,
      actorUserId
    );
  },

  async confirmAsPayer(settlementId: string, actorUserId?: string): Promise<ServiceResult<Settlement>> {
    const { data: current, error: fetchError } = await supabase
      .from('settlements')
      .select('receiver_family_approved_at')
      .eq('id', settlementId)
      .single();
    if (fetchError) return { data: null, error: fetchError.message };

    const now = new Date().toISOString();
    const nextStatus = current?.receiver_family_approved_at ? 'confirmed' : 'payer_approved';
    const { data, error } = await supabase
      .from('settlements')
      .update({ payer_family_approved_at: now, status: nextStatus })
      .eq('id', settlementId)
      .select(JOIN)
      .single();
    if (error) return { data: null, error: error.message };
    const settlement = await hydratePersonProfiles(data as Settlement);
    const bothConfirmed = settlement.status === 'confirmed';
    await notifyConfirmationUpdate(
      settlement,
      '✅ Payer confirmed payment',
      bothConfirmed
        ? `${payerName(settlement)} confirmed paying ${formatSettlementAmount(settlement)}. Both sides have confirmed — the organizer can now close it.`
        : `${payerName(settlement)} confirmed paying ${formatSettlementAmount(settlement)}. Waiting on ${receiverName(settlement)} to confirm receipt.`,
      'settlement_payer_confirmed',
      actorUserId
    );
    return { data: settlement, error: null };
  },

  async confirmAsReceiver(settlementId: string, actorUserId?: string): Promise<ServiceResult<Settlement>> {
    const { data: current, error: fetchError } = await supabase
      .from('settlements')
      .select('payer_family_approved_at')
      .eq('id', settlementId)
      .single();
    if (fetchError) return { data: null, error: fetchError.message };

    const now = new Date().toISOString();
    const nextStatus = current?.payer_family_approved_at ? 'confirmed' : 'receiver_approved';
    const { data, error } = await supabase
      .from('settlements')
      .update({ receiver_family_approved_at: now, status: nextStatus })
      .eq('id', settlementId)
      .select(JOIN)
      .single();
    if (error) return { data: null, error: error.message };
    const settlement = await hydratePersonProfiles(data as Settlement);
    const bothConfirmed = settlement.status === 'confirmed';
    await notifyConfirmationUpdate(
      settlement,
      '✅ Receiver confirmed receipt',
      bothConfirmed
        ? `${receiverName(settlement)} confirmed receiving ${formatSettlementAmount(settlement)}. Both sides have confirmed — the organizer can now close it.`
        : `${receiverName(settlement)} confirmed receiving ${formatSettlementAmount(settlement)}. Waiting on ${payerName(settlement)} to confirm payment.`,
      'settlement_receiver_confirmed',
      actorUserId
    );
    return { data: settlement, error: null };
  },

  async closeSettlement(settlementId: string, actorUserId?: string): Promise<ServiceResult<Settlement>> {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('settlements')
      .update({ status: 'completed', confirmed_at: now, closed_at: now })
      .eq('id', settlementId)
      .select(JOIN)
      .single();
    if (error) return { data: null, error: error.message };
    const settlement = await hydratePersonProfiles(data as Settlement);
    await notifySettlementStakeholders(
      settlement,
      '✅ Settlement closed',
      `${formatSettlementAmount(settlement)} settlement between ${payerName(settlement)} and ${receiverName(settlement)} was closed by the organizer.`,
      'settlement_closed',
      actorUserId,
      'payment_confirmed'
    );
    return { data: settlement, error: null };
  },

  async getSettlements(tripId: string, userFamilyId?: string, userId?: string): Promise<ServiceResult<Settlement[]>> {
    let query = supabase
      .from('settlements')
      .select(JOIN)
      .eq('trip_id', tripId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    const filters: string[] = [];
    if (userFamilyId) {
      filters.push(`from_family_id.eq.${userFamilyId}`, `to_family_id.eq.${userFamilyId}`);
    }
    if (userId) {
      filters.push(`from_user_id.eq.${userId}`, `to_user_id.eq.${userId}`);
    }
    if (filters.length > 0) {
      query = query.or(filters.join(','));
    }

    const { data, error } = await query;
    if (error) return { data: null, error: error.message };
    return { data: await hydratePersonProfiles((data ?? []) as Settlement[]), error: null };
  },

  async getAllSettlementsForOrganizer(tripId: string): Promise<ServiceResult<Settlement[]>> {
    const { data, error } = await supabase
      .from('settlements')
      .select(JOIN)
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false });
    if (error) return { data: null, error: error.message };
    return { data: await hydratePersonProfiles((data ?? []) as Settlement[]), error: null };
  },

  async cancel(settlementId: string, reason: string, actorUserId?: string): Promise<ServiceResult<Settlement>> {
    const { data, error } = await supabase
      .from('settlements')
      .update({ status: 'cancelled', cancel_reason: reason })
      .eq('id', settlementId)
      .select(JOIN)
      .single();
    if (error) return { data: null, error: error.message };
    const settlement = await hydratePersonProfiles(data as Settlement);
    await notifySettlementStakeholders(
      settlement,
      '🚫 Settlement record cancelled',
      `${formatSettlementAmount(settlement)} settlement record was cancelled: ${reason}`,
      'settlement_cancelled',
      actorUserId
    );
    return { data: settlement, error: null };
  },

  async sendSettlementNotification(settlementId: string, actorUserId?: string): Promise<ServiceResult<null>> {
    const { data, error } = await supabase
      .from('settlements')
      .select(JOIN)
      .eq('id', settlementId)
      .single();
    if (error) return { data: null, error: error.message };
    if (!data) return { data: null, error: 'Settlement not found' };

    const settlement = await hydratePersonProfiles(data as Settlement);
    await notifySettlementStakeholders(
      settlement,
      '💸 Settlement update',
      `${payerName(settlement)} should pay ${receiverName(settlement)} ${formatSettlementAmount(settlement)}. Please confirm after payment.`,
      'settlement_notification',
      actorUserId,
      'settlement_request'
    );
    await supabase
      .from('settlements')
      .update({ notified_at: new Date().toISOString() })
      .eq('id', settlementId);
    return { data: null, error: null };
  },

  async markSettlementEmailed(settlementId: string): Promise<ServiceResult<null>> {
    const { error } = await supabase
      .from('settlements')
      .update({ emailed_at: new Date().toISOString() })
      .eq('id', settlementId);
    return { data: null, error: error?.message ?? null };
  },

  async getSettlementEmailRecipients(settlement: Settlement): Promise<ServiceResult<string[]>> {
    const ids = await getSettlementRecipientIds(settlement);
    if (ids.length === 0) return { data: [], error: null };

    const { data, error } = await supabase
      .from('profiles')
      .select('email')
      .in('id', ids);
    if (error) return { data: null, error: error.message };
    return {
      data: Array.from(new Set((data ?? []).map((row: { email?: string }) => row.email).filter(Boolean) as string[])),
      error: null,
    };
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

  /**
   * Live updates for a trip's settlements (status changes, confirmations,
   * new requests, cancellations, ...). Screens reload their list on any change
   * so payer/receiver/organizer stay in sync without manual refresh.
   */
  subscribeToSettlements(tripId: string, onChange: () => void): () => void {
    // Multiple screens (e.g. Settlements + Payment Tracking) can be mounted at
    // once on the navigation stack and both subscribe for the same trip. Each
    // call needs its own channel — `supabase.channel(topic)` returns the same
    // shared instance for a given topic, and calling `.on()` on a channel
    // another caller already `.subscribe()`'d throws. A unique topic per call
    // gives each subscriber its own independent channel.
    const channel = supabase
      .channel(`settlements:${tripId}:${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'settlements', filter: `trip_id=eq.${tripId}` },
        () => onChange()
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  },
};
