import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput,
  RefreshControl, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Announcement, AnnouncementPriority } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useTripContext } from '../../contexts/TripContext';
import { announcementService } from '../../services/announcementService';
import { displayName } from '../../utils/displayName';
import { demoAnnouncements } from '../../lib/mockData';
import { LoadingView } from '../../components/LoadingView';
import { EmptyState } from '../../components/EmptyState';
import { AppButton } from '../../components/AppButton';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../constants/theme';

const PRIORITY_ICONS: Record<AnnouncementPriority, string> = { low: '🟢', normal: '🔵', high: '🟠', urgent: '🔴' };
const PRIORITY_COLORS: Record<AnnouncementPriority, string> = {
  low: Colors.success, normal: Colors.primary, high: Colors.warning, urgent: Colors.danger,
};

export function AnnouncementsScreen({ route }: { route: { params: { tripId: string } } }) {
  const { tripId } = route.params;
  const { user, isDemoMode, isGlobalAdmin } = useAuth();
  const { canManageAnnouncements, members } = useTripContext();
  const canManage = canManageAnnouncements || isGlobalAdmin;
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState<AnnouncementPriority>('normal');
  const [saving, setSaving] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [archived, setArchived] = useState<Announcement[]>([]);
  const [loadingArchived, setLoadingArchived] = useState(false);

  const load = useCallback(async () => {
    if (isDemoMode) { setAnnouncements(demoAnnouncements as Announcement[]); setLoading(false); setRefreshing(false); return; }
    const { data, error } = await announcementService.getAll(tripId);
    if (error) Alert.alert('Unable to load announcements', error);
    setAnnouncements(data ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [tripId, isDemoMode]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleCreate() {
    if (!title.trim() || !content.trim() || !user) return;
    setSaving(true);
    const { data, error } = await announcementService.create(tripId, user.id, { title: title.trim(), content: content.trim(), priority });
    setSaving(false);
    if (error || !data) {
      Alert.alert('Unable to post announcement', error ?? 'Please try again.');
      return;
    }
    setTitle('');
    setContent('');
    setShowAdd(false);
    setAnnouncements((prev) => [data, ...prev]);
  }

  async function handleMarkRead(id: string) {
    if (!user) return;
    const { error } = await announcementService.markRead(id, user.id);
    if (error) {
      Alert.alert('Unable to mark read', error);
      return;
    }
    setAnnouncements((prev) => prev.map((item) => {
      if (item.id !== id) return item;
      const reads = item.reads ?? [];
      if (reads.some((read) => read.user_id === user.id)) return item;
      return {
        ...item,
        reads: [
          ...reads,
          {
            id: `local-${id}-${user.id}`,
            announcement_id: id,
            user_id: user.id,
            read_at: new Date().toISOString(),
          },
        ],
      };
    }));
  }

  async function loadArchived() {
    if (isDemoMode) return;
    setLoadingArchived(true);
    const { data } = await announcementService.getArchived(tripId);
    setArchived(data ?? []);
    setLoadingArchived(false);
  }

  async function handleUnarchive(id: string) {
    const { error } = await announcementService.unarchive(id);
    if (error) { Alert.alert('Error', error); return; }
    setArchived((prev) => prev.filter((a) => a.id !== id));
    load(); // refresh active list
  }

  if (loading) return <LoadingView />;

  return (
    <View style={styles.container}>
      <FlatList
        data={announcements}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />
        }
        ListHeaderComponent={(
          <>
            {canManage && (
              <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
                <Text style={styles.addBtnText}>📢 Post Announcement</Text>
              </TouchableOpacity>
            )}
            {canManage && (
              <TouchableOpacity
                style={styles.archivedToggle}
                onPress={() => {
                  if (!showArchived) loadArchived();
                  setShowArchived((v) => !v);
                }}
              >
                <Text style={styles.archivedToggleText}>
                  {showArchived ? '▲ Hide archived' : '▾ Show archived'}
                </Text>
              </TouchableOpacity>
            )}
            {showArchived && canManage && (
              <View style={styles.archivedSection}>
                <Text style={styles.archivedTitle}>📦 Archived Announcements</Text>
                {loadingArchived ? (
                  <Text style={styles.archivedEmpty}>Loading...</Text>
                ) : archived.length === 0 ? (
                  <Text style={styles.archivedEmpty}>No archived announcements.</Text>
                ) : archived.map((item) => (
                  <View key={item.id} style={styles.archivedCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.archivedCardTitle}>{item.title}</Text>
                      <Text style={styles.archivedCardContent} numberOfLines={2}>{item.content}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.unarchiveBtn}
                      onPress={() => Alert.alert('Unarchive', `Restore "${item.title}"?`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Restore', onPress: () => handleUnarchive(item.id) },
                      ])}
                    >
                      <Text style={styles.unarchiveBtnText}>Restore</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
        ListEmptyComponent={
          <EmptyState icon="📢" title="No announcements" subtitle="Organizers can post trip-wide announcements here." />
        }
        renderItem={({ item }) => {
          const isRead = item.reads?.some((r) => r.user_id === user?.id);
          return (
            <TouchableOpacity
              style={[styles.card, !isRead && styles.cardUnread]}
              onPress={() => handleMarkRead(item.id)}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.priorityIcon}>{PRIORITY_ICONS[item.priority as AnnouncementPriority]}</Text>
                <Text style={[styles.cardTitle, { color: PRIORITY_COLORS[item.priority as AnnouncementPriority] }]}>
                  {item.title}
                </Text>
                {!isRead && <View style={styles.unreadDot} />}
                {canManage && (
                  <TouchableOpacity
                    hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                    onPress={() =>
                      Alert.alert('Delete Announcement', 'Permanently delete this announcement?', [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Delete',
                          style: 'destructive',
                          onPress: async () => {
                            const { error } = await announcementService.delete(item.id);
                            if (error) {
                              Alert.alert('Delete failed', error);
                              return;
                            }
                            setAnnouncements((prev) => prev.filter((ann) => ann.id !== item.id));
                          },
                        },
                      ])
                    }
                  >
                    <Text style={styles.deleteIcon}>🗑</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={styles.cardContent}>{item.content}</Text>
              <Text style={styles.cardMeta}>
                By {displayName(
                  item.creator?.full_name,
                  members.find(m => m.user_id === item.created_by)?.family?.name
                )} •{' '}
                {new Date(item.created_at).toLocaleDateString()}
              </Text>
            </TouchableOpacity>
          );
        }}
      />

      <Modal visible={showAdd} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={24}>
            <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Post Announcement</Text>
            <View style={styles.priorityRow}>
              {(['low', 'normal', 'high', 'urgent'] as AnnouncementPriority[]).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.priorityChip, priority === p && { borderColor: PRIORITY_COLORS[p], backgroundColor: PRIORITY_COLORS[p] + '20' }]}
                  onPress={() => setPriority(p)}
                >
                  <View style={[styles.priorityDot, { backgroundColor: PRIORITY_COLORS[p] }]} />
                  <Text
                    style={styles.priorityLabel}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                  >
                    {p}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.modalInput} value={title} onChangeText={setTitle} placeholder="Title" placeholderTextColor={Colors.textSecondary} />
            <TextInput style={[styles.modalInput, { minHeight: 80, textAlignVertical: 'top' }]} value={content} onChangeText={setContent} placeholder="Write your announcement..." placeholderTextColor={Colors.textSecondary} multiline />
            <AppButton title="Post" onPress={handleCreate} loading={saving} fullWidth />
            <AppButton title="Cancel" onPress={() => setShowAdd(false)} variant="outline" fullWidth style={{ marginTop: Spacing.sm }} />
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, flexGrow: 1 },
  addBtn: { backgroundColor: Colors.primary, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', marginBottom: Spacing.md },
  addBtnText: { color: Colors.surface, fontWeight: FontWeight.semiBold, fontSize: FontSize.md },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.md, ...Shadow.sm },
  cardUnread: { borderLeftWidth: 4, borderLeftColor: Colors.primary },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  priorityIcon: { fontSize: 16 },
  cardTitle: { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary },
  cardContent: { fontSize: FontSize.sm, color: Colors.text, lineHeight: 20, marginBottom: Spacing.sm },
  cardMeta: { fontSize: FontSize.xs, color: Colors.textSecondary },
  deleteIcon: { fontSize: 16, marginLeft: Spacing.xs },
  archivedToggle: { alignItems: 'center', paddingVertical: Spacing.sm, marginBottom: Spacing.sm },
  archivedToggleText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.semiBold },
  archivedSection: { marginBottom: Spacing.md },
  archivedTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold, color: Colors.textSecondary, marginBottom: Spacing.sm },
  archivedEmpty: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', padding: Spacing.md },
  archivedCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.border + '40',
    borderRadius: Radius.md, padding: Spacing.sm,
    marginBottom: Spacing.sm, gap: Spacing.sm,
  },
  archivedCardTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold, color: Colors.textSecondary },
  archivedCardContent: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  unarchiveBtn: {
    borderWidth: 1, borderColor: Colors.primary, borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
  },
  unarchiveBtnText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semiBold },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.xl },
  modalTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.text, marginBottom: Spacing.md },
  priorityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  priorityChip: {
    width: '48%',
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  priorityDot: { width: 14, height: 14, borderRadius: 7, flexShrink: 0 },
  priorityLabel: { flexShrink: 1, fontSize: FontSize.md, fontWeight: FontWeight.semiBold, color: Colors.text },
  modalInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing.md, fontSize: FontSize.md, color: Colors.text, marginBottom: Spacing.md },
});
