import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  Modal,
  SafeAreaView,
  useWindowDimensions,
} from 'react-native';
import { mediaService } from '../../services/mediaService';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainStackParamList, ExpenseCategory, SplitMethod, FamilySplitShare, PersonSplitShare } from '../../types';
import { useTripContext } from '../../contexts/TripContext';
import { useAuth } from '../../contexts/AuthContext';
import { expenseService } from '../../services/expenseService';
import { settlementService } from '../../services/settlementService';
import { calculateExpenseSplits } from '../../utils/calculations';
import { AppTextInput } from '../../components/AppTextInput';
import { AppButton } from '../../components/AppButton';
import { CurrencyAmount } from '../../components/CurrencyAmount';
import { FormKeyboardView } from '../../components/FormKeyboardView';
import { DatePickerField } from '../../components/DatePickerField';
import { parseDate } from '../../utils/dateUtils';
import { currencySymbol } from '../../utils/currency';
import {
  Colors, FontSize, FontWeight, Spacing, Radius,
  CATEGORY_ICONS, CATEGORY_COLORS,
} from '../../constants/theme';

type Props = NativeStackScreenProps<MainStackParamList, 'AddEditExpense'>;

const CATEGORIES: ExpenseCategory[] = [
  'lodging', 'groceries', 'gas', 'restaurant', 'activity', 'tickets', 'parking', 'tolls', 'supplies', 'other',
];

// 'selected_families_only' is used internally when the user excludes families;
// it is not shown in the split method picker.
const SPLIT_METHODS: { value: SplitMethod; label: string; desc: string }[] = [
  { value: 'equal_by_family', label: 'Equal by family', desc: 'Each family pays the same share' },
  { value: 'equal_by_person', label: 'Equal by person', desc: 'Split by headcount' },
  { value: 'adults_only', label: 'Adults only', desc: 'Children excluded' },
  { value: 'children_count_half', label: 'Children ½', desc: 'Children count as half a person' },
];

function buildChangeSummary(prev: any, next: any, currency: string): string {
  const parts: string[] = [];
  if (prev.title !== next.title) parts.push(`Title: "${prev.title}" → "${next.title}"`);
  if (prev.amount !== next.amount) parts.push(`Amount: ${currency}${prev.amount} → ${currency}${next.amount}`);
  if (prev.category !== next.category) parts.push(`Category: ${prev.category} → ${next.category}`);
  if (prev.date !== next.date) parts.push(`Date: ${prev.date} → ${next.date}`);
  if (prev.notes !== next.notes) parts.push('Notes updated');
  return parts.length > 0 ? parts.join(', ') : 'Expense updated';
}

function isPersonExpenseParticipant(expense: {
  paid_by_family_id?: string | null;
  paid_by_user_id?: string | null;
  expense_person_splits?: { user_id: string }[] | null;
}, userId?: string): boolean {
  if (!userId || expense.paid_by_family_id) return false;
  return (
    expense.paid_by_user_id === userId ||
    expense.expense_person_splits?.some((split) => split.user_id === userId) === true
  );
}

export function AddEditExpenseScreen({ navigation, route }: Props) {
  const { tripId, expenseId, scannedExpense } = route.params;
  const { width } = useWindowDimensions();
  const { families, members, currentTrip, userFamily, canManageTrip, isTripOrganizer } = useTripContext();
  const { user, profile, isDemoMode, isGlobalAdmin } = useAuth();
  const displayCurrency = currencySymbol(currentTrip?.currency);
  const horizontalPadding = Spacing.lg * 2;
  const categoryGap = Spacing.xs;
  const categoryColumns = width >= 430 ? 4 : 3;
  const categoryChipWidth = Math.floor((width - horizontalPadding - categoryGap * (categoryColumns - 1)) / categoryColumns);
  const isEdit = !!expenseId;

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('other');
  const [paidByFamilyId, setPaidByFamilyId] = useState(userFamily?.id ?? families[0]?.id ?? '');
  const [splitMethod, setSplitMethod] = useState<SplitMethod>('equal_by_family');
  const [baseSplitMethod, setBaseSplitMethod] = useState<SplitMethod>('equal_by_family');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [selectedFamilies, setSelectedFamilies] = useState<string[]>(families.map((f) => f.id));
  const [paidByUserId, setPaidByUserId] = useState(user?.id ?? '');
  const [selectedPersonIds, setSelectedPersonIds] = useState<string[]>([]);
  const [personSplitMode, setPersonSplitMode] = useState<'everyone' | 'selected'>('everyone');
  const [expenseScope, setExpenseScope] = useState<'family' | 'person'>('family');
  const [splits, setSplits] = useState<FamilySplitShare[]>([]);
  const [personSplits, setPersonSplits] = useState<PersonSplitShare[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEdit);
  // For edit mode: whether the current user can modify this expense
  const [canEdit, setCanEdit] = useState(!isEdit);
  const [expenseIsDeleted, setExpenseIsDeleted] = useState(false);
  const [receiptLocalUri, setReceiptLocalUri] = useState<string | undefined>(scannedExpense?.receiptImageUri);
  const [receiptUrl, setReceiptUrl] = useState<string | undefined>();
  const [receiptFullScreen, setReceiptFullScreen] = useState(false);
  const hasFamilies = families.length > 0;
  const usePersonExpense = !hasFamilies || expenseScope === 'person';
  const tripMembers = useMemo(() => members.filter((m) => m.profile), [members]);
  const personNames = useMemo(
    () => new Map(tripMembers.map((m) => [m.user_id, m.profile?.full_name ?? m.profile?.email ?? 'Member'])),
    [tripMembers]
  );

  useEffect(() => {
    if (!hasFamilies) {
      setExpenseScope('person');
      setPaidByFamilyId('');
      setSelectedFamilies([]);
      setSplitMethod('equal_by_person');
      setBaseSplitMethod('equal_by_person');
      setSelectedPersonIds((prev) => (prev.length ? prev : tripMembers.map((m) => m.user_id)));
      return;
    }
    if (!paidByFamilyId) {
      setExpenseScope((prev) => (prev === 'person' ? prev : 'family'));
      setPaidByFamilyId(userFamily?.id ?? families[0].id);
      setSelectedFamilies(families.map((f) => f.id));
    }
  }, [families, hasFamilies, paidByFamilyId, tripMembers, userFamily?.id]);

  useEffect(() => {
    if (!paidByUserId && user?.id) setPaidByUserId(user.id);
  }, [paidByUserId, user?.id]);

  function togglePerson(userId: string) {
    setSelectedPersonIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
    setPersonSplitMode('selected');
  }

  useEffect(() => {
    if (isEdit) loadExpense();
  }, [expenseId]);

  useEffect(() => {
    if (!scannedExpense || isEdit) return;
    if (scannedExpense.title) setTitle(scannedExpense.title);
    if (scannedExpense.amount !== undefined) setAmount(scannedExpense.amount.toFixed(2));
    if (scannedExpense.date) setDate(scannedExpense.date);
    if (scannedExpense.notes) setNotes(scannedExpense.notes);
  }, [scannedExpense, isEdit]);

  function toggleAppliesTo(familyId: string) {
    setSelectedFamilies((prev) => {
      const next = prev.includes(familyId) ? prev.filter((id) => id !== familyId) : [...prev, familyId];
      const allSelected = next.length === families.length;
      if (allSelected) {
        setSplitMethod(baseSplitMethod);
      } else {
        setSplitMethod('selected_families_only');
      }
      return next;
    });
  }

  async function loadExpense() {
    if (isDemoMode) { setFetching(false); return; }
    const { data } = await expenseService.getExpenseById(expenseId!);
    if (data) {
      setTitle(data.title);
      setAmount(String(data.amount));
      setCategory(data.category);
      setPaidByFamilyId(data.paid_by_family_id ?? '');
      setPaidByUserId(data.paid_by_user_id);
      setSplitMethod(data.split_method);
      setDate(data.date);
      setNotes(data.notes ?? '');
      if (data.receipt_url) setReceiptUrl(data.receipt_url);
      setExpenseIsDeleted(!!data.is_deleted);
      if (data.split_method === 'selected_families_only' && data.expense_splits?.length) {
        const included = data.expense_splits.filter((s) => s.share_amount > 0).map((s) => s.family_id);
        setSelectedFamilies(included);
        setBaseSplitMethod('equal_by_family');
      } else if (!data.paid_by_family_id && data.expense_person_splits?.length) {
        setExpenseScope('person');
        const included = data.expense_person_splits.filter((s) => s.share_amount > 0).map((s) => s.user_id);
        setSelectedPersonIds(included);
        setPersonSplitMode(included.length === tripMembers.length ? 'everyone' : 'selected');
      } else {
        setBaseSplitMethod(data.split_method as SplitMethod);
      }

      // Family expenses: payer/creator or organizer/global admin.
      // Person expenses: payer or any selected person in the split, plus organizer/global admin.
      // Other trip admins cannot edit/delete someone else's expense.
      let baseCanEdit =
        isTripOrganizer ||
        isGlobalAdmin ||
        data.paid_by_user_id === user?.id ||
        isPersonExpenseParticipant(data, user?.id);
      if (baseCanEdit && data.paid_by_family_id) {
        const locked = await settlementService.isExpenseEditLocked(tripId, data.paid_by_family_id);
        if (locked) baseCanEdit = false;
      }
      setCanEdit(baseCanEdit);
    }
    setFetching(false);
  }

  // Recalculate preview whenever relevant fields change
  useEffect(() => {
    const amt = parseFloat(amount);
    if (usePersonExpense && !isNaN(amt) && amt > 0) {
      const includedIds =
        personSplitMode === 'everyone'
          ? tripMembers.map((m) => m.user_id)
          : selectedPersonIds;
      if (!includedIds.length) {
        setPersonSplits([]);
        return;
      }
      const share = Math.round((amt / includedIds.length) * 100) / 100;
      const shares = includedIds.map((id) => ({
        userId: id,
        userName: personNames.get(id) ?? 'Member',
        shareAmount: share,
      }));
      const total = shares.reduce((sum, s) => sum + s.shareAmount, 0);
      const diff = Math.round((amt - total) * 100) / 100;
      if (shares.length) shares[shares.length - 1].shareAmount = Math.round((shares[shares.length - 1].shareAmount + diff) * 100) / 100;
      setPersonSplits(shares);
      setSplits([]);
      return;
    }
    if (!isNaN(amt) && amt > 0 && families.length > 0) {
      const opts =
        splitMethod === 'selected_families_only'
          ? { selectedFamilyIds: selectedFamilies }
          : undefined;
      const result = calculateExpenseSplits(amt, families, splitMethod, opts);
      setSplits(result);
    } else {
      setSplits([]);
      setPersonSplits([]);
    }
  }, [amount, splitMethod, families, selectedFamilies, usePersonExpense, personSplitMode, selectedPersonIds, tripMembers]);

  async function handleSave() {
    if (isEdit && !canEdit) {
      Alert.alert('View only', 'Only involved people or the trip organizer can edit this expense.');
      return;
    }
    if (!title.trim()) { Alert.alert('Error', 'Please enter a title.'); return; }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { Alert.alert('Error', 'Please enter a valid amount.'); return; }
    if (hasFamilies && !paidByFamilyId) { Alert.alert('Error', 'Please select which family paid.'); return; }
    if (usePersonExpense && !paidByUserId) { Alert.alert('Error', 'Please select who paid.'); return; }
    if (!usePersonExpense && selectedFamilies.length === 0) {
      Alert.alert('Error', 'Select at least one family under "Applies to".'); return;
    }
    if (usePersonExpense && personSplits.length === 0) {
      Alert.alert('Error', 'Select at least one person under "Applies to".'); return;
    }
    if (!user || isDemoMode) { Alert.alert('Demo Mode', 'Adding expenses is disabled in demo.'); return; }

    setLoading(true);
    // Upload receipt image if we have a local URI that hasn't been uploaded yet
    let finalReceiptUrl = receiptUrl;
    if (receiptLocalUri && !receiptUrl && user) {
      const upload = await mediaService.uploadChatMedia(tripId, user.id, receiptLocalUri, 'photo');
      if (upload.data) finalReceiptUrl = upload.data.url;
    }
    const payload = {
      title: title.trim(),
      amount: amt,
      currency: currentTrip?.currency ?? 'USD',
      category,
      paid_by_family_id: usePersonExpense ? null : paidByFamilyId,
      paid_by_user_id: usePersonExpense ? paidByUserId : user.id,
      split_method: usePersonExpense ? 'equal_by_person' : splitMethod,
      date,
      notes: notes.trim() || undefined,
      receipt_url: finalReceiptUrl || undefined,
    };

    const editorName = profile?.full_name ?? user.email ?? 'Unknown';

    if (isEdit) {
      // Save current state as a version before overwriting
      const { data: existing } = await expenseService.getExpenseById(expenseId!);
      if (existing) {
        const summary = buildChangeSummary(existing, payload, displayCurrency);
        await expenseService.saveVersion(existing, 'update', editorName, summary);
      }
      const { error } = await expenseService.updateExpense(expenseId!, {
        ...payload,
        last_edited_by: user.id,
        last_edited_at: new Date().toISOString(),
        current_version: (existing?.current_version ?? 1) + 1,
      } as any);
      if (!error) {
        const splitResult = !usePersonExpense
          ? await expenseService.saveExpenseSplits(expenseId!, tripId, splits)
          : await expenseService.saveExpensePersonSplits(expenseId!, tripId, personSplits);
        if (splitResult.error) Alert.alert('Error', splitResult.error);
        else navigation.goBack();
      } else {
        Alert.alert('Error', error);
      }
    } else {
      const { data, error } = await expenseService.createExpense(tripId, user.id, payload);
      if (!error && data) {
        // Save v1 snapshot
        await expenseService.saveVersion(data, 'create', editorName, 'Expense created');
        const splitResult = !usePersonExpense
          ? await expenseService.saveExpenseSplits(data.id, tripId, splits)
          : await expenseService.saveExpensePersonSplits(data.id, tripId, personSplits);
        if (splitResult.error) {
          await expenseService.deleteExpense(data.id);
          Alert.alert('Error', splitResult.error);
        } else {
          navigation.goBack();
        }
      } else {
        Alert.alert('Error', error ?? 'Unknown error');
      }
    }
    setLoading(false);
  }

  async function handleDelete() {
    if (!expenseId || !user) return;
    if (!canEdit) {
      Alert.alert('View only', 'Only involved people or the trip organizer can delete this expense.');
      return;
    }
    Alert.alert(
      'Delete Expense',
      'This expense will be hidden from the list. The organizer can see and restore it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { data: existing, error: fetchError } = await expenseService.getExpenseById(expenseId);
            if (!existing) {
              Alert.alert('Error', fetchError ?? 'Could not find this expense.');
              return;
            }
            const editorName = profile?.full_name ?? user.email ?? 'Unknown';
            const { error: deleteError } = await expenseService.softDeleteExpense(existing, user.id, editorName);
            if (deleteError) {
              Alert.alert('Error', deleteError);
              return;
            }
            navigation.goBack();
          },
        },
      ]
    );
  }

  async function handlePermanentDelete() {
    if (!expenseId || !user) return;
    Alert.alert(
      'Permanently Delete',
      'This will erase the expense and all its history forever. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: async () => {
            await expenseService.deleteExpense(expenseId);
            navigation.goBack();
          },
        },
      ]
    );
  }

  if (fetching) return null;

  return (
    <FormKeyboardView contentContainerStyle={styles.container}>
        {!isEdit && (
          <View style={styles.scanPanel}>
            <View style={styles.scanCopy}>
              <Text style={styles.scanTitle}>Manual expense</Text>
              <Text style={styles.scanText}>Scan can prefill receipt details, then you review and save.</Text>
            </View>
            <TouchableOpacity
              style={styles.scanButton}
              onPress={() => navigation.navigate('ReceiptScanner', { tripId, returnToExpense: true })}
              activeOpacity={0.8}
            >
              <Text style={styles.scanButtonText}>Scan receipt</Text>
            </TouchableOpacity>
          </View>
        )}
        {/* Receipt thumbnail — admin/creator only */}
        {canManageTrip && (receiptLocalUri || receiptUrl) && (
          <View style={styles.receiptRow}>
            <View style={styles.receiptRowHeader}>
              <Text style={styles.receiptLabel}>📎 Receipt attached</Text>
              {canEdit && (
                <TouchableOpacity onPress={() => Alert.alert('Remove Receipt', 'Remove this receipt?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Remove', style: 'destructive', onPress: () => { setReceiptLocalUri(undefined); setReceiptUrl(undefined); } },
                ])}>
                  <Text style={styles.receiptRemove}>Remove</Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity onPress={() => setReceiptFullScreen(true)} activeOpacity={0.85}>
              <Image source={{ uri: receiptLocalUri ?? receiptUrl }} style={styles.receiptThumb} resizeMode="cover" />
              <Text style={styles.receiptTapHint}>Tap to view full size</Text>
            </TouchableOpacity>
          </View>
        )}
        {/* Full-screen receipt viewer */}
        <Modal visible={receiptFullScreen} transparent animationType="fade">
          <SafeAreaView style={styles.receiptModal}>
            <TouchableOpacity style={styles.receiptModalClose} onPress={() => setReceiptFullScreen(false)}>
              <Text style={styles.receiptModalCloseText}>✕ Close</Text>
            </TouchableOpacity>
            <Image
              source={{ uri: receiptLocalUri ?? receiptUrl }}
              style={styles.receiptFullImage}
              resizeMode="contain"
            />
          </SafeAreaView>
        </Modal>

        <AppTextInput label="Title" required value={title} onChangeText={setTitle} placeholder="Grocery run at Mercado..." />
        <AppTextInput
          label="Amount" required
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          keyboardType="decimal-pad"
        />
        <DatePickerField
          label="Date"
          value={date}
          onChange={setDate}
          minimumDate={currentTrip?.start_date ? parseDate(currentTrip.start_date) : undefined}
          maximumDate={currentTrip?.end_date ? parseDate(currentTrip.end_date) : undefined}
        />

        {/* Category picker */}
        <Text style={styles.label}>Category</Text>
        <View style={styles.categoryGrid}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[
                styles.catChip,
                { width: categoryChipWidth },
                category === cat && { backgroundColor: CATEGORY_COLORS[cat] + '30', borderColor: CATEGORY_COLORS[cat] },
              ]}
              onPress={() => setCategory(cat)}
            >
              <Text style={styles.catIcon}>{CATEGORY_ICONS[cat]}</Text>
              <Text style={[styles.catLabel, category === cat && { color: CATEGORY_COLORS[cat], fontWeight: FontWeight.semiBold }]}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {hasFamilies && (
          <>
            <Text style={styles.label}>Expense type</Text>
            <View style={styles.scopeRow}>
              <TouchableOpacity
                style={[styles.scopeBtn, expenseScope === 'family' && styles.scopeBtnActive]}
                onPress={() => setExpenseScope('family')}
              >
                <Text style={[styles.scopeBtnText, expenseScope === 'family' && styles.scopeBtnTextActive]}>
                  Family split
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.scopeBtn, expenseScope === 'person' && styles.scopeBtnActive]}
                onPress={() => {
                  setExpenseScope('person');
                  setSelectedPersonIds((prev) => prev.length ? prev : tripMembers.map((m) => m.user_id));
                }}
              >
                <Text style={[styles.scopeBtnText, expenseScope === 'person' && styles.scopeBtnTextActive]}>
                  Person split
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {usePersonExpense ? (
          <View style={styles.noFamiliesPanel}>
            <Text style={styles.noFamiliesTitle}>{hasFamilies ? 'Person split' : 'No families yet'}</Text>
            <Text style={styles.noFamiliesText}>
              {hasFamilies
                ? 'Split this expense among selected trip members. Person settlements will be shown separately from family settlements.'
                : canManageTrip
                ? 'Create a family to use family expense splitting, or record this as an equal-by-person expense for the current trip members.'
                : 'The trip organizer must create families before family expense splitting is available.'}
            </Text>
            <View style={styles.noFamiliesActions}>
              {canManageTrip && (
                <TouchableOpacity
                  style={styles.createFamilyBtn}
                  onPress={() => navigation.navigate('AddEditFamily', { tripId })}
                >
                  <Text style={styles.createFamilyBtnText}>Create Family</Text>
                </TouchableOpacity>
              )}
              <View style={styles.personModePill}>
                <Text style={styles.personModePillText}>Equal by person</Text>
              </View>
            </View>

            <Text style={styles.label}>Paid by person</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipScroller}
              contentContainerStyle={styles.chipRow}
            >
              {tripMembers.map((m) => (
                <TouchableOpacity
                  key={m.user_id}
                  style={[styles.famChip, paidByUserId === m.user_id && styles.famChipActive]}
                  onPress={() => setPaidByUserId(m.user_id)}
                >
                  <View style={styles.personDot}>
                    <Text style={styles.personDotText}>
                      {(m.profile?.full_name ?? m.profile?.email ?? '?').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={[styles.famChipText, paidByUserId === m.user_id && styles.famChipTextActive]}>
                    {m.profile?.full_name ?? m.profile?.email ?? 'Member'}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.appliesToHeader}>
              <Text style={styles.label}>Applies to people</Text>
              {personSplitMode === 'selected' && selectedPersonIds.length < tripMembers.length && (
                <TouchableOpacity onPress={() => {
                  setPersonSplitMode('everyone');
                  setSelectedPersonIds(tripMembers.map((m) => m.user_id));
                }}>
                  <Text style={styles.selectAllText}>Everyone</Text>
                </TouchableOpacity>
              )}
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipScroller}
              contentContainerStyle={styles.chipRow}
            >
              {tripMembers.map((m) => {
                const included = personSplitMode === 'everyone' || selectedPersonIds.includes(m.user_id);
                const label = m.profile?.full_name ?? m.profile?.email ?? 'Member';
                return (
                  <TouchableOpacity
                    key={m.user_id}
                    style={[styles.famChip, included ? styles.famChipIncluded : styles.famChipExcluded]}
                    onPress={() => togglePerson(m.user_id)}
                  >
                    <View style={[styles.personDot, !included && styles.personDotMuted]}>
                      <Text style={styles.personDotText}>{label.charAt(0).toUpperCase()}</Text>
                    </View>
                    <Text style={[styles.famChipText, included ? styles.famChipTextActive : styles.famChipTextExcluded]}>
                      {label}
                    </Text>
                    {!included && <Text style={styles.excludedX}>✕</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {personSplitMode === 'selected' && selectedPersonIds.length === 0 && (
              <Text style={styles.noFamilyWarning}>Select at least one person</Text>
            )}
          </View>
        ) : (
          <>
            {/* Paid by */}
            <Text style={styles.label}>Paid by family</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipScroller}
              contentContainerStyle={styles.chipRow}
            >
              {families.map((f) => (
                <TouchableOpacity
                  key={f.id}
                  style={[styles.famChip, paidByFamilyId === f.id && styles.famChipActive]}
                  onPress={() => setPaidByFamilyId(f.id)}
                >
                  <View style={[styles.famDot, { backgroundColor: f.color ?? Colors.primary }]} />
                  <Text style={[styles.famChipText, paidByFamilyId === f.id && styles.famChipTextActive]}>
                    {f.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Applies to — always visible, all families ticked by default */}
            <View style={styles.appliesToSection}>
              <View style={styles.appliesToHeader}>
                <Text style={styles.label}>Applies to</Text>
                <View style={styles.appliesToShortcuts}>
                  {!(selectedFamilies.length === 1 && selectedFamilies[0] === paidByFamilyId) && paidByFamilyId && (
                    <TouchableOpacity onPress={() => {
                      setSelectedFamilies([paidByFamilyId]);
                      setSplitMethod('selected_families_only');
                    }}>
                      <Text style={styles.shortcutText}>Just for us</Text>
                    </TouchableOpacity>
                  )}
                  {selectedFamilies.length < families.length && (
                    <TouchableOpacity onPress={() => {
                      setSelectedFamilies(families.map((f) => f.id));
                      setSplitMethod(baseSplitMethod);
                    }}>
                      <Text style={styles.selectAllText}>All families</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.chipScroller}
                contentContainerStyle={styles.chipRow}
              >
                {families.map((f) => {
                  const included = selectedFamilies.includes(f.id);
                  return (
                    <TouchableOpacity
                      key={f.id}
                      style={[styles.famChip, included ? styles.famChipIncluded : styles.famChipExcluded]}
                      onPress={() => toggleAppliesTo(f.id)}
                    >
                      <View style={[styles.famDot, { backgroundColor: included ? (f.color ?? Colors.primary) : Colors.border }]} />
                      <Text style={[styles.famChipText, included ? styles.famChipTextActive : styles.famChipTextExcluded]}>
                        {f.name}
                      </Text>
                      {!included && <Text style={styles.excludedX}>✕</Text>}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              {selectedFamilies.length === 0 && (
                <Text style={styles.noFamilyWarning}>Select at least one family</Text>
              )}
            </View>

            {/* Split method — only shown when all families included (specific = always equal) */}
            {splitMethod !== 'selected_families_only' && (
              <>
                <Text style={styles.label}>How to split</Text>
                {SPLIT_METHODS.map((m) => (
                  <TouchableOpacity
                    key={m.value}
                    style={[styles.methodRow, splitMethod === m.value && styles.methodRowActive]}
                    onPress={() => { setSplitMethod(m.value); setBaseSplitMethod(m.value); }}
                  >
                    <View style={[styles.radio, splitMethod === m.value && styles.radioActive]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.methodLabel, splitMethod === m.value && styles.methodLabelActive]}>
                        {m.label}
                      </Text>
                      <Text style={styles.methodDesc}>{m.desc}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </>
            )}
          </>
        )}

        {/* Split Preview */}
        {(() => {
          const amt = parseFloat(amount);
          if (usePersonExpense && !isNaN(amt) && amt > 0) {
            const payer = tripMembers.find((m) => m.user_id === paidByUserId);
            const singleOther =
              personSplits.length === 1 && personSplits[0].userId !== paidByUserId
                ? personSplits[0]
                : null;
            return (
              <View style={styles.preview}>
                <Text style={styles.previewTitle}>Person Split Preview</Text>
                <View style={styles.previewRow}>
                  <Text style={styles.previewFamily}>Paid by</Text>
                  <Text style={styles.previewFamily}>{payer?.profile?.full_name ?? 'Selected member'}</Text>
                </View>
                {singleOther ? (
                  <View style={styles.previewRow}>
                    <Text style={styles.previewFamily}>{singleOther.userName} owes</Text>
                    <CurrencyAmount amount={amt} currency={displayCurrency} />
                  </View>
                ) : (
                  personSplits.map((s) => (
                    <View key={s.userId} style={styles.previewRow}>
                      <Text style={styles.previewFamily}>{s.userName}</Text>
                      <CurrencyAmount amount={s.shareAmount} currency={displayCurrency} />
                    </View>
                  ))
                )}
                <Text style={styles.previewNote}>
                  Person settlements appear separately from family settlements.
                </Text>
              </View>
            );
          }
          const paidByFamily = families.find((f) => f.id === paidByFamilyId);
          const isPersonal =
            selectedFamilies.length === 1 && selectedFamilies[0] === paidByFamilyId;
          const isSingleOther =
            selectedFamilies.length === 1 && selectedFamilies[0] !== paidByFamilyId;
          const soloFamily = isSingleOther
            ? families.find((f) => f.id === selectedFamilies[0])
            : null;

          if (isPersonal && !isNaN(amt) && amt > 0) {
            return (
              <View style={[styles.preview, styles.previewPersonal]}>
                <Text style={styles.previewPersonalIcon}>🏠</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.previewPersonalTitle}>Personal expense</Text>
                  <Text style={styles.previewPersonalSub}>
                    Only {paidByFamily?.name ?? 'this family'} — no balance impact on anyone else
                  </Text>
                </View>
              </View>
            );
          }

          if (isSingleOther && soloFamily && paidByFamily && !isNaN(amt) && amt > 0) {
            return (
              <View style={[styles.preview, styles.previewOwes]}>
                <Text style={styles.previewOwesIcon}>💳</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.previewOwesTitle}>
                    {soloFamily.name} will owe {paidByFamily.name}
                  </Text>
                  <Text style={styles.previewOwesSub}>
                    Full amount: {displayCurrency}{amt.toFixed(2)}
                  </Text>
                </View>
              </View>
            );
          }

          if (splits.length > 0) {
            return (
              <View style={styles.preview}>
                <Text style={styles.previewTitle}>Split Preview</Text>
                {splits.filter((s) => s.shareAmount > 0).map((s) => (
                  <View key={s.familyId} style={styles.previewRow}>
                    <Text style={styles.previewFamily}>{s.familyName}</Text>
                    <CurrencyAmount amount={s.shareAmount} currency={displayCurrency} />
                  </View>
                ))}
              </View>
            );
          }

          return null;
        })()}

        <AppTextInput
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Optional notes..."
          multiline
        />

        {canEdit ? (
          <>
            <AppButton title={isEdit ? 'Save Changes' : 'Add Expense'} onPress={handleSave} loading={loading} fullWidth />
            {isEdit && (
              <AppButton
                title="Delete Expense"
                onPress={handleDelete}
                variant="danger"
                fullWidth
                style={{ marginTop: Spacing.sm }}
              />
            )}
            {isEdit && isTripOrganizer && expenseIsDeleted ? (
              <AppButton
                title="Permanently Delete"
                onPress={handlePermanentDelete}
                variant="danger"
                fullWidth
                style={{ marginTop: Spacing.xs }}
              />
            ) : null}
          </>
        ) : (
          <View style={styles.readOnlyBanner}>
            <Text style={styles.readOnlyText}>
              View only — only involved people or the trip organizer can edit this.
            </Text>
            {isEdit && expenseIsDeleted && (
              <Text style={[styles.readOnlyText, { marginTop: 4 }]}>
                This expense has been deleted and can only be restored by the organizer.
              </Text>
            )}
          </View>
        )}
    </FormKeyboardView>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.md },
  scanPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  scanCopy: { flex: 1 },
  scanTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semiBold,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  scanText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  scanButton: {
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  scanButtonText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  chipScroller: {
    flexGrow: 0,
    marginBottom: Spacing.md,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  chipRow: {
    minHeight: 58,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: Spacing.sm,
    backgroundColor: Colors.surface,
    gap: Spacing.xs,
    minHeight: 48,
    justifyContent: 'center',
  },
  catIcon: { fontSize: 16 },
  catLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center' },
  famChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: Spacing.sm,
    backgroundColor: Colors.surface,
    gap: Spacing.xs,
    minHeight: 48,
  },
  famChipIncluded: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  famChipExcluded: { borderColor: Colors.border, backgroundColor: Colors.background, opacity: 0.6 },
  famChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  famDot: { width: 10, height: 10, borderRadius: 5 },
  famChipText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  famChipTextActive: { color: Colors.primary, fontWeight: FontWeight.semiBold },
  famChipTextExcluded: { color: Colors.textSecondary, textDecorationLine: 'line-through' },
  excludedX: { fontSize: 10, color: Colors.textSecondary, marginLeft: 2 },
  appliesToSection: { marginBottom: Spacing.md },
  appliesToHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  appliesToShortcuts: { flexDirection: 'row', gap: Spacing.md },
  shortcutText: { fontSize: FontSize.sm, color: Colors.secondary, fontWeight: FontWeight.semiBold },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.surface,
    gap: Spacing.md,
  },
  methodRowActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  radioActive: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  methodLabel: { fontSize: FontSize.md, color: Colors.textSecondary },
  methodLabelActive: { color: Colors.primary, fontWeight: FontWeight.medium },
  methodDesc: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  selectAllText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.semiBold },
  noFamilyWarning: { fontSize: FontSize.sm, color: Colors.danger, marginTop: Spacing.xs },
  scopeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  scopeBtn: {
    flex: 1,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    alignItems: 'center',
  },
  scopeBtnActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  scopeBtnText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semiBold,
  },
  scopeBtnTextActive: { color: Colors.primary },
  noFamiliesPanel: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  noFamiliesTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semiBold,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  noFamiliesText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  noFamiliesActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  createFamilyBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  createFamilyBtnText: {
    color: Colors.surface,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
  },
  personModePill: {
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  personModePillText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
  },
  personDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personDotMuted: { backgroundColor: Colors.border },
  personDotText: {
    color: Colors.surface,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  preview: {
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  previewTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
    color: Colors.primary,
    marginBottom: Spacing.sm,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  previewFamily: { fontSize: FontSize.sm, color: Colors.text },
  previewNote: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: Spacing.xs },
  previewPersonal: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.success + '18',
    gap: Spacing.sm,
  },
  previewPersonalIcon: { fontSize: 22 },
  previewPersonalTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold, color: Colors.success },
  previewPersonalSub: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  previewOwes: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.warning + '18',
    gap: Spacing.sm,
  },
  previewOwesIcon: { fontSize: 22 },
  previewOwesTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold, color: Colors.warning },
  previewOwesSub: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  receiptRow: { marginBottom: Spacing.md },
  receiptRowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xs },
  receiptLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.text },
  receiptRemove: { fontSize: FontSize.xs, color: Colors.danger, fontWeight: FontWeight.semiBold },
  receiptThumb: { width: '100%', height: 160, borderRadius: Radius.md, backgroundColor: Colors.border },
  receiptTapHint: { fontSize: FontSize.xs, color: Colors.textSecondary, textAlign: 'center', marginTop: 4 },
  receiptModal: { flex: 1, backgroundColor: '#000' },
  receiptModalClose: { padding: Spacing.md, alignSelf: 'flex-end' },
  receiptModalCloseText: { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.semiBold },
  receiptFullImage: { flex: 1, width: '100%' },
  readOnlyBanner: {
    backgroundColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  readOnlyText: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center' },
});
