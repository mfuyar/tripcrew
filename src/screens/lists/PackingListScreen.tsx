import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Modal,
  Alert, RefreshControl, KeyboardAvoidingView, Platform, ScrollView,
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
import { parsePackingNames } from '../../utils/packing';

const STATUS_STYLES: Record<PackingStatus, { bg: string; text: string; label: string }> = {
  unpacked: { bg: Colors.border, text: Colors.textSecondary, label: 'Not packed' },
  packed:   { bg: Colors.success + '22', text: Colors.success, label: 'Packed' },
  left_behind: { bg: Colors.danger + '22', text: Colors.danger, label: 'Left behind' },
};

type PackingGroup = {
  key: string;
  items: PackingItem[];
};

type CategorySection = {
  category: string;
  groups: PackingGroup[];
};

type FamilySection = {
  key: string;
  familyName: string;
  packedCount: number;
  totalCount: number;
  categories: CategorySection[];
};

type FamilyFilter = 'all' | 'group_by_family' | 'unassigned' | string;

function createPackingGroupId() {
  return `pack-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function PackingListScreen({ route }: { route: { params: { tripId: string } } }) {
  const { tripId } = route.params;
  const { user, isDemoMode, isGlobalAdmin } = useAuth();
  const { userFamily, userRole, canManageTrip, families } = useTripContext();
  const [items, setItems] = useState<PackingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showFamilyFilter, setShowFamilyFilter] = useState(false);
  const [familyFilter, setFamilyFilter] = useState<FamilyFilter>('all');
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingItem, setEditingItem] = useState<PackingItem | null>(null);

  const parsedNames = parsePackingNames(newName);
  const isEditing = !!editingItem;

  const load = useCallback(async () => {
    if (isDemoMode) { setItems(demoPacking); setLoading(false); setRefreshing(false); return; }
    const { data } = await packingService.getItems(tripId);
    setItems(data ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [tripId, isDemoMode]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleAdd() {
    if (!user) return;
    const names = isEditing ? [newName.trim()].filter(Boolean) : parsedNames;
    if (names.length === 0) return;
    const category = newCategory.trim() || undefined;
    const assignedFamilyId = editingItem?.assigned_family_id ?? userFamily?.id ?? undefined;
    const groupId = !isEditing && names.length > 1 ? createPackingGroupId() : undefined;
    setAdding(true);

    if (editingItem) {
      const { error } = await packingService.updateItem(editingItem.id, {
        name: names[0],
        category,
      });
      if (error) {
        setAdding(false);
        Alert.alert('Unable to save item', error);
        return;
      }
    } else {
      for (const name of names) {
        const { error } = await packingService.addItem(tripId, user.id, {
          name,
          category,
          quantity: 1,
          assigned_family_id: assignedFamilyId,
          group_id: groupId,
          notes: undefined,
          is_essential: false,
        });
        if (error) {
          setAdding(false);
          Alert.alert('Unable to add item', error);
          return;
        }
      }
    }

    setAdding(false);
    closeModal();
    load();
  }

  function openAddModal() {
    setEditingItem(null);
    setNewName('');
    setNewCategory('');
    setShowAdd(true);
  }

  function openEditModal(item: PackingItem) {
    setEditingItem(item);
    setNewName(item.name);
    setNewCategory(item.category ?? '');
    setShowAdd(true);
  }

  function closeModal() {
    setShowAdd(false);
    setEditingItem(null);
    setNewName('');
    setNewCategory('');
  }

  function showItemActions(item: PackingItem) {
    if (!canManageItem(item)) {
      Alert.alert('View only', 'Only the person who added this item, a family admin in the same family, or a trip admin can update it.');
      return;
    }
    Alert.alert(item.name, 'Edit this item or remove it from the packing list.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Edit', onPress: () => openEditModal(item) },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteItem(item),
      },
    ]);
  }

  async function deleteItem(item: PackingItem) {
    if (!canManageItem(item)) {
      Alert.alert('View only', 'Only the person who added this item, a family admin in the same family, or a trip admin can delete it.');
      return;
    }

    const { error } = await packingService.deleteItem(item.id);
    if (error) Alert.alert('Unable to delete item', error);
    load();
  }

  function confirmDeleteItem(item: PackingItem) {
    Alert.alert('Delete item?', `Remove "${item.name}" from the packing list?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteItem(item) },
    ]);
  }

  async function cycleStatus(item: PackingItem) {
    if (!canManageItem(item)) {
      Alert.alert('View only', 'Only the person who added this item, a family admin in the same family, or a trip admin can check it.');
      return;
    }
    const next: PackingStatus = item.status === 'unpacked' ? 'packed' : item.status === 'packed' ? 'left_behind' : 'unpacked';
    const { error } = await packingService.updateStatus(item.id, next);
    if (error) Alert.alert('Unable to update item', error);
    load();
  }

  function canManageItem(item: PackingItem) {
    const isSameFamilyAdmin =
      userRole === 'family_admin' &&
      !!userFamily?.id &&
      item.assigned_family_id === userFamily.id;

    return item.added_by === user?.id || isSameFamilyAdmin || canManageTrip || isGlobalAdmin;
  }

  if (loading) return <LoadingView />;

  const hasUnassignedItems = items.some((item) => !item.assigned_family_id);
  const familyFilterOptions = [
    { value: 'all' as const, label: 'All families' },
    { value: 'group_by_family' as const, label: 'Group by family' },
    ...families.map((family) => ({ value: family.id, label: family.name })),
    ...(hasUnassignedItems ? [{ value: 'unassigned' as const, label: 'Unassigned' }] : []),
  ];
  const selectedFamilyFilterLabel =
    familyFilterOptions.find((option) => option.value === familyFilter)?.label ?? 'All families';
  const isGroupedByFamily = familyFilter === 'group_by_family';
  const visibleItems = items.filter((item) => {
    if (familyFilter === 'all' || isGroupedByFamily) return true;
    if (familyFilter === 'unassigned') return !item.assigned_family_id;
    return item.assigned_family_id === familyFilter;
  });

  function groupItemsByCategory(sectionItems: PackingItem[]): CategorySection[] {
    const categories: Record<string, PackingItem[]> = {};
    for (const item of sectionItems) {
      const cat = item.category ?? 'General';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(item);
    }

    return Object.entries(categories)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, categoryItems]) => {
        const groupMap = new Map<string, PackingItem[]>();
        categoryItems.forEach((item) => {
          const key = item.group_id ? `group:${item.group_id}` : `item:${item.id}`;
          groupMap.set(key, [...(groupMap.get(key) ?? []), item]);
        });
        return {
          category,
          groups: Array.from(groupMap.entries()).map(([key, groupItems]) => ({ key, items: groupItems })),
        };
      });
  }

  const groupedCategories = groupItemsByCategory(visibleItems);
  const groupedFamilySections: FamilySection[] = [
    ...families
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((family) => {
        const familyItems = items.filter((item) => item.assigned_family_id === family.id);
        return {
          key: family.id,
          familyName: family.name,
          packedCount: familyItems.filter((item) => item.status === 'packed').length,
          totalCount: familyItems.length,
          categories: groupItemsByCategory(familyItems),
        };
      })
      .filter((section) => section.totalCount > 0),
    ...(hasUnassignedItems ? [{
      key: 'unassigned',
      familyName: 'Unassigned',
      packedCount: items.filter((item) => !item.assigned_family_id && item.status === 'packed').length,
      totalCount: items.filter((item) => !item.assigned_family_id).length,
      categories: groupItemsByCategory(items.filter((item) => !item.assigned_family_id)),
    }] : []),
  ];
  const categorySuggestions = Array.from(
    new Set(
      items
        .map((item) => item.category?.trim())
      .filter((category): category is string => !!category)
    )
  ).sort((a, b) => a.localeCompare(b));

  const packedCount = visibleItems.filter((i) => i.status === 'packed').length;

  function renderPackingItem(pItem: PackingItem) {
    const st = STATUS_STYLES[pItem.status];
    const canManage = canManageItem(pItem);
    return (
      <TouchableOpacity
        key={pItem.id}
        style={[styles.itemRow, !canManage && styles.itemRowReadOnly]}
        onPress={() => cycleStatus(pItem)}
        onLongPress={() => showItemActions(pItem)}
        activeOpacity={canManage ? 0.75 : 1}
      >
        <View style={styles.itemInfo}>
          <View style={styles.itemTitleRow}>
            <Text style={[styles.checkMark, pItem.status === 'packed' && styles.checkMarkPacked]}>
              {pItem.status === 'packed' ? '✓' : '○'}
            </Text>
            <Text style={styles.itemName}>{pItem.name}</Text>
          </View>
          {pItem.assigned_family && <Text style={styles.itemFamily}>👨‍👩‍👧 {pItem.assigned_family.name}</Text>}
        </View>
        <View style={styles.itemActions}>
          {canManage ? (
            <View style={styles.itemActionRow}>
              <TouchableOpacity
                style={styles.actionPill}
                onPress={() => openEditModal(pItem)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.editPillText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionPill}
                onPress={() => confirmDeleteItem(pItem)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.deletePillText}>Delete</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.viewOnlyText}>View only</Text>
          )}
          <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
            <Text style={[styles.statusText, { color: st.text }]}>{st.label}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  function renderPackingGroup(group: PackingGroup) {
    if (group.items.length === 1) return renderPackingItem(group.items[0]);
    const familyName = group.items[0].assigned_family?.name;
    const groupPacked = group.items.filter((item) => item.status === 'packed').length;
    return (
      <View key={group.key} style={styles.groupCard}>
        <View style={styles.groupHeader}>
          <Text style={styles.groupTitle}>{groupPacked}/{group.items.length} packed</Text>
          {familyName ? <Text style={styles.groupFamily}>👨‍👩‍👧 {familyName}</Text> : null}
        </View>
        {group.items.map(renderPackingItem)}
      </View>
    );
  }

  function renderCategorySection(section: CategorySection) {
    return (
      <View style={styles.section}>
        <Text style={styles.categoryLabel}>{section.category}</Text>
        {section.groups.map(renderPackingGroup)}
      </View>
    );
  }

  function renderFamilySection(section: FamilySection) {
    return (
      <View style={styles.familySection}>
        <View style={styles.familySectionHeader}>
          <Text style={styles.familySectionTitle}>{section.familyName}</Text>
          <Text style={styles.familySectionMeta}>{section.packedCount}/{section.totalCount} packed</Text>
        </View>
        {section.categories.map((category) => (
          <View key={`${section.key}-${category.category}`}>
            {renderCategorySection(category)}
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.progress}>{packedCount}/{visibleItems.length} packed</Text>
          <TouchableOpacity
            style={styles.familyFilterButton}
            onPress={() => setShowFamilyFilter(true)}
            activeOpacity={0.75}
          >
            <Text style={styles.familyFilterText} numberOfLines={1}>{selectedFamilyFilterLabel}</Text>
            <Text style={styles.familyFilterChevron}>⌄</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openAddModal}>
          <Text style={styles.addBtnText}>+ Add Item</Text>
        </TouchableOpacity>
      </View>

      {items.length === 0 ? (
        <EmptyState icon="🎒" title="Packing list is empty" subtitle="Add items you need to pack." actionLabel="Add Item" onAction={openAddModal} />
      ) : visibleItems.length === 0 ? (
        <EmptyState icon="🎒" title="No items for this family" subtitle="Change the family filter or add a new item." actionLabel="Show All" onAction={() => setFamilyFilter('all')} />
      ) : isGroupedByFamily ? (
        <FlatList
          data={groupedFamilySections}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />
          }
          renderItem={({ item }) => renderFamilySection(item)}
        />
      ) : (
        <FlatList
          data={groupedCategories}
          keyExtractor={(item) => item.category}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />
          }
          renderItem={({ item: { category, groups } }) => (
            renderCategorySection({ category, groups })
          )}
        />
      )}

      <Modal visible={showFamilyFilter} transparent animationType="fade" onRequestClose={() => setShowFamilyFilter(false)}>
        <TouchableOpacity
          style={styles.filterModalOverlay}
          activeOpacity={1}
          onPress={() => setShowFamilyFilter(false)}
        >
          <View style={styles.filterMenu}>
            <Text style={styles.filterMenuTitle}>Show packing items for</Text>
            {familyFilterOptions.map((option) => {
              const selected = option.value === familyFilter;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.filterOption, selected && styles.filterOptionSelected]}
                  onPress={() => {
                    setFamilyFilter(option.value);
                    setShowFamilyFilter(false);
                  }}
                >
                  <Text style={[styles.filterOptionText, selected && styles.filterOptionTextSelected]}>
                    {option.label}
                  </Text>
                  {selected ? <Text style={styles.filterOptionCheck}>✓</Text> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={closeModal}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            style={styles.keyboardAvoider}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 16 : 0}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalScrollContent}
            >
              <View style={styles.modalBox}>
                <Text style={styles.modalTitle}>{isEditing ? 'Edit Packing Item' : 'Add Packing Items'}</Text>
                <TextInput
                  style={[styles.modalInput, !isEditing && styles.multiItemInput]}
                  value={newName}
                  onChangeText={setNewName}
                  placeholder={isEditing ? 'Item name' : 'Item names, separated by commas'}
                  placeholderTextColor={Colors.textSecondary}
                  autoFocus
                  multiline={!isEditing}
                  textAlignVertical="top"
                />
                <TextInput
                  style={styles.modalInput}
                  value={newCategory}
                  onChangeText={setNewCategory}
                  placeholder="Category (e.g. Clothes, Electronics)"
                  placeholderTextColor={Colors.textSecondary}
                  returnKeyType="done"
                />
                {categorySuggestions.length > 0 && (
                  <View style={styles.categorySuggestBox}>
                    <Text style={styles.categorySuggestTitle}>Existing categories</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                      <View style={styles.categoryChipRow}>
                        {categorySuggestions.map((category) => {
                          const selected = newCategory.trim().toLowerCase() === category.toLowerCase();
                          return (
                            <TouchableOpacity
                              key={category}
                              style={[styles.categoryChip, selected && styles.categoryChipSelected]}
                              onPress={() => setNewCategory(category)}
                            >
                              <Text style={[styles.categoryChipText, selected && styles.categoryChipTextSelected]}>
                                {category}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </ScrollView>
                  </View>
                )}
                {!isEditing && parsedNames.length > 1 && (
                  <View style={styles.previewBox}>
                    <Text style={styles.previewTitle}>Will add {parsedNames.length} checklist items</Text>
                    {parsedNames.map((name) => (
                      <View key={name} style={styles.previewItem}>
                        <Text style={styles.previewBullet}>○</Text>
                        <Text style={styles.previewText}>{name}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <AppButton
                  title={isEditing ? 'Save Changes' : parsedNames.length > 1 ? `Add ${parsedNames.length} Items` : 'Add Item'}
                  onPress={handleAdd}
                  loading={adding}
                  fullWidth
                  disabled={isEditing ? !newName.trim() : parsedNames.length === 0}
                />
                <AppButton title="Cancel" onPress={closeModal} variant="outline" fullWidth style={{ marginTop: Spacing.sm }} />
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.md },
  progress: { fontSize: FontSize.md, fontWeight: FontWeight.semiBold, color: Colors.text },
  familyFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    marginTop: Spacing.xs,
    maxWidth: 190,
    backgroundColor: Colors.surface,
  },
  familyFilterText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.semiBold, flexShrink: 1 },
  familyFilterChevron: { fontSize: FontSize.sm, color: Colors.textSecondary, marginLeft: Spacing.xs, lineHeight: 16 },
  addBtn: { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  addBtnText: { color: Colors.surface, fontWeight: FontWeight.semiBold, fontSize: FontSize.sm },
  content: { padding: Spacing.md, flexGrow: 1 },
  section: { marginBottom: Spacing.md },
  familySection: { marginBottom: Spacing.lg },
  familySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  familySectionTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text },
  familySectionMeta: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold, color: Colors.textSecondary },
  categoryLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textSecondary, marginBottom: Spacing.sm, textTransform: 'uppercase', letterSpacing: 1 },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md,
    marginBottom: Spacing.sm, ...Shadow.sm,
    gap: Spacing.sm,
  },
  groupCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
    ...Shadow.sm,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xs,
    paddingBottom: Spacing.xs,
  },
  groupTitle: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.semiBold },
  groupFamily: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semiBold },
  itemRowReadOnly: { opacity: 0.82 },
  itemInfo: { flex: 1 },
  itemTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  checkMark: { fontSize: FontSize.lg, color: Colors.textSecondary, fontWeight: FontWeight.bold },
  checkMarkPacked: { color: Colors.success },
  itemName: { fontSize: FontSize.md, fontWeight: FontWeight.medium, color: Colors.text },
  itemFamily: { fontSize: FontSize.xs, color: Colors.primary, marginTop: 2 },
  itemActions: { alignItems: 'flex-end', gap: Spacing.xs },
  itemActionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  actionPill: { paddingHorizontal: Spacing.xs, paddingVertical: 2 },
  editPillText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semiBold },
  deletePillText: { fontSize: FontSize.xs, color: Colors.danger, fontWeight: FontWeight.semiBold },
  viewOnlyText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.semiBold },
  statusBadge: { borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
  statusText: { fontSize: FontSize.xs, fontWeight: FontWeight.semiBold },
  filterModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingTop: 120,
  },
  filterMenu: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    ...Shadow.md,
  },
  filterMenuTitle: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.semiBold, padding: Spacing.sm },
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  filterOptionSelected: { backgroundColor: Colors.primary + '14' },
  filterOptionText: { fontSize: FontSize.md, color: Colors.text, fontWeight: FontWeight.medium },
  filterOptionTextSelected: { color: Colors.primary, fontWeight: FontWeight.semiBold },
  filterOptionCheck: { fontSize: FontSize.md, color: Colors.primary, fontWeight: FontWeight.bold },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  keyboardAvoider: { flex: 1, justifyContent: 'flex-end' },
  modalScrollContent: { flexGrow: 1, justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.xl,
    paddingBottom: Spacing.xl + Spacing.md,
  },
  modalTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.text, marginBottom: Spacing.lg },
  modalInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing.md, fontSize: FontSize.md, color: Colors.text, marginBottom: Spacing.md, minHeight: 52 },
  multiItemInput: { minHeight: 96, maxHeight: 160 },
  categorySuggestBox: { marginTop: -Spacing.xs, marginBottom: Spacing.md },
  categorySuggestTitle: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.semiBold, marginBottom: Spacing.xs },
  categoryChipRow: { flexDirection: 'row', gap: Spacing.xs, paddingRight: Spacing.md },
  categoryChip: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.surface,
  },
  categoryChipSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary + '14' },
  categoryChipText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.semiBold },
  categoryChipTextSelected: { color: Colors.primary },
  previewBox: {
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  previewTitle: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.semiBold, marginBottom: Spacing.sm },
  previewItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xs },
  previewBullet: { fontSize: FontSize.md, color: Colors.textSecondary },
  previewText: { flex: 1, fontSize: FontSize.sm, color: Colors.text },
});
