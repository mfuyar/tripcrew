import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainStackParamList, ExpenseCategory, SplitMethod, FamilySplitShare } from '../../types';
import { useTripContext } from '../../contexts/TripContext';
import { useAuth } from '../../contexts/AuthContext';
import { expenseService } from '../../services/expenseService';
import { calculateExpenseSplits } from '../../utils/calculations';
import { AppTextInput } from '../../components/AppTextInput';
import { AppButton } from '../../components/AppButton';
import { CurrencyAmount } from '../../components/CurrencyAmount';
import { FormKeyboardView } from '../../components/FormKeyboardView';
import { DatePickerField } from '../../components/DatePickerField';
import { parseDate } from '../../utils/dateUtils';
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

export function AddEditExpenseScreen({ navigation, route }: Props) {
  const { tripId, expenseId, scannedExpense } = route.params;
  const { families, currentTrip, userFamily, canManageTrip } = useTripContext();
  const { user, isDemoMode } = useAuth();
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
  const [splits, setSplits] = useState<FamilySplitShare[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEdit);
  // For edit mode: whether the current user can modify this expense
  const [canEdit, setCanEdit] = useState(!isEdit); // new expenses: always editable by creator

  useEffect(() => {
    if (families.length > 0 && !paidByFamilyId) {
      setPaidByFamilyId(userFamily?.id ?? families[0].id);
      setSelectedFamilies(families.map((f) => f.id));
    }
  }, [families]);

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
      setPaidByFamilyId(data.paid_by_family_id);
      setSplitMethod(data.split_method);
      setDate(data.date);
      setNotes(data.notes ?? '');
      setCanEdit(canManageTrip || data.paid_by_user_id === user?.id);
      if (data.split_method === 'selected_families_only' && data.expense_splits?.length) {
        const included = data.expense_splits.filter((s) => s.share_amount > 0).map((s) => s.family_id);
        setSelectedFamilies(included);
        setBaseSplitMethod('equal_by_family');
      } else {
        setBaseSplitMethod(data.split_method as SplitMethod);
      }
    }
    setFetching(false);
  }

  // Recalculate preview whenever relevant fields change
  useEffect(() => {
    const amt = parseFloat(amount);
    if (!isNaN(amt) && amt > 0 && families.length > 0) {
      const opts =
        splitMethod === 'selected_families_only'
          ? { selectedFamilyIds: selectedFamilies }
          : undefined;
      const result = calculateExpenseSplits(amt, families, splitMethod, opts);
      setSplits(result);
    } else {
      setSplits([]);
    }
  }, [amount, splitMethod, families, selectedFamilies]);

  async function handleSave() {
    if (!title.trim()) { Alert.alert('Error', 'Please enter a title.'); return; }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { Alert.alert('Error', 'Please enter a valid amount.'); return; }
    if (!paidByFamilyId) { Alert.alert('Error', 'Please select who paid.'); return; }
    if (selectedFamilies.length === 0) {
      Alert.alert('Error', 'Select at least one family under "Applies to".'); return;
    }
    if (!user || isDemoMode) { Alert.alert('Demo Mode', 'Adding expenses is disabled in demo.'); return; }

    setLoading(true);
    const payload = {
      title: title.trim(),
      amount: amt,
      currency: currentTrip?.currency ?? 'USD',
      category,
      paid_by_family_id: paidByFamilyId,
      split_method: splitMethod,
      date,
      notes: notes.trim() || undefined,
    };

    if (isEdit) {
      const { error } = await expenseService.updateExpense(expenseId!, payload);
      if (!error) {
        const splitResult = await expenseService.saveExpenseSplits(expenseId!, tripId, splits);
        if (splitResult.error) Alert.alert('Error', splitResult.error);
        else navigation.goBack();
      } else {
        Alert.alert('Error', error);
      }
    } else {
      const { data, error } = await expenseService.createExpense(tripId, user.id, payload);
      if (!error && data) {
        const splitResult = await expenseService.saveExpenseSplits(data.id, tripId, splits);
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
    if (!expenseId) return;
    Alert.alert('Delete Expense', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await expenseService.deleteExpense(expenseId);
          navigation.goBack();
        },
      },
    ]);
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.catChip, category === cat && { backgroundColor: CATEGORY_COLORS[cat] + '30', borderColor: CATEGORY_COLORS[cat] }]}
              onPress={() => setCategory(cat)}
            >
              <Text style={styles.catIcon}>{CATEGORY_ICONS[cat]}</Text>
              <Text style={[styles.catLabel, category === cat && { color: CATEGORY_COLORS[cat], fontWeight: FontWeight.semiBold }]}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Paid by */}
        <Text style={styles.label}>Paid by</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
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
              {/* "Just for us" — sets Applies To = payer family only */}
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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
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

        {/* Split Preview */}
        {(() => {
          const amt = parseFloat(amount);
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
                    Full amount: {currentTrip?.currency} {amt.toFixed(2)}
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
                    <CurrencyAmount amount={s.shareAmount} currency={currentTrip?.currency ?? '$'} />
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
          </>
        ) : (
          <View style={styles.readOnlyBanner}>
            <Text style={styles.readOnlyText}>View only — only the expense creator or an admin can edit this.</Text>
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
  chipRow: { flexDirection: 'row', marginBottom: Spacing.md },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: Spacing.sm,
    backgroundColor: Colors.surface,
    gap: Spacing.xs,
  },
  catIcon: { fontSize: 14 },
  catLabel: { fontSize: FontSize.sm, color: Colors.textSecondary },
  famChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: Spacing.sm,
    backgroundColor: Colors.surface,
    gap: Spacing.xs,
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
  readOnlyBanner: {
    backgroundColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  readOnlyText: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center' },
});
