import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Modal,
  Alert, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { PackingItem, PackingStatus } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useTripContext } from '../../contexts/TripContext';
import { packingService } from '../../services/packingService';
import { demoPacking } from '../../lib/mockData';
import { LoadingView } from '../../components/LoadingView';
import { EmptyState } from '../../components/EmptyState';
import { AppButton } from '../../components/AppButton';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../constants/theme';

const STATUS_STYLES: Record<PackingStatus, { bg: string; text: string; label: string }> = {
  unpacked: { bg: Colors.border, text: Colors.textSecondary, label: 'Not packed' },
  packed:   { bg: Colors.success + '22', text: Colors.success, label: 'Packed' },
  left_behind: { bg: Colors.danger + '22', text: Colors.danger, label: 'Left behind' },
};

export function PackingListScreen({ route }: { route: { params: { tripId: string } } }) {
  const { tripId } = route.params;
  const { user, isDemoMode } = useAuth();
  const { userFamily } = useTripContext();
  const [items, setItems] = useState<PackingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (isDemoMode) { setItems(demoPacking); setLoading(false); setRefreshing(false); return; }
    const { data } = await packingService.getItems(tripId);
    setItems(data ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [tripId, isDemoMode]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleAdd() {
    if (!newName.trim() || !user) return;
    setAdding(true);
    await packingService.addItem(tripId, user.id, {
      name: newName.trim(),
      category: newCategory.trim() || undefined,
      quantity: 1,
      assigned_family_id: userFamily?.id ?? undefined,
      notes: undefined,
      is_essential: false,
    });
    setAdding(false);
    setNewName('');
    setNewCategory('');
    setShowAdd(false);
    load();
  }

  async function cycleStatus(item: PackingItem) {
    const next: PackingStatus = item.status === 'unpacked' ? 'packed' : item.status === 'packed' ? 'left_behind' : 'unpacked';
    await packingService.updateStatus(item.id, next);
    load();
  }

  if (loading) return <LoadingView />;

  // Group by category
  const categories: Record<string, PackingItem[]> = {};
  for (const item of items) {
    const cat = item.category ?? 'General';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(item);
  }

  const packedCount = items.filter((i) => i.status === 'packed').length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.progress}>{packedCount}/{items.length} packed</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
          <Text style={styles.addBtnText}>+ Add Item</Text>
        </TouchableOpacity>
      </View>

      {items.length === 0 ? (
        <EmptyState icon="🎒" title="Packing list is empty" subtitle="Add items you need to pack." actionLabel="Add Item" onAction={() => setShowAdd(true)} />
      ) : (
        <FlatList
          data={Object.entries(categories)}
          keyExtractor={([cat]) => cat}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />
          }
          renderItem={({ item: [cat, catItems] }) => (
            <View style={styles.section}>
              <Text style={styles.categoryLabel}>{cat}</Text>
              {catItems.map((pItem) => {
                const st = STATUS_STYLES[pItem.status];
                return (
                  <TouchableOpacity
                    key={pItem.id}
                    style={styles.itemRow}
                    onPress={() => cycleStatus(pItem)}
                    onLongPress={() =>
                      Alert.alert('Delete', `Remove "${pItem.name}"?`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: () => { packingService.deleteItem(pItem.id); load(); } },
                      ])
                    }
                  >
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemName}>{pItem.name}</Text>
                      {pItem.assigned_family && <Text style={styles.itemFamily}>👨‍👩‍👧 {pItem.assigned_family.name}</Text>}
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
                      <Text style={[styles.statusText, { color: st.text }]}>{st.label}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        />
      )}

      <Modal visible={showAdd} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Add Packing Item</Text>
            <TextInput
              style={styles.modalInput}
              value={newName}
              onChangeText={setNewName}
              placeholder="Item name"
              placeholderTextColor={Colors.textSecondary}
              autoFocus
            />
            <TextInput
              style={styles.modalInput}
              value={newCategory}
              onChangeText={setNewCategory}
              placeholder="Category (e.g. Clothes, Electronics)"
              placeholderTextColor={Colors.textSecondary}
            />
            <AppButton title="Add" onPress={handleAdd} loading={adding} fullWidth />
            <AppButton title="Cancel" onPress={() => setShowAdd(false)} variant="outline" fullWidth style={{ marginTop: Spacing.sm }} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.md },
  progress: { fontSize: FontSize.md, fontWeight: FontWeight.semiBold, color: Colors.text },
  addBtn: { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  addBtnText: { color: Colors.surface, fontWeight: FontWeight.semiBold, fontSize: FontSize.sm },
  content: { padding: Spacing.md, flexGrow: 1 },
  section: { marginBottom: Spacing.md },
  categoryLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textSecondary, marginBottom: Spacing.sm, textTransform: 'uppercase', letterSpacing: 1 },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md,
    marginBottom: Spacing.sm, ...Shadow.sm,
  },
  itemInfo: { flex: 1 },
  itemName: { fontSize: FontSize.md, fontWeight: FontWeight.medium, color: Colors.text },
  itemFamily: { fontSize: FontSize.xs, color: Colors.primary, marginTop: 2 },
  statusBadge: { borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
  statusText: { fontSize: FontSize.xs, fontWeight: FontWeight.semiBold },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.xl },
  modalTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.text, marginBottom: Spacing.lg },
  modalInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing.md, fontSize: FontSize.md, color: Colors.text, marginBottom: Spacing.md },
});
