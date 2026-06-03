import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Modal,
  Alert, RefreshControl, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { GroceryItem } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useTripContext } from '../../contexts/TripContext';
import { groceryService } from '../../services/groceryService';
import { demoGroceries } from '../../lib/mockData';
import { LoadingView } from '../../components/LoadingView';
import { EmptyState } from '../../components/EmptyState';
import { AppButton } from '../../components/AppButton';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../constants/theme';

export function GroceryListScreen({ route }: { route: { params: { tripId: string } } }) {
  const { tripId } = route.params;
  const { user, isDemoMode } = useAuth();
  const { families, userFamily } = useTripContext();
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (isDemoMode) { setItems(demoGroceries); setLoading(false); setRefreshing(false); return; }
    const { data } = await groceryService.getItems(tripId);
    setItems(data ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [tripId, isDemoMode]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleAdd() {
    if (!newItemName.trim() || !user) return;
    setAdding(true);
    const { error } = await groceryService.addItem(tripId, user.id, {
      name: newItemName.trim(),
      quantity: newItemQty.trim() || undefined,
      category: undefined,
      assigned_family_id: userFamily?.id ?? undefined,
      notes: undefined,
    });
    setAdding(false);
    if (error) { Alert.alert('Error', error); return; }
    setNewItemName('');
    setNewItemQty('');
    setShowAdd(false);
    load();
  }

  async function handleToggle(item: GroceryItem) {
    if (!user) return;
    if (item.is_purchased) {
      await groceryService.updateItem(item.id, { is_purchased: false, purchased_by: undefined, purchased_at: undefined });
    } else {
      await groceryService.markPurchased(item.id, user.id);
    }
    load();
  }

  async function handleDelete(id: string) {
    await groceryService.deleteItem(id);
    load();
  }

  if (loading) return <LoadingView />;

  const unpurchased = items.filter((i) => !i.is_purchased);
  const purchased = items.filter((i) => i.is_purchased);

  return (
    <View style={styles.container}>
      <FlatList
        data={[...unpurchased, ...purchased]}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />
        }
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <Text style={styles.stats}>
                {unpurchased.length} remaining • {purchased.length} done
              </Text>
              <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
                <Text style={styles.addBtnText}>+ Add Item</Text>
              </TouchableOpacity>
            </View>
            {unpurchased.length > 0 && <Text style={styles.sectionLabel}>To Get</Text>}
          </View>
        }
        ListEmptyComponent={
          <EmptyState icon="🛒" title="Grocery list is empty" subtitle="Add items you need for the trip." actionLabel="Add Item" onAction={() => setShowAdd(true)} />
        }
        renderItem={({ item, index }) => {
          const isFirstPurchased = index === unpurchased.length && purchased.length > 0;
          return (
            <>
              {isFirstPurchased && <Text style={styles.sectionLabel}>Already Got</Text>}
              <TouchableOpacity
                style={[styles.itemRow, item.is_purchased && styles.itemRowDone]}
                onPress={() => handleToggle(item)}
                onLongPress={() =>
                  Alert.alert('Delete', `Remove "${item.name}"?`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => handleDelete(item.id) },
                  ])
                }
              >
                <View style={[styles.checkbox, item.is_purchased && styles.checkboxDone]}>
                  {item.is_purchased && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <View style={styles.itemInfo}>
                  <Text style={[styles.itemName, item.is_purchased && styles.itemNameDone]}>
                    {item.name}
                  </Text>
                  {item.quantity && <Text style={styles.itemQty}>{item.quantity}</Text>}
                  {item.assigned_family && (
                    <Text style={styles.itemFamily}>👨‍👩‍👧 {item.assigned_family.name}</Text>
                  )}
                </View>
              </TouchableOpacity>
            </>
          );
        }}
      />

      {/* Add Item Modal */}
      <Modal visible={showAdd} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={24}>
            <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Add Grocery Item</Text>
            <TextInput
              style={styles.modalInput}
              value={newItemName}
              onChangeText={setNewItemName}
              placeholder="Item name"
              placeholderTextColor={Colors.textSecondary}
              autoFocus
            />
            <TextInput
              style={styles.modalInput}
              value={newItemQty}
              onChangeText={setNewItemQty}
              placeholder="Quantity (e.g. 2 liters, 500g)"
              placeholderTextColor={Colors.textSecondary}
            />
            <AppButton title="Add" onPress={handleAdd} loading={adding} fullWidth />
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  stats: { fontSize: FontSize.sm, color: Colors.textSecondary },
  addBtn: { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  addBtnText: { color: Colors.surface, fontWeight: FontWeight.semiBold, fontSize: FontSize.sm },
  sectionLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold, color: Colors.textSecondary, marginBottom: Spacing.sm, marginTop: Spacing.sm },
  itemRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: Spacing.md, marginBottom: Spacing.sm, gap: Spacing.md, ...Shadow.sm,
  },
  itemRowDone: { opacity: 0.6 },
  checkbox: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 2, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxDone: { backgroundColor: Colors.success, borderColor: Colors.success },
  checkmark: { color: Colors.surface, fontWeight: FontWeight.bold },
  itemInfo: { flex: 1 },
  itemName: { fontSize: FontSize.md, fontWeight: FontWeight.medium, color: Colors.text },
  itemNameDone: { textDecorationLine: 'line-through', color: Colors.textSecondary },
  itemQty: { fontSize: FontSize.sm, color: Colors.textSecondary },
  itemFamily: { fontSize: FontSize.xs, color: Colors.primary, marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.xl },
  modalTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.text, marginBottom: Spacing.lg },
  modalInput: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    padding: Spacing.md, fontSize: FontSize.md, color: Colors.text, marginBottom: Spacing.md,
  },
});
