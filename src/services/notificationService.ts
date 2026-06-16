import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabaseClient';
import { Notification, ServiceResult } from '../types';
import { NOTIFICATION_SOUND } from '../constants/notifications';

const PUSH_INSTALLATION_ID_KEY = 'tripcrew_push_installation_id';

export type PushRegistration = {
  token: string;
  platform: 'ios' | 'android' | 'web' | 'unknown';
  deviceId: string | null;
  activeTokens: number;
};

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

function createInstallationId() {
  const random = Math.random().toString(36).slice(2);
  return `tripcrew-${Date.now().toString(36)}-${random}`;
}

async function getInstallationId() {
  if (Platform.OS === 'web') return null;
  const existing = await AsyncStorage.getItem(PUSH_INSTALLATION_ID_KEY);
  if (existing) return existing;
  const installationId = createInstallationId();
  await AsyncStorage.setItem(PUSH_INSTALLATION_ID_KEY, installationId);
  return installationId;
}

function getPushSendError(tickets: unknown): string | null {
  const ticketList = Array.isArray(tickets)
    ? tickets
    : Array.isArray((tickets as { data?: unknown[] } | null)?.data)
      ? (tickets as { data: unknown[] }).data
      : null;
  const failed = ticketList?.find((ticket) => {
    const pushTicket = ticket as ExpoPushTicket;
    return pushTicket?.status === 'error' && pushTicket.details?.error !== 'DeviceNotRegistered';
  }) as ExpoPushTicket | undefined;
  return failed?.message ?? null;
}

function logPushWarning(context: string, error: string | null | undefined) {
  if (!error) return;
  console.warn(`[notifications] ${context}: ${error}`);
}

async function sendExpoPushNotifications(payload: PushPayload): Promise<ServiceResult<number>> {
  const uniqueUserIds = Array.from(new Set(payload.userIds));
  if (uniqueUserIds.length === 0) return { data: 0, error: null };

  const { data, error } = await supabase.functions.invoke('send-push', {
    body: {
      userIds: uniqueUserIds,
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
    },
  });
  if (error) return { data: null, error: error.message };
  if ((data as { error?: unknown } | null)?.error) {
    return { data: null, error: String((data as { error: unknown }).error) };
  }
  const sent = typeof (data as { sent?: unknown } | null)?.sent === 'number'
    ? (data as { sent: number }).sent
    : uniqueUserIds.length;
  const ticketError = getPushSendError((data as { tickets?: unknown } | null)?.tickets);
  if (ticketError) return { data: null, error: ticketError };
  return { data: sent, error: null };
}

export const notificationService = {
  async registerForPushNotifications(userId: string): Promise<ServiceResult<PushRegistration>> {
    void userId;
    if (Platform.OS === 'web') {
      return { data: null, error: 'Push notifications are only available on iOS and Android builds.' };
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
      const requested = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      finalStatus = requested.status;
    }

    if (finalStatus !== 'granted') {
      return { data: null, error: 'Push notification permission was not granted.' };
    }

    const projectId = getExpoProjectId();
    if (!projectId) {
      return { data: null, error: 'Notification permission is enabled. Add a real EAS projectId in app.json to register push tokens.' };
    }

    let token: string;
    try {
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error
          ? error.message
          : 'Expo could not create a push token for this device.',
      };
    }

    try {
      const deviceId = await getInstallationId();
      const { data, error } = await supabase.functions.invoke('register-push-token', {
        body: {
          token,
          platform: getPlatformName(),
          deviceId,
        },
      });

      if (error) {
        // Try to extract the actual error message from the function response body
        let detail = error.message;
        try {
          const ctx = (error as unknown as { context?: { json?: () => Promise<{ error?: string }> } }).context;
          if (ctx?.json) {
            const body = await ctx.json();
            if (body?.error) detail = body.error;
          }
        } catch { /* ignore – use generic message */ }
        return { data: null, error: detail };
      }
      if ((data as { error?: unknown } | null)?.error) {
        return { data: null, error: String((data as { error: unknown }).error) };
      }
      const registration = data as Partial<PushRegistration> | null;
      return {
        data: {
          token,
          platform: getPlatformName(),
          deviceId,
          activeTokens: typeof registration?.activeTokens === 'number'
            ? registration.activeTokens
            : 1,
        },
        error: null,
      };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error
          ? error.message
          : 'The push token could not be saved.',
      };
    }
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
      {
        ...((input.data as Record<string, unknown> | null) ?? {}),
        ...(input.trip_id ? { trip_id: input.trip_id } : {}),
        type: input.type,
      }
    );
    const notification = data as Notification;
    logPushWarning('single push delivery failed after notification row was created', push.error);
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

    const push = await notificationService.sendPushToUsers(uniqueUserIds, title, body, {
      ...(data ?? {}),
      ...(tripId ? { trip_id: tripId } : {}),
      type,
    });

    logPushWarning('push delivery failed after notification rows were created', push.error);
    return { data: (inserted ?? []) as Notification[], error: null };
  },

  async sendPushToUsers(
    userIds: string[],
    title: string,
    body: string,
    data?: Record<string, unknown>
  ): Promise<ServiceResult<number>> {
    return sendExpoPushNotifications({ userIds, title, body, data });
  },

  async sendJoinRequestPush(
    requestId: string,
    tripId: string,
    title: string,
    body: string
  ): Promise<ServiceResult<number>> {
    const { data, error } = await supabase.functions.invoke('send-push', {
      body: {
        requestId,
        title,
        body,
        data: {
          type: 'join_request',
          trip_id: tripId,
          request_id: requestId,
        },
      },
    });
    if (error) return { data: null, error: error.message };
    if ((data as { error?: unknown } | null)?.error) {
      return { data: null, error: String((data as { error: unknown }).error) };
    }
    return {
      data: typeof (data as { sent?: unknown } | null)?.sent === 'number'
        ? (data as { sent: number }).sent
        : 0,
      error: null,
    };
  },

  async sendJoinReviewPush(
    requestId: string,
    tripId: string,
    status: 'approved' | 'rejected'
  ): Promise<ServiceResult<number>> {
    const approved = status === 'approved';
    const { data, error } = await supabase.functions.invoke('send-push', {
      body: {
        requestId,
        title: approved ? '✅ Join Request Approved' : 'Join Request Update',
        body: approved
          ? 'Your request to join the trip was approved.'
          : 'Your request to join the trip was not approved.',
        data: {
          type: 'join_request_review',
          trip_id: tripId,
          request_id: requestId,
          status,
        },
      },
    });
    if (error) return { data: null, error: error.message };
    if ((data as { error?: unknown } | null)?.error) {
      return { data: null, error: String((data as { error: unknown }).error) };
    }
    return {
      data: typeof (data as { sent?: unknown } | null)?.sent === 'number'
        ? (data as { sent: number }).sent
        : 0,
      error: null,
    };
  },

  /**
   * Creates a notification for every trip member except the sender.
   * Delivery is handled by RLS-protected Postgres realtime and push.
   */
  async notifyTripMembers(
    tripId: string,
    excludeUserId: string,
    type: Notification['type'],
    title: string,
    body: string,
    data?: Record<string, unknown>
  ): Promise<ServiceResult<number>> {
    // Use SECURITY DEFINER RPC so the insert bypasses RLS (same pattern as push-talk).
    const { data: count, error: rpcError } = await supabase.rpc('create_trip_notifications', {
      p_trip_id: tripId,
      p_sender_id: excludeUserId,
      p_type: type,
      p_title: title,
      p_body: body,
      p_data: data ?? null,
    });

    if (rpcError) return { data: null, error: rpcError.message };
    if (!count) return { data: 0, error: null };

    // Get recipients so we can send push (RPC already handled the DB insert)
    const { data: members } = await supabase
      .from('trip_members')
      .select('user_id')
      .eq('trip_id', tripId)
      .neq('user_id', excludeUserId);

    const userIds = (members ?? []).map((m: { user_id: string }) => m.user_id);
    if (userIds.length > 0) {
      const push = await notificationService.sendPushToUsers(userIds, title, body, { ...data, trip_id: tripId, type });
      logPushWarning('trip-member push delivery failed after notification rows were created', push.error);
    }

    return { data: count as number, error: null };
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
      .channel(`user-notifications-db:${userId}`)
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
