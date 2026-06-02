import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput,
  RefreshControl, Alert,
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
  const { user, isDemoMode } = useAuth();
  const { isTripOrganizer, members } = useTripContext();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState<AnnouncementPriority>('normal');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (isDemoMode) { setAnnouncements(demoAnnouncements as Announcement[]); setLoading(false); setRefreshing(false); return; }
    const { data } = await announcementService.getAll(tripId);
    setAnnouncements(data ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [tripId, isDemoMode]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleCreate() {
    if (!title.trim() || !content.trim() || !user) return;
    setSaving(true);
    await announcementService.create(tripId, user.id, { title: title.trim(), content: content.trim(), priority });
    setSaving(false);
    setTitle('');
    setContent('');
    setShowAdd(false);
    load();
  }

  async function handleMarkRead(id: string) {
    if (!user) return;
    await announcementService.markRead(id, user.id);
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
        ListHeaderComponent={isTripOrganizer ? (
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
            <Text style={styles.addBtnText}>📢 Post Announcement</Text>
          </TouchableOpacity>
        ) : null}
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
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Post Announcement</Text>
            <View style={styles.priorityRow}>
              {(['low', 'normal', 'high', 'urgent'] as AnnouncementPriority[]).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.priorityChip, priority === p && { borderColor: PRIORITY_COLORS[p], backgroundColor: PRIORITY_COLORS[p] + '20' }]}
                  onPress={() => setPriority(p)}
                >
                  <Text>{PRIORITY_ICONS[p]} {p}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.modalInput} value={title} onChangeText={setTitle} placeholder="Title" placeholderTextColor={Colors.textSecondary} />
            <TextInput style={[styles.modalInput, { minHeight: 80, textAlignVertical: 'top' }]} value={content} onChangeText={setContent} placeholder="Write your announcement..." placeholderTextColor={Colors.textSecondary} multiline />
            <AppButton title="Post" onPress={handleCreate} loading={saving} fullWidth />
            <AppButton title="Cancel" onPress={() => setShowAdd(false)} variant="outline" fullWidth style={{ marginTop: Spacing.sm }} />
          </View>
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.xl },
  modalTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.text, marginBottom: Spacing.md },
  priorityRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  priorityChip: { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border },
  modalInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing.md, fontSize: FontSize.md, color: Colors.text, marginBottom: Spacing.md },
});
