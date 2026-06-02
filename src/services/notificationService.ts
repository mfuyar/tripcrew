import { supabase } from '../lib/supabaseClient';
import { Notification, ServiceResult } from '../types';

const NOTIFY_CHANNEL = (userId: string) => `user-notifications:${userId}`;

export const notificationService = {
  async getNotifications(userId: string): Promise<ServiceResult<Notification[]>> {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return { data: null, error: error.message };
    return { data: data as Notification[], error: null };
  },

  async markRead(notificationId: string): Promise<ServiceResult<null>> {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);
    return { data: null, error: error?.message ?? null };
  },

  async markAllRead(userId: string): Promise<ServiceResult<null>> {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);
    return { data: null, error: error?.message ?? null };
  },

  async createNotification(
    input: Omit<Notification, 'id' | 'created_at'>
  ): Promise<ServiceResult<Notification>> {
    const { data, error } = await supabase
      .from('notifications')
      .insert(input)
      .select()
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as Notification, error: null };
  },

  /**
   * Creates a notification for every trip member except the sender,
   * and broadcasts it on each user's personal channel so online users
   * see it instantly without polling.
   */
  async notifyTripMembers(
    tripId: string,
    excludeUserId: string,
    type: Notification['type'],
    title: string,
    body: string,
    data?: Record<string, unknown>
  ): Promise<void> {
    // Get all member user IDs for the trip
    const { data: members } = await supabase
      .from('trip_members')
      .select('user_id')
      .eq('trip_id', tripId)
      .neq('user_id', excludeUserId);

    if (!members?.length) return;

    const rows = members.map((m) => ({
      user_id: m.user_id,
      trip_id: tripId,
      type,
      title,
      body,
      data: data ?? null,
      is_read: false,
    }));

    const { data: inserted } = await supabase
      .from('notifications')
      .insert(rows)
      .select();

    // Broadcast to each user's personal channel for real-time delivery
    (inserted ?? []).forEach((n: Notification) => {
      supabase
        .channel(NOTIFY_CHANNEL(n.user_id))
        .send({ type: 'broadcast', event: 'notification', payload: n });
    });
  },

  /** Subscribe to real-time notifications for a user. Returns unsubscribe fn. */
  subscribeToNotifications(
    userId: string,
    onNotification: (n: Notification) => void
  ): () => void {
    const channel = supabase
      .channel(NOTIFY_CHANNEL(userId))
      .on('broadcast', { event: 'notification' }, ({ payload }) => {
        onNotification(payload as Notification);
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  },

  async getUnreadCount(userId: string): Promise<ServiceResult<number>> {
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);
    if (error) return { data: null, error: error.message };
    return { data: count ?? 0, error: null };
  },
};
