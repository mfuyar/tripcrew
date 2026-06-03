import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainStackParamList, FamilyBalance } from '../../types';
import { useTripContext } from '../../contexts/TripContext';
import { useAuth } from '../../contexts/AuthContext';
import { expenseService } from '../../services/expenseService';
import { demoExpenses } from '../../lib/mockData';
import { calculateFamilyBalances, calculateSettlements } from '../../utils/calculations';
import { LoadingView } from '../../components/LoadingView';
import { FamilyAvatar } from '../../components/FamilyAvatar';
import { CurrencyAmount } from '../../components/CurrencyAmount';
import { AppButton } from '../../components/AppButton';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../constants/theme';

type Props = NativeStackScreenProps<MainStackParamList, 'Balances'>;

export function BalancesScreen({ navigation, route }: Props) {
  const { tripId } = route.params;
  const { families, currentTrip, canManageTrip } = useTripContext();
  const { isDemoMode } = useAuth();
  const [balances, setBalances] = useState<FamilyBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function loadBalances() {
    const expenses = isDemoMode
      ? demoExpenses
      : (await expenseService.getExpenses(tripId)).data ?? [];
    const result = calculateFamilyBalances(expenses, families);
    setBalances(result);
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => { loadBalances(); }, [tripId, families]);

  if (loading) return <LoadingView />;

  const totalExpenses = balances.reduce((s, b) => s + b.totalPaid, 0);
  const currency = currentTrip?.currency ?? '$';

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
        <Text style={styles.summaryAmount}>{currency} {totalExpenses.toFixed(2)}</Text>
        <Text style={styles.summaryFamilies}>{families.length} families</Text>
      </View>

      {/* Per-family balances */}
      <Text style={styles.sectionTitle}>Family Balances</Text>
      {balances.map((b) => {
        const family = families.find((f) => f.id === b.familyId);
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
                <Text style={styles.breakdownValue}>{currency} {b.totalPaid.toFixed(2)}</Text>
              </View>
              <View style={styles.breakdownDivider} />
              <View style={styles.breakdownItem}>
                <Text style={styles.breakdownLabel}>Owed</Text>
                <Text style={styles.breakdownValue}>{currency} {b.totalOwed.toFixed(2)}</Text>
              </View>
              <View style={styles.breakdownDivider} />
              <View style={styles.breakdownItem}>
                <Text style={styles.breakdownLabel}>Balance</Text>
                <Text style={[styles.breakdownValue, { color: b.balance >= 0 ? Colors.success : Colors.danger }]}>
                  {b.balance >= 0 ? '+' : ''}{currency} {b.balance.toFixed(2)}
                </Text>
              </View>
            </View>
          </View>
        );
      })}

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
  settleBtn: { marginTop: Spacing.md },
});
