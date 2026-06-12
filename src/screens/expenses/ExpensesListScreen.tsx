import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MainStackParamList, Expense, ExpenseCategory } from '../../types';
import { useTripContext } from '../../contexts/TripContext';
import { expenseService } from '../../services/expenseService';
import { useAuth } from '../../contexts/AuthContext';
import { currencySymbol } from '../../utils/currency';
import { canViewSelfOnlyExpense, isSelfOnlyExpense } from '../../utils/expenseVisibility';
import { demoExpenses } from '../../lib/mockData';
import { ExpenseCard } from '../../components/ExpenseCard';
import { LoadingView } from '../../components/LoadingView';
import { supabase } from '../../lib/supabaseClient';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Colors, FontSize, FontWeight, Spacing, Radius, CATEGORY_ICONS, Shadow } from '../../constants/theme';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type ExpenseViewFilter = 'all' | 'family' | 'private' | 'person';

const FILTERS: { label: string; value: ExpenseCategory | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: '🏨 Lodging', value: 'lodging' },
  { label: '🛒 Grocery', value: 'groceries' },
  { label: '⛽ Gas', value: 'gas' },
  { label: '🍽️ Restaurant', value: 'restaurant' },
  { label: '🎯 Activity', value: 'activity' },
  { label: '💸 Other', value: 'other' },
];

const VIEW_FILTERS: { label: string; value: ExpenseViewFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Family', value: 'family' },
  { label: 'Personal', value: 'private' },
  { label: 'Person split', value: 'person' },
];

function expenseShareForViewer(
  expense: Expense,
  userId: string | undefined,
  userFamilyId: string | undefined,
  canSeeAllExpenses: boolean
): number {
  if (canSeeAllExpenses) return expense.amount;

  if (expense.paid_by_family_id) {
    const familyShare = expense.expense_splits?.find((split) => split.family_id === userFamilyId);
    return familyShare?.share_amount ?? 0;
  }

  const personShare = expense.expense_person_splits?.find((split) => split.user_id === userId);
  return personShare?.share_amount ?? 0;
}

export function ExpensesListScreen({ route }: { route: { params: { tripId: string } } }) {
  const navigation = useNavigation<Nav>();
  const { width } = useWindowDimensions();
  const { tripId } = route.params;
  const { currentTrip, canManageTrip, isTripOrganizer, userFamily } = useTripContext();
  const { isDemoMode, user, isGlobalAdmin } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<ExpenseCategory | 'all'>('all');
  const [viewFilter, setViewFilter] = useState<ExpenseViewFilter>('all');
  const [sortBy, setSortBy] = useState<'date' | 'family' | 'amount'>('date');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [showFamilyTotals, setShowFamilyTotals] = useState(false);
  const [deletedExpenses, setDeletedExpenses] = useState<Expense[]>([]);
  const [showDeleted, setShowDeleted] = useState(false);
  const [loadingDeleted, setLoadingDeleted] = useState(false);

  const loadExpenses = useCallback(async () => {
    if (isDemoMode) {
      setExpenses(demoExpenses);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const { data, error: e } = await expenseService.getExpenses(tripId);
    if (e) setError(e);
    else setExpenses(data ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [tripId, isDemoMode]);

  useFocusEffect(
    useCallback(() => {
      loadExpenses();
    }, [loadExpenses])
  );

  useEffect(() => {
    if (isDemoMode) return undefined;

    const channel = supabase
      .channel(`expenses-trip-${tripId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'expenses', filter: `trip_id=eq.${tripId}` },
        () => {
          void loadExpenses();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tripId, isDemoMode, loadExpenses]);

  if (loading) return <LoadingView />;
  if (error) return <ErrorState message={error} onRetry={loadExpenses} />;

  const tripExpenses = expenses.filter((e) => !isSelfOnlyExpense(e));
  const privateSelfExpenses = expenses.filter((e) =>
    isSelfOnlyExpense(e) &&
    canViewSelfOnlyExpense(e, user?.id, userFamily?.id, isTripOrganizer || isGlobalAdmin)
  );
  const familyExpenses = tripExpenses.filter((e) => e.paid_by_family_id);
  const visiblePersonExpenses = expenses.filter((e) =>
    !e.paid_by_family_id &&
    !isSelfOnlyExpense(e) &&
    (isTripOrganizer || isGlobalAdmin || e.paid_by_user_id === user?.id || e.expense_person_splits?.some((split) => split.user_id === user?.id))
  );
  const matchesCategory = (expense: Expense) => filter === 'all' || expense.category === filter;
  const sortExpenses = (items: Expense[]) =>
    items.slice().sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'date')   cmp = a.date.localeCompare(b.date);
      if (sortBy === 'amount') cmp = a.amount - b.amount;
      if (sortBy === 'family') {
        const payerA = a.paid_by_family?.name ?? a.paid_by_profile?.full_name ?? '';
        const payerB = b.paid_by_family?.name ?? b.paid_by_profile?.full_name ?? '';
        cmp = payerA.localeCompare(payerB);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  const filteredFamilyExpenses = sortExpenses(familyExpenses.filter(matchesCategory));
  const filteredPrivateExpenses = sortExpenses(privateSelfExpenses.filter(matchesCategory));
  const filteredPersonExpenses = sortExpenses(visiblePersonExpenses.filter(matchesCategory));
  const showFamilyExpenses = viewFilter === 'all' || viewFilter === 'family';
  const showPrivateExpenses = viewFilter === 'all' || viewFilter === 'private';
  const showPersonExpenses = viewFilter === 'all' || viewFilter === 'person';
  const visibleExpenseCount =
    (showFamilyExpenses ? filteredFamilyExpenses.length : 0) +
    (showPrivateExpenses ? filteredPrivateExpenses.length : 0) +
    (showPersonExpenses ? filteredPersonExpenses.length : 0);
  const canSeeAllExpenseTotals = isTripOrganizer || isGlobalAdmin;
  const relatedExpenses = expenses.filter((e) => {
    if (canSeeAllExpenseTotals) return !isSelfOnlyExpense(e);
    if (isSelfOnlyExpense(e)) return canViewSelfOnlyExpense(e, user?.id, userFamily?.id, false);
    if (e.paid_by_family_id) {
      return e.paid_by_family_id === userFamily?.id
        || e.expense_splits?.some((split) => split.family_id === userFamily?.id && split.share_amount > 0) === true;
    }
    return e.paid_by_user_id === user?.id
      || e.expense_person_splits?.some((split) => split.user_id === user?.id && split.share_amount > 0) === true;
  });
  const total = relatedExpenses.reduce(
    (sum, expense) => sum + expenseShareForViewer(expense, user?.id, userFamily?.id, canSeeAllExpenseTotals),
    0
  );

  // Organizers/admins see the trip-wide total above, which excludes private
  // expenses entirely (including their own). Surface their personal total —
  // their share of trip expenses plus their own private spending — so a
  // private expense the organizer added doesn't disappear from view.
  const yourPrivateTotal = canSeeAllExpenseTotals && privateSelfExpenses.length > 0
    ? expenses
        .filter((e) => {
          if (isSelfOnlyExpense(e)) return canViewSelfOnlyExpense(e, user?.id, userFamily?.id, false);
          if (e.paid_by_family_id) {
            return e.paid_by_family_id === userFamily?.id
              || e.expense_splits?.some((split) => split.family_id === userFamily?.id && split.share_amount > 0) === true;
          }
          return e.paid_by_user_id === user?.id
            || e.expense_person_splits?.some((split) => split.user_id === user?.id && split.share_amount > 0) === true;
        })
        .reduce((sum, expense) => sum + expenseShareForViewer(expense, user?.id, userFamily?.id, false), 0)
    : null;
  const horizontalPadding = Spacing.md * 2;
  const categoryGap = Spacing.xs;
  const categoryChipMinWidth = Math.floor((width - horizontalPadding - categoryGap * 2) / 3);
  const hasVisibleExpenses = visibleExpenseCount > 0;

  function handleSort(by: 'date' | 'family' | 'amount') {
    if (sortBy === by) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(by); setSortDir('desc'); }
  }

  const sortArrow = (by: typeof sortBy) =>
    sortBy === by ? (sortDir === 'desc' ? ' ▼' : ' ▲') : '';

  // Family totals — group ALL expenses (not just filtered) by paying family
  const familyTotals = Object.values(
    familyExpenses.reduce<Record<string, { name: string; color?: string; total: number; count: number }>>((acc, e) => {
      const id = e.paid_by_family_id;
      if (!id) return acc;
      const name = e.paid_by_family?.name ?? 'Unknown';
      const color = e.paid_by_family?.color;
      if (!acc[id]) acc[id] = { name, color, total: 0, count: 0 };
      acc[id].total += e.amount;
      acc[id].count += 1;
      return acc;
    }, {})
  ).sort((a, b) => b.total - a.total);

  return (
    <View style={styles.container}>
      {/* Summary header */}
      <View style={styles.header}>
        <View style={styles.totalBlock}>
          <Text style={styles.totalLabel}>{canSeeAllExpenseTotals ? 'Total Expenses' : 'Your Expenses'}</Text>
          <Text style={styles.totalAmount} numberOfLines={1} adjustsFontSizeToFit>
            {currencySymbol(currentTrip?.currency)}{total.toFixed(2)}
          </Text>
          {yourPrivateTotal !== null && (
            <Text style={styles.yourTotalHint} numberOfLines={1}>
              Your total (incl. personal): {currencySymbol(currentTrip?.currency)}{yourPrivateTotal.toFixed(2)}
            </Text>
          )}
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.balanceBtn}
            onPress={() => navigation.navigate('Balances', { tripId })}
          >
            <Text style={styles.balanceBtnText}>⚖️ Balances</Text>
          </TouchableOpacity>
          {canManageTrip && (
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => navigation.navigate('AddEditExpense', { tripId })}
            >
              <Text style={styles.addBtnText}>+ Add</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Category filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filterContent}
      >
        {FILTERS.map((item) => (
          <TouchableOpacity
            key={item.value}
            style={[
              styles.filterChip,
              { minWidth: categoryChipMinWidth },
              filter === item.value && styles.filterChipActive,
            ]}
            onPress={() => setFilter(item.value)}
            activeOpacity={0.8}
          >
            <Text style={[styles.filterText, filter === item.value && styles.filterTextActive]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Family Totals */}
      {familyExpenses.length > 0 && (
        <View style={styles.familyTotalsSection}>
          <TouchableOpacity style={styles.familyTotalsHeader} onPress={() => setShowFamilyTotals(v => !v)}>
            <Text style={styles.familyTotalsTitle}>👨‍👩‍👧 Family Totals</Text>
            <Text style={styles.familyTotalsToggle}>{showFamilyTotals ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {showFamilyTotals && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.familyTotalsRow}>
              {familyTotals.map(f => (
                <TouchableOpacity
                  key={f.name}
                  style={styles.familyTotalCard}
                  onPress={() => setSortBy('family')}
                >
                  <View style={[styles.familyDot, { backgroundColor: f.color ?? Colors.primary }]} />
                  <Text style={styles.familyTotalName} numberOfLines={1}>{f.name}</Text>
                  <Text style={styles.familyTotalAmount}>
                    {currencySymbol(currentTrip?.currency)}{f.total.toFixed(2)}
                  </Text>
                  <Text style={styles.familyTotalCount}>{f.count} expense{f.count !== 1 ? 's' : ''}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* Sort bar */}
      <View style={styles.controlsBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.viewFilterContent}>
          {VIEW_FILTERS.map((item) => (
            <TouchableOpacity
              key={item.value}
              style={[styles.viewChip, viewFilter === item.value && styles.viewChipActive]}
              onPress={() => setViewFilter(item.value)}
              activeOpacity={0.8}
            >
              <Text style={[styles.viewChipText, viewFilter === item.value && styles.viewChipTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={styles.sortBar}>
          <Text style={styles.sortLabel}>Sort:</Text>
          {(['date', 'family', 'amount'] as const).map(by => (
            <TouchableOpacity
              key={by}
              style={[styles.sortChip, sortBy === by && styles.sortChipActive]}
              onPress={() => handleSort(by)}
            >
              <Text style={[styles.sortChipText, sortBy === by && styles.sortChipTextActive]}>
                {by.charAt(0).toUpperCase() + by.slice(1)}{sortArrow(by)}
              </Text>
            </TouchableOpacity>
          ))}
          <Text style={styles.sortCount}>{visibleExpenseCount} item{visibleExpenseCount !== 1 ? 's' : ''}</Text>
        </View>
      </View>

      {/* Deleted expenses — organizer only */}
      {isTripOrganizer && (
        <View style={styles.deletedSection}>
          <TouchableOpacity
            style={styles.deletedHeader}
            onPress={async () => {
              if (!showDeleted && deletedExpenses.length === 0) {
                setLoadingDeleted(true);
                const { data, error: e } = await expenseService.getDeletedExpenses(tripId);
                if (e) Alert.alert('Error', e);
                setDeletedExpenses(data ?? []);
                setLoadingDeleted(false);
              }
              setShowDeleted(v => !v);
            }}
          >
            <Text style={styles.deletedTitle}>🗑 Deleted Expenses</Text>
            <Text style={styles.deletedToggle}>{loadingDeleted ? '⏳' : showDeleted ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {showDeleted && deletedExpenses.map(e => (
            <View key={e.id} style={styles.deletedCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.deletedName}>{e.title}</Text>
                <Text style={styles.deletedMeta}>
                  {currencySymbol(currentTrip?.currency)}{e.amount.toFixed(2)} · {e.date}
                  {e.deleted_at ? ` · Deleted ${new Date(e.deleted_at).toLocaleDateString()}` : ''}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.historyBtn}
                onPress={() => navigation.navigate('ExpenseHistory', { expenseId: e.id, tripId })}
              >
                <Text style={styles.historyBtnText}>History</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.historyBtn, styles.permDeleteBtn]}
                onPress={() =>
                  Alert.alert(
                    'Permanently Delete',
                    `Erase "${e.title}" and all its history forever?`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Delete Forever', style: 'destructive',
                        onPress: async () => {
                          await expenseService.deleteExpense(e.id);
                          setDeletedExpenses((prev) => prev.filter((x) => x.id !== e.id));
                        },
                      },
                    ]
                  )
                }
              >
                <Text style={styles.permDeleteText}>Delete Forever</Text>
              </TouchableOpacity>
            </View>
          ))}
          {showDeleted && deletedExpenses.length === 0 && !loadingDeleted && (
            <Text style={styles.deletedEmpty}>No deleted expenses.</Text>
          )}
        </View>
      )}

      <ScrollView
        style={styles.expenseScroll}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadExpenses(); }}
            tintColor={Colors.primary}
          />
        }
      >
        {showFamilyExpenses && filteredFamilyExpenses.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Family expenses</Text>
              <Text style={styles.sectionSubtitle}>Group and family-paid expenses only.</Text>
            </View>
            {filteredFamilyExpenses.map((item) => (
              <View key={item.id}>
                <ExpenseCard
                  expense={item}
                  currency={currencySymbol(currentTrip?.currency)}
                  onPress={() => navigation.navigate('AddEditExpense', { tripId, expenseId: item.id })}
                />
                <View style={styles.versionRow}>
                  {(item.current_version ?? 1) > 1 && (
                    <Text style={styles.versionIndicator}>v{item.current_version}</Text>
                  )}
                  {item.last_edited_at && (
                    <Text style={styles.lastEdited}>
                      Edited {new Date(item.last_edited_at).toLocaleDateString()}
                    </Text>
                  )}
                  {canManageTrip && (item.current_version ?? 1) > 1 && (
                    <TouchableOpacity
                      style={styles.historyInlineBtn}
                      onPress={() => navigation.navigate('ExpenseHistory', { expenseId: item.id, tripId })}
                    >
                      <Text style={styles.historyInlineBtnText}>🕐 History</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
          </>
        )}

        {!hasVisibleExpenses && (
          <EmptyState
            icon="💰"
            title="No expenses yet"
            subtitle={canManageTrip ? 'Add your first family expense to start tracking costs fairly.' : 'Family expenses added by admins will appear here.'}
            actionLabel={canManageTrip ? 'Add Expense' : undefined}
            onAction={canManageTrip ? () => navigation.navigate('AddEditExpense', { tripId }) : undefined}
          />
        )}

        {showPrivateExpenses && filteredPrivateExpenses.length > 0 && (
          <View style={styles.personSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Private spending</Text>
              <Text style={styles.sectionSubtitle}>Only visible to the payer/family and the organizer. Not included in trip totals or settlements.</Text>
            </View>
            {filteredPrivateExpenses.map((item) => (
              <View key={item.id} style={styles.personExpenseCard}>
                <ExpenseCard
                  expense={item}
                  currency={currencySymbol(currentTrip?.currency)}
                  onPress={() => navigation.navigate('AddEditExpense', { tripId, expenseId: item.id })}
                />
              </View>
            ))}
          </View>
        )}

        {showPersonExpenses && filteredPersonExpenses.length > 0 && (
          <View style={styles.personSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Personal expenses</Text>
              <Text style={styles.sectionSubtitle}>Visible only to the people involved and the organizer.</Text>
            </View>
            {filteredPersonExpenses.map((item) => (
              <View key={item.id} style={styles.personExpenseCard}>
                <ExpenseCard
                  expense={item}
                  currency={currencySymbol(currentTrip?.currency)}
                  onPress={() => navigation.navigate('AddEditExpense', { tripId, expenseId: item.id })}
                />
              </View>
            ))}
          </View>
        )}
      </ScrollView>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.primary,
    padding: Spacing.lg,
  },
  totalBlock: { flex: 1, marginRight: Spacing.sm },
  totalLabel: { fontSize: FontSize.sm, color: Colors.surface + 'CC' },
  totalAmount: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.surface },
  yourTotalHint: { fontSize: FontSize.xs, color: Colors.surface + 'CC', marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: Spacing.sm, flexShrink: 0 },
  balanceBtn: {
    backgroundColor: Colors.surface + '22',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  balanceBtnText: { color: Colors.surface, fontSize: FontSize.sm },
  addBtn: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  addBtnText: { color: Colors.primary, fontWeight: FontWeight.semiBold, fontSize: FontSize.sm },
  filterBar: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    maxHeight: 46,
  },
  filterContent: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  filterChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipActive: { backgroundColor: Colors.primaryLight },
  filterText: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center' },
  filterTextActive: { color: Colors.primary, fontWeight: FontWeight.semiBold },
  familyTotalsSection: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  familyTotalsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  familyTotalsTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold, color: Colors.text },
  familyTotalsToggle: { fontSize: FontSize.sm, color: Colors.textSecondary },
  familyTotalsRow: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md },
  familyTotalCard: {
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginRight: Spacing.sm,
    minWidth: 130,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  familyDot: { width: 10, height: 10, borderRadius: 5, marginBottom: 4 },
  familyTotalName: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold, color: Colors.text },
  familyTotalAmount: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.primary, marginTop: 2 },
  familyTotalCount: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  controlsBar: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  viewFilterContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
    gap: Spacing.xs,
  },
  viewChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: Radius.full,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  viewChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  viewChipText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  viewChipTextActive: { color: Colors.primary, fontWeight: FontWeight.semiBold },
  sortBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.sm,
    backgroundColor: Colors.surface,
    gap: Spacing.xs,
  },
  sortLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, marginRight: 2 },
  sortChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  sortChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  sortChipText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  sortChipTextActive: { color: Colors.primary, fontWeight: FontWeight.semiBold },
  sortCount: { marginLeft: 'auto', fontSize: FontSize.xs, color: Colors.textSecondary },
  expenseScroll: { flex: 1 },
  list: { paddingBottom: Spacing.md, flexGrow: 1 },
  sectionHeader: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.xs, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  sectionTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semiBold, color: Colors.text },
  sectionSubtitle: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  personSection: { backgroundColor: Colors.surface, paddingBottom: Spacing.md },
  personExpenseCard: { paddingHorizontal: Spacing.md },
  // Deleted expenses
  deletedSection: { backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  deletedHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  deletedTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold, color: Colors.danger },
  deletedToggle: { fontSize: FontSize.sm, color: Colors.textSecondary },
  deletedCard: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm, gap: Spacing.sm },
  deletedName: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.medium, textDecorationLine: 'line-through' },
  deletedMeta: { fontSize: FontSize.xs, color: Colors.textSecondary },
  deletedEmpty: { padding: Spacing.md, color: Colors.textSecondary, fontSize: FontSize.sm },
  historyBtn: { borderWidth: 1, borderColor: Colors.primary, borderRadius: Radius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 4, marginLeft: Spacing.xs },
  historyBtnText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semiBold },
  permDeleteBtn: { borderColor: Colors.danger },
  permDeleteText: { fontSize: FontSize.xs, color: Colors.danger, fontWeight: FontWeight.semiBold },
  // Version indicator
  versionRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingBottom: Spacing.xs, gap: Spacing.sm },
  versionIndicator: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.bold },
  lastEdited: { fontSize: FontSize.xs, color: Colors.textSecondary, fontStyle: 'italic' },
  historyInlineBtn: { marginLeft: 'auto', borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 2 },
  historyInlineBtnText: { fontSize: FontSize.xs, color: Colors.textSecondary },
});
