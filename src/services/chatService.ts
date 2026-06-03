import { supabase } from '../lib/supabaseClient';
import { Message, ServiceResult } from '../types';
import { RealtimeChannel } from '@supabase/supabase-js';
import { notificationService } from './notificationService';
import { sendBroadcast } from '../lib/realtimeBroadcast';

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

    if (isPushTalk) {
      // Push talk: notify only opted-in family members
      chatService.notifyPushTalkReceivers(tripId, userId, familyId);
    } else {
      // Regular message: notify all other trip members
      const preview = content.length > 60 ? content.slice(0, 57) + '…' : content;
      notificationService.notifyTripMembers(
        tripId, userId, 'message',
        '💬 New Message',
        preview || 'Sent a photo or audio',
        { trip_id: tripId }
      );
    }

    return { data: data as Message, error: null };
  },

  async editMessage(
    messageId: string,
    userId: string,
    content: string
  ): Promise<ServiceResult<Message>> {
    const trimmed = content.trim();
    if (!trimmed) return { data: null, error: 'Message cannot be empty.' };

    const { data, error } = await supabase
      .from('messages')
      .update({ content: trimmed, edited_at: new Date().toISOString() })
      .eq('id', messageId)
      .eq('user_id', userId)
      .eq('message_type', 'text')
      .select('*, profile:profiles(*), family:families(*)')
      .single();

    if (error) return { data: null, error: error.message };
    chatService.broadcastMessage((data as Message).trip_id, data as Message);
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

  async notifyPushTalkReceivers(
    tripId: string,
    senderId: string,
    familyId?: string
  ): Promise<void> {
    // Get family members who have push_talk_enabled
    if (!familyId) return;
    const { data: members } = await supabase
      .from('family_members')
      .select('user_id')
      .eq('family_id', familyId)
      .eq('push_talk_enabled', true)
      .neq('user_id', senderId);

    if (!members?.length) return;

    const userIds = members.map((m: { user_id: string }) => m.user_id);
    const rows = userIds.map((userId) => ({
      user_id: userId,
      trip_id: tripId,
      type: 'push_talk',
      title: '🎙️ Push Talk',
      body: 'A voice message was sent to your family',
      data: { trip_id: tripId, family_id: familyId },
      is_read: false,
    }));

    const { data: inserted } = await supabase
      .from('notifications')
      .insert(rows)
      .select();

    await notificationService.sendPushToUsers(
      userIds,
      '🎙️ Push Talk',
      'A voice message was sent to your family',
      { trip_id: tripId, family_id: familyId }
    );

    // Broadcast real-time to each recipient
    (inserted ?? []).forEach((n: any) => {
      const channel = supabase.channel(`user-notifications:${n.user_id}`);
      void sendBroadcast(channel, 'notification', n)
        .finally(() => supabase.removeChannel(channel));
    });
  },

  broadcastMessage(tripId: string, message: Message): void {
    const channel = supabase.channel(`chat:${tripId}`);
    void sendBroadcast(channel, 'new_message', message)
      .finally(() => supabase.removeChannel(channel));
  },

  unsubscribe(channel: RealtimeChannel): void {
    supabase.removeChannel(channel);
  },
};
