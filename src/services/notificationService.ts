import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabaseClient';
import { sendBroadcast } from '../lib/realtimeBroadcast';
import { Notification, ServiceResult } from '../types';
import { NOTIFICATION_SOUND } from '../constants/notifications';

const NOTIFY_CHANNEL = (userId: string) => `user-notifications:${userId}`;

type PushPayload = {
  userIds: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

type ExpoPushTicket = {
  status?: string;
  message?: string;
  details?: Record<string, unknown>;
};

function broadcastNotification(notification: Notification): void {
  const channel = supabase.channel(NOTIFY_CHANNEL(notification.user_id));
  void sendBroadcast(channel, 'notification', notification)
    .finally(() => supabase.removeChannel(channel));
}

function getExpoProjectId(): string | null {
  const extraProjectId = Constants.expoConfig?.extra?.eas?.projectId;
  const easProjectId = Constants.easConfig?.projectId;
  const projectId = typeof extraProjectId === 'string' ? extraProjectId : easProjectId;
  if (!projectId || projectId === 'your-eas-project-id') return null;
  return projectId;
}

function getPlatformName(): 'ios' | 'android' | 'web' | 'unknown' {
  if (Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web') {
    return Platform.OS;
  }
  return 'unknown';
}

function getPushSendError(tickets: unknown): string | null {
  const ticketList = Array.isArray(tickets)
    ? tickets
    : Array.isArray((tickets as { data?: unknown[] } | null)?.data)
      ? (tickets as { data: unknown[] }).data
      : null;
  const failed = ticketList?.find((ticket) => (ticket as ExpoPushTicket)?.status === 'error') as ExpoPushTicket | undefined;
  return failed?.message ?? null;
}

async function sendDirectExpoPushNotifications({ userIds, title, body, data }: PushPayload): Promise<ServiceResult<number>> {
  const uniqueUserIds = Array.from(new Set(userIds));
  if (uniqueUserIds.length === 0) return { data: 0, error: null };

  const { data: tokens, error } = await supabase
    .from('push_tokens')
    .select('token')
    .in('user_id', uniqueUserIds)
    .eq('is_active', true);

  if (error) return { data: null, error: error.message };

  const uniqueTokens = Array.from(new Set((tokens ?? []).map((row: { token: string }) => row.token)));
  if (uniqueTokens.length === 0) {
    // Recipients simply haven't enabled push notifications on any device — not
    // a send failure. The in-app/broadcast notification row was already created,
    // so surfacing this to the sender as an error would be both unactionable and
    // would fire on virtually every send.
    return { data: 0, error: null };
  }

  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(uniqueTokens.map((to) => ({
      to,
      title,
      body,
      data: data ?? {},
      sound: NOTIFICATION_SOUND,
      channelId: 'default',
      priority: 'high',
    }))),
  });

  const tickets = await response.json().catch(() => null);
  if (!response.ok) {
    return { data: null, error: `Expo push request failed (${response.status}).` };
  }

  const ticketError = getPushSendError(tickets);
  if (ticketError) return { data: null, error: ticketError };
  return { data: uniqueTokens.length, error: null };
}

async function sendExpoPushNotifications(payload: PushPayload): Promise<ServiceResult<number>> {
  const uniqueUserIds = Array.from(new Set(payload.userIds));
  if (uniqueUserIds.length === 0) return { data: 0, error: null };

  try {
    const { data, error } = await supabase.functions.invoke('send-push', {
      body: {
        userIds: uniqueUserIds,
        title: payload.title,
        body: payload.body,
        data: payload.data ?? {},
      },
    });
    if (error) throw error;
    const sent = typeof (data as { sent?: unknown } | null)?.sent === 'number'
      ? (data as { sent: number }).sent
      : null;
    const ticketError = getPushSendError((data as { tickets?: unknown } | null)?.tickets);
    if (ticketError) return { data: null, error: ticketError };
    if (sent && sent > 0) return { data: sent, error: null };
  } catch {
    // Fall through to direct Expo push fallback below.
  }

  return sendDirectExpoPushNotifications({ ...payload, userIds: uniqueUserIds });
}

export const notificationService = {
  async registerForPushNotifications(userId: string): Promise<ServiceResult<string>> {
    if (!Device.isDevice) {
      return { data: null, error: 'Push notifications require a physical device.' };
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Trip updates',
        importance: Notifications.AndroidImportance.MAX,
        sound: NOTIFICATION_SOUND,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#4F7FFF',
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let finalStatus = existing.status;
    if (finalStatus !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      finalStatus = requested.status;
    }

    if (finalStatus !== 'granted') {
      return { data: null, error: 'Push notification permission was not granted.' };
    }

    const projectId = getExpoProjectId();
    if (!projectId) {
      return { data: null, error: 'Notification permission is enabled. Add a real EAS projectId in app.json to register push tokens.' };
    }

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    const { error } = await supabase
      .from('push_tokens')
      .upsert({
        user_id: userId,
        token,
        platform: getPlatformName(),
        device_id: Constants.sessionId ?? null,
        is_active: true,
      }, { onConflict: 'token' });

    if (error) return { data: null, error: error.message };
    return { data: token, error: null };
  },

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

  async deleteAll(userId: string): Promise<ServiceResult<null>> {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('user_id', userId);
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
    const push = await notificationService.sendPushToUsers(
      [input.user_id],
      input.title,
      input.body,
      { ...((input.data as Record<string, unknown> | null) ?? {}), type: input.type }
    );
    const notification = data as Notification;
    broadcastNotification(notification);
    return { data: notification, error: push.error };
  },

  async notifyUsers(
    userIds: string[],
    tripId: string | undefined,
    type: Notification['type'],
    title: string,
    body: string,
    data?: Record<string, unknown>
  ): Promise<ServiceResult<Notification[]>> {
    const uniqueUserIds = Array.from(new Set(userIds));
    if (uniqueUserIds.length === 0) return { data: [], error: null };

    const rows = uniqueUserIds.map((userId) => ({
      user_id: userId,
      trip_id: tripId,
      type,
      title,
      body,
      data: data ?? null,
      is_read: false,
    }));

    const { data: inserted, error } = await supabase
      .from('notifications')
      .insert(rows)
      .select();

    if (error) return { data: null, error: error.message };

    const push = await notificationService.sendPushToUsers(uniqueUserIds, title, body, { ...(data ?? {}), type });
    (inserted ?? []).forEach((n) => broadcastNotification(n as Notification));

    return { data: (inserted ?? []) as Notification[], error: push.error };
  },

  async sendPushToUsers(
    userIds: string[],
    title: string,
    body: string,
    data?: Record<string, unknown>
  ): Promise<ServiceResult<number>> {
    return sendExpoPushNotifications({ userIds, title, body, data });
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
  ): Promise<ServiceResult<number>> {
    // Get all member user IDs for the trip
    const { data: members } = await supabase
      .from('trip_members')
      .select('user_id')
      .eq('trip_id', tripId)
      .neq('user_id', excludeUserId);

    if (!members?.length) return { data: 0, error: null };
    const userIds = members.map((m: { user_id: string }) => m.user_id);

    const rows = userIds.map((userId) => ({
      user_id: userId,
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

    // Include type in push payload so notification tap can route correctly
    const push = await notificationService.sendPushToUsers(userIds, title, body, { ...data, type });

    // Broadcast to each user's personal channel for real-time delivery
    (inserted ?? []).forEach((n: Notification) => broadcastNotification(n));
    return push;
  },

  /** Subscribe to real-time notifications for a user. Returns unsubscribe fn. */
  subscribeToNotifications(
    userId: string,
    onNotification: (n: Notification) => void
  ): () => void {
    const seenIds = new Set<string>();
    const deliver = (n: Notification) => {
      if (seenIds.has(n.id)) return;
      seenIds.add(n.id);
      onNotification(n);
    };
    const channel = supabase
      .channel(NOTIFY_CHANNEL(userId))
      .on('broadcast', { event: 'notification' }, ({ payload }) => {
        deliver(payload as Notification);
      })
      // Fallback for missed/failed broadcasts (e.g. socket reconnects mid-send) —
      // mirrors chatService.subscribeToMessages' dual broadcast + postgres_changes pattern.
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        ({ new: newRecord }) => {
          if (newRecord) deliver(newRecord as Notification);
        }
      )
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
