import { supabase } from '../lib/supabaseClient';
import { Message, ServiceResult } from '../types';
import { RealtimeChannel } from '@supabase/supabase-js';
import { notificationService } from './notificationService';
import { sendBroadcast } from '../lib/realtimeBroadcast';
import { mediaService } from './mediaService';

// Keyed by tripId — reused for both receiving and sending so we never
// remove the subscriber's channel by accident.
const activeChannels = new Map<string, RealtimeChannel>();

// Set by TripChatScreen on mount/unmount so background audio player
// knows whether the chat screen is already handling push-talk playback.
let _activeChatTripId: string | null = null;
export function setActiveChatTrip(id: string | null) { _activeChatTripId = id; }
export function getActiveChatTrip() { return _activeChatTripId; }

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
    const messages = await mediaService.refreshChatMessageMediaUrls(data as Message[]);
    return { data: messages, error: null };
  },

  async getMessageById(messageId: string): Promise<ServiceResult<Message>> {
    const { data, error } = await supabase
      .from('messages')
      .select('*, profile:profiles(*), family:families(*)')
      .eq('id', messageId)
      .single();
    if (error) return { data: null, error: error.message };
    const [message] = await mediaService.refreshChatMessageMediaUrls([data as Message]);
    return { data: message, error: null };
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
      chatService.notifyPushTalkReceivers(tripId, userId, familyId, mediaUrl);
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
    onMessage: (message: Message) => void,
    onTyping?: (userId: string, name: string) => void
  ): RealtimeChannel {
    const channel = supabase
      .channel(`chat:${tripId}`)
      .on('broadcast', { event: 'new_message' }, ({ payload }) => {
        onMessage(payload as Message);
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (onTyping && payload?.userId && payload?.name) {
          onTyping(payload.userId as string, payload.name as string);
        }
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `trip_id=eq.${tripId}` },
        async ({ new: newRecord }) => {
          const messageId = (newRecord as { id?: string } | null)?.id;
          if (!messageId) return;
          const { data } = await chatService.getMessageById(messageId);
          if (data) onMessage(data);
        }
      )
      .subscribe();
    activeChannels.set(tripId, channel);
    return channel;
  },

  async notifyPushTalkReceivers(
    tripId: string,
    senderId: string,
    familyId?: string,
    mediaUrl?: string
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
      data: { trip_id: tripId, family_id: familyId, media_url: mediaUrl ?? null },
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
    const channel = activeChannels.get(tripId);
    if (channel) {
      void channel.send({ type: 'broadcast', event: 'new_message', payload: message });
    }
  },

  broadcastTyping(tripId: string, userId: string, name: string): void {
    const channel = activeChannels.get(tripId);
    if (channel) {
      void channel.send({ type: 'broadcast', event: 'typing', payload: { userId, name } });
    }
  },

  unsubscribe(channel: RealtimeChannel): void {
    for (const [tripId, ch] of activeChannels.entries()) {
      if (ch === channel) { activeChannels.delete(tripId); break; }
    }
    supabase.removeChannel(channel);
  },
};
