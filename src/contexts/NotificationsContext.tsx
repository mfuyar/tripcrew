import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { useAudioPlayer } from 'expo-audio';
import { Notification, ServiceResult } from '../types';
import { notificationService } from '../services/notificationService';
import { getActiveChatTrip } from '../services/chatService';
import { useAuth } from './AuthContext';
import { NOTIFICATION_SOUND } from '../constants/notifications';

const LOCAL_NOTIFICATION_SOURCE = 'tripcrew-local-realtime';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

interface NotificationsContextValue {
  unreadCount: number;
  refreshUnread: () => Promise<void>;
  enablePushNotifications: () => Promise<ServiceResult<string>>;
  pushTokenError: string | null;
  notificationsEnabled: boolean;
}

const NotificationsContext = createContext<NotificationsContextValue>({
  unreadCount: 0,
  refreshUnread: async () => {},
  enablePushNotifications: async () => ({ data: null, error: 'Notifications are not ready yet.' }),
  pushTokenError: null,
  notificationsEnabled: false,
});

function BackgroundPushTalkPlayer({ url, onDone }: { url: string; onDone: () => void }) {
  const player = useAudioPlayer(url, { updateInterval: 250 });

  useEffect(() => {
    let canceled = false;
    async function play() {
      try {
        // Import setAudioModeAsync lazily to avoid circular deps
        const { setAudioModeAsync } = await import('expo-audio');
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        if (!canceled) player.play();
      } catch {
        onDone();
      }
    }
    play();
    return () => { canceled = true; };
  }, []);

  useEffect(() => {
    if (player.currentStatus?.didJustFinish ?? false) onDone();
  });

  return null;
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user, isDemoMode } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [pushTokenError, setPushTokenError] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [bgPushTalkUrl, setBgPushTalkUrl] = useState<string | null>(null);

  // Check current permission status on mount and after enabling
  const checkPermission = useCallback(async () => {
    const { status } = await Notifications.getPermissionsAsync();
    setNotificationsEnabled(status === 'granted');
  }, []);

  const refreshUnread = useCallback(async () => {
    if (!user || isDemoMode) return;
    const { data } = await notificationService.getUnreadCount(user.id);
    setUnreadCount(data ?? 0);
  }, [user, isDemoMode]);

  const enablePushNotifications = useCallback(async (): Promise<ServiceResult<string>> => {
    if (!user || isDemoMode) {
      const result = { data: null, error: 'Sign in to enable notifications.' };
      setPushTokenError(result.error);
      return result;
    }

    const result = await notificationService.registerForPushNotifications(user.id);
    // Don't surface the "add EAS projectId" dev-config note as a user error
    const isDevConfigNote = result.error?.includes('EAS projectId');
    setPushTokenError(isDevConfigNote ? null : result.error);
    await checkPermission();
    return result;
  }, [user, isDemoMode, checkPermission]);

  const showLocalNotification = useCallback(async (notification: Notification) => {
    try {
      const permissions = await Notifications.getPermissionsAsync();
      if (permissions.status !== 'granted') return;

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Trip updates',
          importance: Notifications.AndroidImportance.MAX,
          sound: NOTIFICATION_SOUND,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#4F7FFF',
        });
      }

      await Notifications.scheduleNotificationAsync({
        content: {
          title: notification.title,
          body: notification.body,
          data: {
            ...((notification.data as Record<string, unknown> | null) ?? {}),
            notification_id: notification.id,
            source: LOCAL_NOTIFICATION_SOURCE,
          },
          sound: NOTIFICATION_SOUND,
          interruptionLevel: 'active',
        },
        trigger: Platform.OS === 'android' ? { channelId: 'default' } : null,
      });
    } catch {
      // In-app notification rows still show in Notification Center.
    }
  }, []);

  useEffect(() => {
    checkPermission();
  }, [checkPermission]);

  useEffect(() => {
    if (!user || isDemoMode) return;
    refreshUnread();

    enablePushNotifications();

    // Subscribe to real-time notification broadcasts
    const unsub = notificationService.subscribeToNotifications(user.id, (n: Notification) => {
      setUnreadCount((c) => c + 1);
      void showLocalNotification(n);
      // Background push-talk: play audio when user is NOT on the chat screen
      if (
        n.type === 'push_talk' &&
        (n.data as any)?.media_url &&
        getActiveChatTrip() !== (n.data as any)?.trip_id
      ) {
        setBgPushTalkUrl((n.data as any).media_url as string);
      }
    });
    const receivedSub = Notifications.addNotificationReceivedListener((event) => {
      if (event.request.content.data?.source === LOCAL_NOTIFICATION_SOURCE) return;
      setUnreadCount((c) => c + 1);
    });
    return () => {
      unsub();
      receivedSub.remove();
    };
  }, [user?.id, isDemoMode, enablePushNotifications, refreshUnread, showLocalNotification]);

  return (
    <NotificationsContext.Provider value={{ unreadCount, refreshUnread, enablePushNotifications, pushTokenError, notificationsEnabled }}>
      {children}
      {bgPushTalkUrl && (
        <BackgroundPushTalkPlayer
          url={bgPushTalkUrl}
          onDone={() => setBgPushTalkUrl(null)}
        />
      )}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationsContext);
}
