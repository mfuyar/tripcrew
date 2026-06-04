import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabaseClient';
import { sendBroadcast } from '../lib/realtimeBroadcast';
import { Notification, ServiceResult } from '../types';
import { NOTIFICATION_SOUND } from '../constants/notifications';

const NOTIFY_CHANNEL = (userId: string) => `user-notifications:${userId}`;
const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

type PushPayload = {
  userIds: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
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

async function sendExpoPushNotifications({ userIds, title, body, data }: PushPayload): Promise<void> {
  if (userIds.length === 0) return;

  try {
    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('token')
      .in('user_id', userIds)
      .eq('is_active', true);

    const uniqueTokens = Array.from(new Set((tokens ?? []).map((row: { token: string }) => row.token)));
    if (uniqueTokens.length === 0) return;

    const messages = uniqueTokens.map((to) => ({
      to,
      title,
      body,
      data: data ?? {},
      sound: NOTIFICATION_SOUND,
      channelId: 'default',
    }));

    await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
  } catch {
    // In-app notification rows and realtime broadcasts remain the source of truth.
  }
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

  async createNotification(
    input: Omit<Notification, 'id' | 'created_at'>
  ): Promise<ServiceResult<Notification>> {
    const { data, error } = await supabase
      .from('notifications')
      .insert(input)
      .select()
      .single();
    if (error) return { data: null, error: error.message };
    await notificationService.sendPushToUsers([input.user_id], input.title, input.body, input.data);
    const notification = data as Notification;
    broadcastNotification(notification);
    return { data: notification, error: null };
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

    await notificationService.sendPushToUsers(uniqueUserIds, title, body, data);
    (inserted ?? []).forEach((n) => broadcastNotification(n as Notification));

    return { data: (inserted ?? []) as Notification[], error: null };
  },

  async sendPushToUsers(
    userIds: string[],
    title: string,
    body: string,
    data?: Record<string, unknown>
  ): Promise<void> {
    await sendExpoPushNotifications({ userIds, title, body, data });
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
    await notificationService.sendPushToUsers(userIds, title, body, { ...data, type });

    // Broadcast to each user's personal channel for real-time delivery
    (inserted ?? []).forEach((n: Notification) => broadcastNotification(n));
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
