import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MainStackParamList, Expense, ExpenseCategory } from '../../types';
import { useTripContext } from '../../contexts/TripContext';
import { expenseService } from '../../services/expenseService';
import { useAuth } from '../../contexts/AuthContext';
import { demoExpenses } from '../../lib/mockData';
import { ExpenseCard } from '../../components/ExpenseCard';
import { LoadingView } from '../../components/LoadingView';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Colors, FontSize, FontWeight, Spacing, Radius, CATEGORY_ICONS } from '../../constants/theme';

type Nav = NativeStackNavigationProp<MainStackParamList>;

const FILTERS: { label: string; value: ExpenseCategory | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: '🏨 Lodging', value: 'lodging' },
  { label: '🛒 Grocery', value: 'groceries' },
  { label: '⛽ Gas', value: 'gas' },
  { label: '🍽️ Restaurant', value: 'restaurant' },
  { label: '🎯 Activity', value: 'activity' },
  { label: '💸 Other', value: 'other' },
];

export function ExpensesListScreen({ route }: { route: { params: { tripId: string } } }) {
  const navigation = useNavigation<Nav>();
  const { tripId } = route.params;
  const { currentTrip, canManageTrip } = useTripContext();
  const { isDemoMode } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<ExpenseCategory | 'all'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'family' | 'amount'>('date');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

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

  if (loading) return <LoadingView />;
  if (error) return <ErrorState message={error} onRetry={loadExpenses} />;

  const filtered = (filter === 'all' ? expenses : expenses.filter((e) => e.category === filter))
    .slice()
    .sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'date')   cmp = a.date.localeCompare(b.date);
      if (sortBy === 'amount') cmp = a.amount - b.amount;
      if (sortBy === 'family') cmp = (a.paid_by_family?.name ?? '').localeCompare(b.paid_by_family?.name ?? '');
      return sortDir === 'asc' ? cmp : -cmp;
    });
  const total = filtered.reduce((s, e) => s + e.amount, 0);

  function handleSort(by: 'date' | 'family' | 'amount') {
    if (sortBy === by) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(by); setSortDir('desc'); }
  }

  const sortArrow = (by: typeof sortBy) =>
    sortBy === by ? (sortDir === 'desc' ? ' ▼' : ' ▲') : '';

  return (
    <View style={styles.container}>
      {/* Summary header */}
      <View style={styles.header}>
        <View style={styles.totalBlock}>
          <Text style={styles.totalLabel}>Total Expenses</Text>
          <Text style={styles.totalAmount} numberOfLines={1} adjustsFontSizeToFit>
            {currentTrip?.currency} {total.toFixed(2)}
          </Text>
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
      <FlatList
        horizontal
        data={FILTERS}
        keyExtractor={(item) => item.value}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.filterChip, filter === item.value && styles.filterChipActive]}
            onPress={() => setFilter(item.value)}
          >
            <Text style={[styles.filterText, filter === item.value && styles.filterTextActive]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.filterList}
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
      />

      {/* Sort bar */}
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
        <Text style={styles.sortCount}>{filtered.length} item{filtered.length !== 1 ? 's' : ''}</Text>
      </View>

      {/* Expense list */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ExpenseCard
            expense={item}
            onPress={() => navigation.navigate('AddEditExpense', { tripId, expenseId: item.id })}
          />
        )}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadExpenses(); }}
            tintColor={Colors.primary}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="💰"
            title="No expenses yet"
            subtitle={canManageTrip ? 'Add your first expense to start tracking costs fairly.' : 'Expenses added by admins will appear here.'}
            actionLabel={canManageTrip ? 'Add Expense' : undefined}
            onAction={canManageTrip ? () => navigation.navigate('AddEditExpense', { tripId }) : undefined}
          />
        }
      />
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
  filterBar: { maxHeight: 50, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  filterList: { paddingHorizontal: Spacing.md, alignItems: 'center' },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    marginRight: Spacing.sm,
  },
  filterChipActive: { backgroundColor: Colors.primaryLight },
  filterText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  filterTextActive: { color: Colors.primary, fontWeight: FontWeight.semiBold },
  sortBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
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
  list: { padding: Spacing.md, flexGrow: 1 },
});
