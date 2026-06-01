import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Notification } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { notificationService } from '../../services/notificationService';
import { LoadingView } from '../../components/LoadingView';
import { EmptyState } from '../../components/EmptyState';
import { AppButton } from '../../components/AppButton';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../constants/theme';

const TYPE_ICONS: Record<string, string> = {
  expense_added: '💰', settlement_request: '💸', payment_confirmed: '✅',
  message: '💬', announcement: '📢', poll: '🗳️', push_talk: '🎙️', other: '🔔',
};

export function NotificationCenterScreen() {
  const { user, isDemoMode } = useAuth();
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

  async function handleMarkRead(id: string) {
    await notificationService.markRead(id);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
  }

  async function handleMarkAllRead() {
    if (!user) return;
    await notificationService.markAllRead(user.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  if (loading) return <LoadingView />;

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <View style={styles.container}>
      {unreadCount > 0 && (
        <View style={styles.header}>
          <Text style={styles.headerText}>{unreadCount} unread</Text>
          <TouchableOpacity onPress={handleMarkAllRead}>
            <Text style={styles.markAll}>Mark all read</Text>
          </TouchableOpacity>
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
            onPress={() => handleMarkRead(item.id)}
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
  markAll: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.semiBold },
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
