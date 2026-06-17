import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useNotifications } from '../contexts/NotificationsContext';
import { Colors, FontWeight } from '../constants/theme';

/**
 * Bell icon with an unread-count badge, meant for use as a header `headerRight`.
 * Navigates to the Notifications screen from anywhere in the app.
 */
export function NotificationBellButton() {
  const navigation = useNavigation<any>();
  const { unreadCount } = useNotifications();
  const navigatingRef = React.useRef(false);

  function openNotifications() {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    setTimeout(() => { navigatingRef.current = false; }, 800);

    try {
      const parent = navigation.getParent?.();
      if (parent?.getState?.()?.routeNames?.includes('Notifications')) {
        parent.navigate('Notifications');
        return;
      }
      if (navigation.getState?.()?.routeNames?.includes('Notifications')) {
        navigation.navigate('Notifications');
        return;
      }
      const grandparent = parent?.getParent?.();
      if (grandparent?.getState?.()?.routeNames?.includes('Notifications')) {
        grandparent.navigate('Notifications');
      }
    } catch {
      // Navigation may fail during a transition — silently ignore.
    }
  }

  return (
    <TouchableOpacity
      style={styles.button}
      onPress={openNotifications}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
    >
      <Text style={styles.icon}>🔔</Text>
      {unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  icon: { fontSize: 20, lineHeight: 24 },
  badge: {
    position: 'absolute',
    top: 0,
    right: 1,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: Colors.surface,
    fontSize: 10,
    fontWeight: FontWeight.bold,
    lineHeight: 12,
  },
});
