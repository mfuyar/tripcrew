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
    // Broadcast to all subscribers on this trip's chat channel
    chatService.broadcastMessage(tripId, data as Message);
    return { data: data as Message, error: null };
  },

  subscribeToMessages(
    tripId: string,
    onMessage: (message: Message) => void
  ): RealtimeChannel {
    // Use Broadcast — doesn't require REPLICA IDENTITY or JWT for RLS
    const channel = supabase
      .channel(`chat:${tripId}`)
      .on('broadcast', { event: 'new_message' }, ({ payload }) => {
        onMessage(payload as Message);
      })
      .subscribe();
    return channel;
  },

  broadcastMessage(tripId: string, message: Message): void {
    supabase
      .channel(`chat:${tripId}`)
      .send({ type: 'broadcast', event: 'new_message', payload: message });
  },

  unsubscribe(channel: RealtimeChannel): void {
    supabase.removeChannel(channel);
  },
};
