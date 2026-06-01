import { supabase } from '../lib/supabaseClient';
import { Notification, ServiceResult } from '../types';

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
