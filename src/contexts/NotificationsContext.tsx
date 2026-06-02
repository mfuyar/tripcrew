import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Notification } from '../types';
import { notificationService } from '../services/notificationService';
import { useAuth } from './AuthContext';

interface NotificationsContextValue {
  unreadCount: number;
  refreshUnread: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue>({
  unreadCount: 0,
  refreshUnread: async () => {},
});

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user, isDemoMode } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnread = useCallback(async () => {
    if (!user || isDemoMode) return;
    const { data } = await notificationService.getUnreadCount(user.id);
    setUnreadCount(data ?? 0);
  }, [user, isDemoMode]);

  useEffect(() => {
    if (!user || isDemoMode) return;
    refreshUnread();

    // Subscribe to real-time notification broadcasts
    const unsub = notificationService.subscribeToNotifications(user.id, (_n: Notification) => {
      setUnreadCount((c) => c + 1);
    });
    return unsub;
  }, [user?.id, isDemoMode]);

  return (
    <NotificationsContext.Provider value={{ unreadCount, refreshUnread }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationsContext);
}
