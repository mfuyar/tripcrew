import { supabase } from '../lib/supabaseClient';
import { Announcement, ServiceResult } from '../types';
import { notificationService } from './notificationService';

function isMissingArchiveColumn(error?: string | null): boolean {
  if (!error) return false;
  return (
    error.includes('is_archived') ||
    error.includes('schema cache') ||
    error.includes('Could not find the column')
  );
}

export const announcementService = {
  async create(
    tripId: string,
    userId: string,
    input: Pick<Announcement, 'title' | 'content' | 'priority'>
  ): Promise<ServiceResult<Announcement>> {
    const { data, error } = await supabase
      .from('announcements')
      .insert({ ...input, trip_id: tripId, created_by: userId })
      .select('*, creator:profiles(*)')
      .single();
    if (error) return { data: null, error: error.message };

    const PRIORITY_ICON: Record<string, string> = {
      urgent: '🔴', high: '🟠', normal: '📢', low: '🟢',
    };
    notificationService.notifyTripMembers(
      tripId, userId, 'announcement',
      `${PRIORITY_ICON[input.priority] ?? '📢'} ${input.title}`,
      input.content.length > 80 ? input.content.slice(0, 77) + '…' : input.content,
      { announcement_id: data.id }
    );

    return { data: data as Announcement, error: null };
  },

  async getAll(tripId: string): Promise<ServiceResult<Announcement[]>> {
    let query = supabase
      .from('announcements')
      .select('*, creator:profiles(*), reads:announcement_reads(*)')
      .eq('trip_id', tripId);

    let { data, error } = await query
      .eq('is_archived', false)
      .order('created_at', { ascending: false });

    if (error && isMissingArchiveColumn(error.message)) {
      const retry = await supabase
        .from('announcements')
        .select('*, creator:profiles(*), reads:announcement_reads(*)')
        .eq('trip_id', tripId)
        .order('created_at', { ascending: false });
      data = retry.data;
      error = retry.error;
    }

    if (error) return { data: null, error: error.message };
    return { data: data as Announcement[], error: null };
  },

  async getLatest(tripId: string, limit = 3): Promise<ServiceResult<Announcement[]>> {
    let { data, error } = await supabase
      .from('announcements')
      .select('id, title, content, priority, created_at')
      .eq('trip_id', tripId)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error && isMissingArchiveColumn(error.message)) {
      const retry = await supabase
        .from('announcements')
        .select('id, title, content, priority, created_at')
        .eq('trip_id', tripId)
        .order('created_at', { ascending: false })
        .limit(limit);
      data = retry.data;
      error = retry.error;
    }

    if (error) return { data: null, error: error.message };
    return { data: data as Announcement[], error: null };
  },

  async archive(announcementId: string): Promise<ServiceResult<null>> {
    const { error } = await supabase
      .from('announcements')
      .update({ is_archived: true })
      .eq('id', announcementId);
    return { data: null, error: error?.message ?? null };
  },

  async unarchive(announcementId: string): Promise<ServiceResult<null>> {
    const { error } = await supabase
      .from('announcements')
      .update({ is_archived: false })
      .eq('id', announcementId);
    return { data: null, error: error?.message ?? null };
  },

  async getArchived(tripId: string): Promise<ServiceResult<Announcement[]>> {
    const { data, error } = await supabase
      .from('announcements')
      .select('*, creator:profiles(*), reads:announcement_reads(*)')
      .eq('trip_id', tripId)
      .eq('is_archived', true)
      .order('created_at', { ascending: false });
    if (error) return { data: null, error: error.message };
    return { data: data as Announcement[], error: null };
  },

  async markRead(
    announcementId: string,
    userId: string
  ): Promise<ServiceResult<null>> {
    const { error } = await supabase.from('announcement_reads').upsert(
      { announcement_id: announcementId, user_id: userId, read_at: new Date().toISOString() },
      { onConflict: 'announcement_id,user_id' }
    );
    return { data: null, error: error?.message ?? null };
  },

  async delete(announcementId: string): Promise<ServiceResult<null>> {
    const { error } = await supabase
      .from('announcements')
      .delete()
      .eq('id', announcementId);
    return { data: null, error: error?.message ?? null };
  },
};
