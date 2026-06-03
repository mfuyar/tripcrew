import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { Notification, ServiceResult } from '../types';
import { notificationService } from '../services/notificationService';
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

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user, isDemoMode } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [pushTokenError, setPushTokenError] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

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
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationsContext);
}
