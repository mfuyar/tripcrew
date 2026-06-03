import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, Modal, TextInput, RefreshControl,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { EmergencyInfo } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useTripContext } from '../../contexts/TripContext';
import { emergencyService } from '../../services/emergencyService';
import { LoadingView } from '../../components/LoadingView';
import { EmptyState } from '../../components/EmptyState';
import { AppButton } from '../../components/AppButton';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../constants/theme';

const TYPES = ['medical', 'contact', 'insurance', 'document', 'other'] as const;
const TYPE_ICONS: Record<string, string> = { medical: '🏥', contact: '📞', insurance: '🛡️', document: '📋', other: '📌' };

export function EmergencyInfoScreen({ route }: { route: { params: { tripId: string } } }) {
  const { tripId } = route.params;
  const { user, isDemoMode } = useAuth();
  const { userFamily, canManageTrip } = useTripContext();
  const [info, setInfo] = useState<EmergencyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newType, setNewType] = useState<typeof TYPES[number]>('contact');
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<EmergencyInfo | null>(null);

  const load = useCallback(async () => {
    if (isDemoMode) { setInfo([]); setLoading(false); setRefreshing(false); return; }
    const { data } = await emergencyService.getInfo(tripId);
    setInfo(data ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [tripId, isDemoMode]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function openAdd() {
    setEditing(null);
    setNewType('contact');
    setNewTitle('');
    setNewContent('');
    setShowAdd(true);
  }

  function openEdit(entry: EmergencyInfo) {
    setEditing(entry);
    setNewType(entry.type as typeof TYPES[number]);
    setNewTitle(entry.title);
    setNewContent(entry.content);
    setShowAdd(true);
  }

  function closeEditor() {
    setShowAdd(false);
    setEditing(null);
    setNewType('contact');
    setNewTitle('');
    setNewContent('');
  }

  async function handleSaveInfo() {
    if (!newTitle.trim() || !newContent.trim() || !user) return;
    setSaving(true);
    if (editing) {
      await emergencyService.updateInfo(editing.id, {
        type: newType,
        title: newTitle.trim(),
        content: newContent.trim(),
        is_shared: true,
      });
    } else {
      await emergencyService.addInfo(tripId, user.id, {
        type: newType, title: newTitle.trim(), content: newContent.trim(),
        is_shared: true, family_id: userFamily?.id ?? undefined,
      });
    }
    setSaving(false);
    closeEditor();
    load();
  }

  async function handleDelete(id: string) {
    Alert.alert('Delete', 'Remove this emergency info?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await emergencyService.deleteInfo(id); load(); } },
    ]);
  }

  if (loading) return <LoadingView />;

  // Group by type
  const grouped = TYPES.reduce((acc, t) => {
    acc[t] = info.filter((i) => i.type === t);
    return acc;
  }, {} as Record<string, EmergencyInfo[]>);

  return (
    <View style={styles.container}>
      <FlatList
        data={TYPES.filter((t) => grouped[t].length > 0)}
        keyExtractor={(t) => t}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />
        }
        ListHeaderComponent={
          <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
            <Text style={styles.addBtnText}>+ Add Info</Text>
          </TouchableOpacity>
        }
        ListEmptyComponent={
          <EmptyState icon="🚨" title="No emergency info" subtitle="Add medical, contact, and insurance info for your group." actionLabel="Add Info" onAction={openAdd} />
        }
        renderItem={({ item: type }) => (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{TYPE_ICONS[type]} {type.charAt(0).toUpperCase() + type.slice(1)}</Text>
            {grouped[type].map((entry) => {
              const canManageEntry = canManageTrip || entry.added_by === user?.id;
              return (
                <TouchableOpacity
                  key={entry.id}
                  style={styles.card}
                  onPress={() => canManageEntry && openEdit(entry)}
                  onLongPress={() => canManageEntry && handleDelete(entry.id)}
                >
                  <Text style={styles.entryTitle}>{entry.title}</Text>
                  <Text style={styles.entryContent}>{entry.content}</Text>
                  {entry.family && <Text style={styles.entryFamily}>👨‍👩‍👧 {entry.family.name}</Text>}
                  {canManageEntry && (
                    <View style={styles.entryActions}>
                      <TouchableOpacity onPress={() => openEdit(entry)}>
                        <Text style={styles.editAction}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDelete(entry.id)}>
                        <Text style={styles.deleteAction}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      />

      <Modal visible={showAdd} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={24}>
            <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>{editing ? 'Edit Emergency Info' : 'Add Emergency Info'}</Text>
            <View style={styles.typeRow}>
              {TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.typeChip, newType === t && styles.typeChipActive]}
                  onPress={() => setNewType(t)}
                >
                  <Text>{TYPE_ICONS[t]}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.modalInput} value={newTitle} onChangeText={setNewTitle} placeholder="Title" placeholderTextColor={Colors.textSecondary} autoFocus />
            <TextInput style={[styles.modalInput, { minHeight: 80, textAlignVertical: 'top' }]} value={newContent} onChangeText={setNewContent} placeholder="Details..." placeholderTextColor={Colors.textSecondary} multiline />
            <AppButton title="Save" onPress={handleSaveInfo} loading={saving} fullWidth />
            <AppButton title="Cancel" onPress={closeEditor} variant="outline" fullWidth style={{ marginTop: Spacing.sm }} />
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
  addBtn: { backgroundColor: Colors.danger, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', marginBottom: Spacing.md },
  addBtnText: { color: Colors.surface, fontWeight: FontWeight.semiBold, fontSize: FontSize.md },
  section: { marginBottom: Spacing.lg },
  sectionTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text, marginBottom: Spacing.sm },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm, ...Shadow.sm },
  entryTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semiBold, color: Colors.text, marginBottom: 4 },
  entryContent: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  entryFamily: { fontSize: FontSize.xs, color: Colors.primary, marginTop: 4 },
  entryActions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm },
  editAction: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.semiBold },
  deleteAction: { fontSize: FontSize.sm, color: Colors.danger, fontWeight: FontWeight.semiBold },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.xl },
  modalTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.text, marginBottom: Spacing.md },
  typeRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  typeChip: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  typeChipActive: { borderColor: Colors.danger, backgroundColor: Colors.danger + '20' },
  modalInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing.md, fontSize: FontSize.md, color: Colors.text, marginBottom: Spacing.md },
});
