import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainStackParamList, FamilyBalance, Expense, Settlement } from '../../types';
import { useTripContext } from '../../contexts/TripContext';
import { useAuth } from '../../contexts/AuthContext';
import { expenseService } from '../../services/expenseService';
import { settlementService } from '../../services/settlementService';
import { demoExpenses } from '../../lib/mockData';
import { applySettlementsToFamilyBalances, calculateFamilyBalances, calculatePersonBalances } from '../../utils/calculations';
import { LoadingView } from '../../components/LoadingView';
import { currencySymbol } from '../../utils/currency';
import { isSelfOnlyExpense } from '../../utils/expenseVisibility';
import { FamilyAvatar } from '../../components/FamilyAvatar';
import { CurrencyAmount } from '../../components/CurrencyAmount';
import { AppButton } from '../../components/AppButton';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../constants/theme';

type Props = NativeStackScreenProps<MainStackParamList, 'Balances'>;

export function BalancesScreen({ navigation, route }: Props) {
  const { tripId } = route.params;
  const { families, members, currentTrip, canManageTrip, isTripOrganizer } = useTripContext();
  const { isDemoMode, user, isGlobalAdmin } = useAuth();
  const [balances, setBalances] = useState<FamilyBalance[]>([]);
  const [personBalances, setPersonBalances] = useState<ReturnType<typeof calculatePersonBalances>>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedFamily, setExpandedFamily] = useState<string | null>(null);

  async function loadBalances() {
    const [expenseResult, settlementResult] = await Promise.all([
      isDemoMode ? Promise.resolve({ data: demoExpenses }) : expenseService.getExpenses(tripId),
      isDemoMode ? Promise.resolve({ data: [] as Settlement[] }) : settlementService.getSettlements(tripId),
    ]);
    const allExpenses = expenseResult.data ?? [];
    const settlementRecords = settlementResult.data ?? [];
    setExpenses(allExpenses as Expense[]);
    const result = applySettlementsToFamilyBalances(
      calculateFamilyBalances(allExpenses, families),
      settlementRecords
    );
    setBalances(result);
    setPersonBalances(calculatePersonBalances(allExpenses, members));
    setLoading(false);
    setRefreshing(false);
  }

  useFocusEffect(useCallback(() => { loadBalances(); }, [tripId, families, members, isDemoMode]));

  if (loading) return <LoadingView />;

  const totalExpenses = balances.reduce((s, b) => s + b.totalPaid, 0);
  const currency = currencySymbol(currentTrip?.currency);
  const visiblePersonBalances = personBalances.filter((b) =>
    isTripOrganizer || isGlobalAdmin || b.userId === user?.id
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadBalances(); }} tintColor={Colors.primary} />
      }
    >
      {/* Summary */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>Total Trip Expenses</Text>
        <Text style={styles.summaryAmount}>{currency}{totalExpenses.toFixed(2)}</Text>
        <Text style={styles.summaryFamilies}>{families.length} families</Text>
      </View>

      {/* Per-family balances */}
      <Text style={styles.sectionTitle}>Family Balances</Text>
      {balances.map((b) => {
        const family = families.find((f) => f.id === b.familyId);
        const isExpanded = expandedFamily === b.familyId;
        const paidByFamily = expenses.filter((e) => e.paid_by_family_id === b.familyId && !isSelfOnlyExpense(e));
        return (
          <View key={b.familyId} style={styles.balanceCard}>
            <View style={styles.balanceTop}>
              <FamilyAvatar name={b.familyName} color={family?.color} size={44} />
              <View style={styles.balanceInfo}>
                <Text style={styles.balanceName}>{b.familyName}</Text>
                <Text style={styles.balanceSub}>
                  {family?.adults_count ?? 0} adults
                  {(family?.children_count ?? 0) > 0 ? `, ${family?.children_count} kids` : ''}
                </Text>
              </View>
              <CurrencyAmount
                amount={b.balance}
                currency={currency}
                colorCoded
                size="lg"
              />
            </View>
            <View style={styles.balanceBreakdown}>
              <View style={styles.breakdownItem}>
                <Text style={styles.breakdownLabel}>Paid</Text>
                <Text style={styles.breakdownValue}>{currency}{b.totalPaid.toFixed(2)}</Text>
              </View>
              <View style={styles.breakdownDivider} />
              <View style={styles.breakdownItem}>
                <Text style={styles.breakdownLabel}>Owed</Text>
                <Text style={styles.breakdownValue}>{currency}{b.totalOwed.toFixed(2)}</Text>
              </View>
              <View style={styles.breakdownDivider} />
              <View style={styles.breakdownItem}>
                <Text style={styles.breakdownLabel}>Balance</Text>
                <Text style={[styles.breakdownValue, { color: b.balance >= 0 ? Colors.success : Colors.danger }]}>
                  {b.balance >= 0 ? '+' : ''}{currency}{b.balance.toFixed(2)}
                </Text>
              </View>
            </View>

            {/* Expense breakdown — trip admins/organizers only */}
            {canManageTrip && paidByFamily.length > 0 && (
              <>
                <TouchableOpacity
                  style={styles.expandToggle}
                  onPress={() => setExpandedFamily(isExpanded ? null : b.familyId)}
                >
                  <Text style={styles.expandToggleText}>
                    {isExpanded ? '▲ Hide' : '▾ Show'} {paidByFamily.length} expense{paidByFamily.length !== 1 ? 's' : ''} paid by {b.familyName}
                  </Text>
                </TouchableOpacity>
                {isExpanded && (
                  <View style={styles.expenseList}>
                    {paidByFamily.map((exp) => (
                      <View key={exp.id} style={styles.expenseRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.expenseTitle} numberOfLines={1}>{exp.title}</Text>
                          <Text style={styles.expenseDate}>{exp.date}</Text>
                        </View>
                        <Text style={styles.expenseAmount}>{currency}{exp.amount.toFixed(2)}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>
        );
      })}

      {visiblePersonBalances.length > 0 && (
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionTitle}>Person Balances</Text>
          {visiblePersonBalances.map((b) => (
            <View key={b.userId} style={styles.personCard}>
              <View style={styles.personRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.personName}>{b.userName}</Text>
                  <Text style={styles.personMeta}>Paid {currency}{b.totalPaid.toFixed(2)} · Owed {currency}{b.totalOwed.toFixed(2)}</Text>
                </View>
                <Text style={[styles.personBalance, b.balance >= 0 ? styles.positive : styles.negative]}>
                  {b.balance >= 0 ? '+' : ''}{currency}{b.balance.toFixed(2)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {canManageTrip && (
        <AppButton
          title="Calculate Settlements"
          onPress={() => navigation.navigate('Settlements', { tripId })}
          fullWidth
          style={styles.settleBtn}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md },
  summaryCard: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    alignItems: 'center',
  },
  summaryLabel: { fontSize: FontSize.sm, color: Colors.surface + 'CC' },
  summaryAmount: { fontSize: FontSize.xxxl, fontWeight: FontWeight.bold, color: Colors.surface, marginVertical: Spacing.xs },
  summaryFamilies: { fontSize: FontSize.sm, color: Colors.surface + 'CC' },
  sectionBlock: { marginBottom: Spacing.lg },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semiBold,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  balanceCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.sm,
  },
  balanceTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  balanceInfo: { flex: 1, marginLeft: Spacing.md },
  balanceName: { fontSize: FontSize.lg, fontWeight: FontWeight.semiBold, color: Colors.text },
  balanceSub: { fontSize: FontSize.sm, color: Colors.textSecondary },
  balanceBreakdown: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.md,
  },
  breakdownItem: { flex: 1, alignItems: 'center' },
  breakdownLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, marginBottom: 2 },
  breakdownValue: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold, color: Colors.text },
  breakdownDivider: { width: 1, backgroundColor: Colors.border },
  personCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadow.sm,
  },
  personRow: { flexDirection: 'row', alignItems: 'center' },
  personName: { fontSize: FontSize.md, fontWeight: FontWeight.semiBold, color: Colors.text },
  personMeta: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  personBalance: { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  positive: { color: Colors.success },
  negative: { color: Colors.danger },
  settleBtn: { marginTop: Spacing.md },
  expandToggle: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    alignItems: 'center',
  },
  expandToggleText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semiBold },
  expenseList: { marginTop: Spacing.sm, gap: Spacing.xs },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  expenseTitle: { fontSize: FontSize.sm, color: Colors.text, fontWeight: FontWeight.medium },
  expenseDate: { fontSize: FontSize.xs, color: Colors.textSecondary },
  expenseAmount: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold, color: Colors.text },
});
