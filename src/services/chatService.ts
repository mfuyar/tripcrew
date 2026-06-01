import { supabase } from '../lib/supabaseClient';
import { Message, ServiceResult } from '../types';
import { RealtimeChannel } from '@supabase/supabase-js';

export const chatService = {
  async getMessages(
    tripId: string,
    limit = 50
  ): Promise<ServiceResult<Message[]>> {
    const { data, error } = await supabase
      .from('messages')
      .select('*, profile:profiles(*), family:families(*)')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: true })
      .limit(limit);
    if (error) return { data: null, error: error.message };
    return { data: data as Message[], error: null };
  },

  async sendMessage(
    tripId: string,
    userId: string,
    content: string,
    familyId?: string,
    messageType: Message['message_type'] = 'text',
    mediaUrl?: string,
    mimeType?: string,
    durationSeconds?: number,
    isPushTalk = false
  ): Promise<ServiceResult<Message>> {
    const { data, error } = await supabase
      .from('messages')
      .insert({
        trip_id: tripId,
        user_id: userId,
        family_id: familyId ?? null,
        content,
        message_type: messageType,
        media_url: mediaUrl ?? null,
        mime_type: mimeType ?? null,
        duration_seconds: durationSeconds ?? null,
        is_push_talk: isPushTalk,
      })
      .select('*, profile:profiles(*), family:families(*)')
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as Message, error: null };
  },

  subscribeToMessages(
    tripId: string,
    onMessage: (message: Message) => void
  ): RealtimeChannel {
    const channel = supabase
      .channel(`messages:${tripId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `trip_id=eq.${tripId}`,
        },
        async (payload) => {
          // Fetch full message with joined data
          const { data } = await supabase
            .from('messages')
            .select('*, profile:profiles(*), family:families(*)')
            .eq('id', payload.new.id)
            .single();
          if (data) onMessage(data as Message);
        }
      )
      .subscribe();
    return channel;
  },

  unsubscribe(channel: RealtimeChannel): void {
    supabase.removeChannel(channel);
  },
};
