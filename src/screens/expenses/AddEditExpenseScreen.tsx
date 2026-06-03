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
import {
  Colors, FontSize, FontWeight, Spacing, Radius,
  CATEGORY_ICONS, CATEGORY_COLORS,
} from '../../constants/theme';

type Props = NativeStackScreenProps<MainStackParamList, 'AddEditExpense'>;

const CATEGORIES: ExpenseCategory[] = [
  'lodging', 'groceries', 'gas', 'restaurant', 'activity', 'tickets', 'parking', 'tolls', 'supplies', 'other',
];

const SPLIT_METHODS: { value: SplitMethod; label: string }[] = [
  { value: 'equal_by_family', label: 'Equal by family' },
  { value: 'equal_by_person', label: 'Equal by person' },
  { value: 'adults_only', label: 'Adults only' },
  { value: 'children_count_half', label: 'Children count half' },
  { value: 'selected_families_only', label: 'Selected families' },
];

export function AddEditExpenseScreen({ navigation, route }: Props) {
  const { tripId, expenseId, scannedExpense } = route.params;
  const { families, currentTrip, userFamily } = useTripContext();
  const { user, isDemoMode } = useAuth();
  const isEdit = !!expenseId;

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('other');
  const [paidByFamilyId, setPaidByFamilyId] = useState(userFamily?.id ?? families[0]?.id ?? '');
  const [splitMethod, setSplitMethod] = useState<SplitMethod>('equal_by_family');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [selectedFamilies, setSelectedFamilies] = useState<string[]>(families.map((f) => f.id));
  const [splits, setSplits] = useState<FamilySplitShare[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEdit);

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
      if (data.split_method === 'selected_families_only' && data.expense_splits?.length) {
        setSelectedFamilies(
          data.expense_splits.filter((s) => s.share_amount > 0).map((s) => s.family_id)
        );
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
    if (splitMethod === 'selected_families_only' && selectedFamilies.length === 0) {
      Alert.alert('Error', 'Select at least one family for the split.'); return;
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

        <AppTextInput label="Title *" value={title} onChangeText={setTitle} placeholder="Grocery run at Mercado..." />
        <AppTextInput
          label="Amount *"
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          keyboardType="decimal-pad"
        />
        <AppTextInput
          label="Date"
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          keyboardType="numbers-and-punctuation"
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

        {/* Split method */}
        <Text style={styles.label}>Split Method</Text>
        {SPLIT_METHODS.map((m) => (
          <TouchableOpacity
            key={m.value}
            style={[styles.methodRow, splitMethod === m.value && styles.methodRowActive]}
            onPress={() => setSplitMethod(m.value)}
          >
            <View style={[styles.radio, splitMethod === m.value && styles.radioActive]} />
            <Text style={[styles.methodLabel, splitMethod === m.value && styles.methodLabelActive]}>
              {m.label}
            </Text>
          </TouchableOpacity>
        ))}

        {/* Selected families for 'selected_families_only' */}
        {splitMethod === 'selected_families_only' && (
          <View style={styles.selectedFamilies}>
            <View style={styles.selectedFamiliesHeader}>
              <Text style={styles.label}>Split between which families</Text>
              <TouchableOpacity
                onPress={() =>
                  setSelectedFamilies(
                    selectedFamilies.length === families.length ? [] : families.map((f) => f.id)
                  )
                }
              >
                <Text style={styles.selectAllText}>
                  {selectedFamilies.length === families.length ? 'Deselect all' : 'Select all'}
                </Text>
              </TouchableOpacity>
            </View>
            {families.map((f) => (
              <TouchableOpacity
                key={f.id}
                style={styles.checkRow}
                onPress={() =>
                  setSelectedFamilies((prev) =>
                    prev.includes(f.id) ? prev.filter((id) => id !== f.id) : [...prev, f.id]
                  )
                }
              >
                <View style={[styles.checkbox, selectedFamilies.includes(f.id) && styles.checkboxActive]}>
                  {selectedFamilies.includes(f.id) && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <View style={[styles.famDot, { backgroundColor: f.color ?? Colors.primary }]} />
                <Text style={styles.checkLabel}>{f.name}</Text>
              </TouchableOpacity>
            ))}
            {selectedFamilies.length === 0 && (
              <Text style={styles.noFamilyWarning}>Select at least one family</Text>
            )}
          </View>
        )}

        {/* Split Preview */}
        {splits.length > 0 && (
          <View style={styles.preview}>
            <Text style={styles.previewTitle}>Split Preview</Text>
            {splits.map((s) => (
              <View key={s.familyId} style={styles.previewRow}>
                <Text style={styles.previewFamily}>{s.familyName}</Text>
                <CurrencyAmount amount={s.shareAmount} currency={currentTrip?.currency ?? '$'} />
              </View>
            ))}
          </View>
        )}

        <AppTextInput
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Optional notes..."
          multiline
        />

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
  famChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  famDot: { width: 10, height: 10, borderRadius: 5 },
  famChipText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  famChipTextActive: { color: Colors.primary, fontWeight: FontWeight.semiBold },
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
  selectedFamilies: { marginBottom: Spacing.md },
  selectedFamiliesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  selectAllText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.semiBold },
  noFamilyWarning: { fontSize: FontSize.sm, color: Colors.danger, marginTop: Spacing.xs },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    gap: Spacing.md,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: Radius.sm,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  checkmark: { color: Colors.surface, fontSize: 13, fontWeight: FontWeight.bold },
  checkLabel: { fontSize: FontSize.md, color: Colors.text },
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
});
