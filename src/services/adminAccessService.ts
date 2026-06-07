import { supabase } from '../lib/supabaseClient';
import { AdminConsentRequest, ServiceResult } from '../types';
import { notificationService } from './notificationService';

export const adminAccessService = {
  async requestAccess(tripId: string, reason: string): Promise<ServiceResult<AdminConsentRequest>> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: 'Not authenticated' };

    const { data, error } = await supabase
      .from('admin_consent_requests')
      .insert({ trip_id: tripId, admin_id: user.id, reason, status: 'pending' })
      .select('*, trip:trips(*), admin:profiles(*)')
      .single();

    if (error) return { data: null, error: error.message };

    const { data: organizers } = await supabase
      .from('trip_members')
      .select('user_id')
      .eq('trip_id', tripId)
      .eq('role', 'trip_organizer');

    if (organizers && organizers.length > 0) {
      const organizerIds = organizers.map((o: { user_id: string }) => o.user_id);
      await notificationService.notifyUsers(
        organizerIds,
        tripId,
        'other',
        'Admin Access Request',
        `A global admin has requested access to private trip data. Reason: ${reason}`,
        { consent_request_id: (data as AdminConsentRequest).id }
      );
    }

    return { data: data as AdminConsentRequest, error: null };
  },

  async getMyRequests(): Promise<ServiceResult<AdminConsentRequest[]>> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: 'Not authenticated' };

    const { data, error } = await supabase
      .from('admin_consent_requests')
      .select('*, trip:trips(*), admin:profiles(*)')
      .eq('admin_id', user.id)
      .order('created_at', { ascending: false });

    if (error) return { data: null, error: error.message };
    return { data: data as AdminConsentRequest[], error: null };
  },

  async getPendingForTrip(tripId: string): Promise<ServiceResult<AdminConsentRequest[]>> {
    const { data, error } = await supabase
      .from('admin_consent_requests')
      .select('*, admin:profiles(*)')
      .eq('trip_id', tripId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error) return { data: null, error: error.message };
    return { data: data as AdminConsentRequest[], error: null };
  },

  async getActiveForTrip(tripId: string): Promise<ServiceResult<AdminConsentRequest[]>> {
    const { data, error } = await supabase
      .from('admin_consent_requests')
      .select('*, admin:profiles(*)')
      .eq('trip_id', tripId)
      .eq('status', 'approved')
      .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
      .order('approved_at', { ascending: false });

    if (error) return { data: null, error: error.message };
    return { data: data as AdminConsentRequest[], error: null };
  },

  async approveRequest(requestId: string, expiresInHours: 24 | 48 | 168): Promise<ServiceResult<AdminConsentRequest>> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: 'Not authenticated' };

    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('admin_consent_requests')
      .update({ status: 'approved', approved_by: user.id, approved_at: new Date().toISOString(), expires_at: expiresAt })
      .eq('id', requestId)
      .select()
      .single();

    if (error) return { data: null, error: error.message };

    const req = data as AdminConsentRequest;
    await notificationService.notifyUsers(
      [req.admin_id],
      req.trip_id,
      'other',
      'Access Request Approved',
      `Your access request has been approved. Access expires in ${expiresInHours} hours.`,
      { consent_request_id: req.id }
    );

    return { data: req, error: null };
  },

  async rejectRequest(requestId: string): Promise<ServiceResult<AdminConsentRequest>> {
    const { data, error } = await supabase
      .from('admin_consent_requests')
      .update({ status: 'rejected' })
      .eq('id', requestId)
      .select()
      .single();

    if (error) return { data: null, error: error.message };

    const req = data as AdminConsentRequest;
    await notificationService.notifyUsers(
      [req.admin_id],
      req.trip_id,
      'other',
      'Access Request Rejected',
      'Your access request has been rejected by the trip organizer.',
      { consent_request_id: req.id }
    );

    return { data: req, error: null };
  },

  async revokeAccess(requestId: string): Promise<ServiceResult<AdminConsentRequest>> {
    const { data, error } = await supabase
      .from('admin_consent_requests')
      .update({ status: 'revoked' })
      .eq('id', requestId)
      .select()
      .single();

    if (error) return { data: null, error: error.message };

    const req = data as AdminConsentRequest;
    await notificationService.notifyUsers(
      [req.admin_id],
      req.trip_id,
      'other',
      'Access Revoked',
      'Your admin access to this trip has been revoked by the organizer.',
      { consent_request_id: req.id }
    );

    return { data: req, error: null };
  },

  async hasActiveConsent(tripId: string): Promise<ServiceResult<boolean>> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: false, error: null };

    const { data, error } = await supabase
      .from('admin_consent_requests')
      .select('id')
      .eq('trip_id', tripId)
      .eq('admin_id', user.id)
      .eq('status', 'approved')
      .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
      .maybeSingle();

    if (error) return { data: null, error: error.message };
    return { data: data !== null, error: null };
  },
};
