import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Notification, MainStackParamList } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationsContext';
import { notificationService } from '../../services/notificationService';
import { LoadingView } from '../../components/LoadingView';
import { EmptyState } from '../../components/EmptyState';
import { AppButton } from '../../components/AppButton';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../constants/theme';

type Nav = NativeStackNavigationProp<MainStackParamList>;

function navigateForNotification(navigation: Nav, n: Notification) {
  const tripId = n.trip_id;
  if (!tripId) return;

  if (n.type === 'message' || n.type === 'push_talk') {
    (navigation as any).navigate('TripStack', { tripId, screen: 'Chat' });
    return;
  }

  // Join request notifications carry request_id in data — go straight to TripSettings
  if (n.data?.request_id) {
    navigation.navigate('TripSettings' as any, { tripId });
    return;
  }

  if (n.data?.settlement_id) {
    navigation.navigate('PaymentTracking' as any, { tripId });
    return;
  }

  const SCREEN_MAP: Partial<Record<Notification['type'], keyof MainStackParamList>> = {
    expense_added: 'Settlements',
    settlement_request: 'Settlements',
    payment_confirmed: 'PaymentTracking',
    announcement: 'Announcements',
    poll: 'Polls',
  };

  const screen = SCREEN_MAP[n.type];
  if (screen) {
    navigation.navigate(screen as any, { tripId });
  } else {
    (navigation as any).navigate('TripStack', { tripId, screen: 'Dashboard' });
  }
}

const TYPE_ICONS: Record<string, string> = {
  expense_added: '💰', settlement_request: '💸', payment_confirmed: '✅',
  message: '💬', announcement: '📢', poll: '🗳️', push_talk: '🎙️', other: '🔔',
};

export function NotificationCenterScreen() {
  const navigation = useNavigation<Nav>();
  const { user, isDemoMode } = useAuth();
  const { refreshUnread } = useNotifications();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user || isDemoMode) { setNotifications([]); setLoading(false); setRefreshing(false); return; }
    const { data } = await notificationService.getNotifications(user.id);
    setNotifications(data ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [user, isDemoMode]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleTap(n: Notification) {
    if (!n.is_read) {
      await notificationService.markRead(n.id);
      setNotifications((prev) => prev.map((item) => item.id === n.id ? { ...item, is_read: true } : item));
      refreshUnread();
    }
    navigateForNotification(navigation, n);
  }

  async function handleMarkAllRead() {
    if (!user) return;
    await notificationService.markAllRead(user.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    refreshUnread();
  }

  async function handleDeleteAll() {
    if (!user) return;
    const { error } = await notificationService.deleteAll(user.id);
    if (error) {
      Alert.alert('Error', error);
      return;
    }
    setNotifications([]);
    refreshUnread();
  }

  if (loading) return <LoadingView />;

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <View style={styles.container}>
      {notifications.length > 0 && (
        <View style={styles.header}>
          <Text style={styles.headerText}>{unreadCount > 0 ? `${unreadCount} unread` : 'All read'}</Text>
          <View style={styles.headerActions}>
            {unreadCount > 0 && (
              <TouchableOpacity onPress={handleMarkAllRead}>
                <Text style={styles.markAll}>Mark all read</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={handleDeleteAll}>
              <Text style={styles.deleteAll}>Delete all</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />
        }
        ListEmptyComponent={
          <EmptyState icon="🔔" title="No notifications" subtitle="You're all caught up!" />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.card, !item.is_read && styles.cardUnread]}
            onPress={() => handleTap(item)}
          >
            <Text style={styles.typeIcon}>{TYPE_ICONS[item.type] ?? '🔔'}</Text>
            <View style={styles.info}>
              <Text style={[styles.title, !item.is_read && styles.titleUnread]}>{item.title}</Text>
              <Text style={styles.body} numberOfLines={2}>{item.body}</Text>
              <Text style={styles.time}>
                {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
            {!item.is_read && <View style={styles.unreadDot} />}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.md, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  markAll: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.semiBold },
  deleteAll: { fontSize: FontSize.sm, color: Colors.danger, fontWeight: FontWeight.semiBold },
  content: { padding: Spacing.md, flexGrow: 1 },
  card: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm, gap: Spacing.md, ...Shadow.sm },
  cardUnread: { borderLeftWidth: 4, borderLeftColor: Colors.primary },
  typeIcon: { fontSize: 24, marginTop: 2 },
  info: { flex: 1 },
  title: { fontSize: FontSize.md, fontWeight: FontWeight.medium, color: Colors.text, marginBottom: 2 },
  titleUnread: { fontWeight: FontWeight.bold },
  body: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 18 },
  time: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 4 },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary, marginTop: 4 },
});
