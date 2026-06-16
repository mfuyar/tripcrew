import { supabase } from '../lib/supabaseClient';
import { Message, Notification, ServiceResult } from '../types';
import { RealtimeChannel } from '@supabase/supabase-js';
import { notificationService } from './notificationService';
import { mediaService } from './mediaService';

// Set by TripChatScreen on mount/unmount so background audio player
// knows whether the chat screen is already handling push-talk playback.
let _activeChatTripId: string | null = null;
export function setActiveChatTrip(id: string | null) { _activeChatTripId = id; }
export function getActiveChatTrip() { return _activeChatTripId; }

function isMissingPushTalkRpc(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === 'PGRST202' ||
    error.message?.includes('create_push_talk_notifications') === true ||
    error.message?.includes('schema cache') === true
  );
}

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

    if (isPushTalk) {
      // Push talk: always notify family members. Their Live Audio setting only
      // controls auto-play, not whether they receive the background alert.
      const notify = await chatService.notifyPushTalkReceivers(tripId, userId, familyId, mediaUrl);
      if (notify?.error) return { data: data as Message, error: notify.error };
    } else {
      // Regular message: notify all other trip members
      const preview = content.length > 60 ? content.slice(0, 57) + '…' : content;
      const notify = await notificationService.notifyTripMembers(
        tripId, userId, 'message',
        '💬 New Message',
        preview || 'Sent a photo or audio',
        { trip_id: tripId }
      );
      if (notify?.error) return { data: data as Message, error: notify.error };
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
    return { data: data as Message, error: null };
  },

  subscribeToMessages(
    tripId: string,
    onMessage: (message: Message) => void,
    onTyping?: (userId: string, name: string) => void
  ): RealtimeChannel {
    void onTyping;
    const channel = supabase
      .channel(`chat-db:${tripId}`)
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
    return channel;
  },

  async notifyPushTalkReceivers(
    tripId: string,
    senderId: string,
    familyId?: string,
    mediaUrl?: string
  ): Promise<ServiceResult<number>> {
    let usedRpc = true;
    let { data: recipients, error } = await supabase.rpc('create_push_talk_notifications', {
      p_trip_id: tripId,
      p_sender_id: senderId,
      p_family_id: familyId ?? null,
      p_media_url: mediaUrl ?? null,
    });

    if (error && isMissingPushTalkRpc(error)) {
      usedRpc = false;
      const fallback = await supabase
        .from('trip_members')
        .select('user_id')
        .eq('trip_id', tripId)
        .neq('user_id', senderId);
      recipients = fallback.data?.map((m) => ({ user_id: m.user_id }));
      error = fallback.error;
    }

    if (error) return { data: null, error: error.message };

    let rows = (recipients ?? []) as (Partial<Notification> & { user_id: string; auto_play?: boolean | null })[];
    const missingAutoPlayPrefs = rows.some((r) => r.auto_play === undefined || r.auto_play === null);
    if (missingAutoPlayPrefs && rows.length > 0) {
      const { data: prefs } = await supabase
        .from('family_members')
        .select('user_id, push_talk_enabled')
        .eq('trip_id', tripId)
        .in('user_id', rows.map((r) => r.user_id));
      const autoPlayByUser = new Map(
        (prefs ?? []).map((m: { user_id: string; push_talk_enabled: boolean }) => [m.user_id, m.push_talk_enabled])
      );
      rows = rows.map((r) => ({ ...r, auto_play: autoPlayByUser.get(r.user_id) ?? false }));
    }

    // Each recipient's own Live Audio setting decides whether their push payload
    // tells their device to auto-play — embed it per group since it can differ.
    const autoPlayIds = Array.from(new Set(rows.filter((r) => r.auto_play).map((r) => r.user_id)));
    const silentIds = Array.from(new Set(rows.filter((r) => !r.auto_play).map((r) => r.user_id)));
    if (autoPlayIds.length === 0 && silentIds.length === 0) return { data: 0, error: null };

    const basePayload = { trip_id: tripId, family_id: familyId, type: 'push_talk', media_url: mediaUrl ?? null };
    const [autoPlayPush, silentPush] = await Promise.all([
      autoPlayIds.length > 0
        ? usedRpc
          ? notificationService.sendPushToUsers(autoPlayIds, '🎙️ Push to Talk', 'A voice message was sent to your family', { ...basePayload, auto_play: true })
          : notificationService.notifyUsers(autoPlayIds, tripId, 'push_talk', '🎙️ Push to Talk', 'A voice message was sent to your family', { ...basePayload, auto_play: true })
        : { error: null },
      silentIds.length > 0
        ? usedRpc
          ? notificationService.sendPushToUsers(silentIds, '🎙️ Push to Talk', 'A voice message was sent to your family', { ...basePayload, auto_play: false })
          : notificationService.notifyUsers(silentIds, tripId, 'push_talk', '🎙️ Push to Talk', 'A voice message was sent to your family', { ...basePayload, auto_play: false })
        : { error: null },
    ]);

    return { data: autoPlayIds.length + silentIds.length, error: autoPlayPush.error ?? silentPush.error };
  },

  broadcastMessage(tripId: string, message: Message): void {
    void tripId;
    void message;
  },

  async holdMessage(messageId: string): Promise<ServiceResult<null>> {
    const { error } = await supabase
      .from('messages')
      .update({ is_held: true })
      .eq('id', messageId);
    return { data: null, error: error?.message ?? null };
  },

  async unholdMessage(messageId: string): Promise<ServiceResult<null>> {
    const { error } = await supabase
      .from('messages')
      .update({ is_held: false })
      .eq('id', messageId);
    return { data: null, error: error?.message ?? null };
  },

  broadcastTyping(tripId: string, userId: string, name: string): void {
    void tripId;
    void userId;
    void name;
  },

  unsubscribe(channel: RealtimeChannel): void {
    supabase.removeChannel(channel);
  },
};
