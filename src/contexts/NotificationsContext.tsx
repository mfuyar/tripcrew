import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Notification, ServiceResult } from '../types';
import { notificationService } from '../services/notificationService';
import { getActiveChatTrip } from '../services/chatService';
import { useAuth } from './AuthContext';
import { NOTIFICATION_SOUND } from '../constants/notifications';

const LOCAL_NOTIFICATION_SOURCE = 'tripcrew-local-realtime';

function isMessageScreenNotification(type?: unknown): boolean {
  return (
    (type === 'message' || type === 'push_talk') &&
    getActiveChatTrip() !== null
  );
}

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const type = notification.request.content.data?.type;
    const suppressMessageBanner = isMessageScreenNotification(type);
    return {
      shouldShowBanner: !suppressMessageBanner,
      shouldShowList: !suppressMessageBanner,
      shouldPlaySound: !suppressMessageBanner,
      shouldSetBadge: true,
    };
  },
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
  const status = useAudioPlayerStatus(player);
  const playRequestedRef = useRef(true);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);

  function clearRetry() {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    retryCountRef.current = 0;
  }

  function tryPlay() {
    if (!playRequestedRef.current || status.playing) return;
    try {
      player.seekTo(0);
      player.play();
    } catch {
      // Retry while the native player finishes loading.
    }

    if (retryCountRef.current >= 12) return;
    retryCountRef.current += 1;
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = setTimeout(tryPlay, 250);
  }

  useEffect(() => {
    let canceled = false;
    async function play() {
      try {
        // Import setAudioModeAsync lazily to avoid circular deps
        const { setAudioModeAsync } = await import('expo-audio');
        await setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: true,
          shouldPlayInBackground: true,
          interruptionMode: 'doNotMix',
        });
        if (!canceled) {
          player.setActiveForLockScreen(true, { title: 'Push Talk', artist: 'TripCrew' });
          tryPlay();
        }
      } catch {
        onDone();
      }
    }
    play();
    return () => {
      canceled = true;
      clearRetry();
    };
  }, []);

  useEffect(() => {
    if (!playRequestedRef.current || status.playing || !status.isLoaded) return;
    tryPlay();
  }, [status.isLoaded, status.playing]);

  useEffect(() => {
    if (status.playing) {
      playRequestedRef.current = false;
      clearRetry();
    }
    if (status.didJustFinish) {
      clearRetry();
      player.setActiveForLockScreen(false);
      onDone();
    }
  }, [status.playing, status.didJustFinish]);

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
            type: notification.type,
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

    // Prompt for both push notification and location access right after
    // login, so messages, announcements, settlements, etc. and live
    // location sharing work without the user having to find the toggles
    // in Profile first. Re-running this on an already-decided permission
    // is a no-op — the OS won't re-prompt.
    enablePushNotifications();
    void Location.requestForegroundPermissionsAsync();

    // Subscribe to real-time notification broadcasts
    const unsub = notificationService.subscribeToNotifications(user.id, (n: Notification) => {
      setUnreadCount((c) => c + 1);
      // Background push-talk: auto-play only for recipients who opted in to Live Audio
      const notifData = n.data as Record<string, any> | null;
      if (!isMessageScreenNotification(n.type)) {
        void showLocalNotification(n);
      }
      if (
        n.type === 'push_talk' &&
        notifData?.auto_play === true &&
        notifData?.media_url &&
        getActiveChatTrip() !== notifData?.trip_id
      ) {
        setBgPushTalkUrl(notifData.media_url as string);
      }
    });
    const receivedSub = Notifications.addNotificationReceivedListener((event) => {
      if (event.request.content.data?.source === LOCAL_NOTIFICATION_SOURCE) return;
      const data = event.request.content.data as Record<string, any>;
      if (isMessageScreenNotification(data?.type)) return;
      setUnreadCount((c) => c + 1);
      // Play push-talk audio from OS push notification when app is backgrounded —
      // only for recipients who opted in to Live Audio (embedded per-recipient by the sender).
      if (
        data?.type === 'push_talk' &&
        data?.auto_play === true &&
        data?.media_url &&
        getActiveChatTrip() !== data?.trip_id
      ) {
        setBgPushTalkUrl(data.media_url as string);
      }
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
