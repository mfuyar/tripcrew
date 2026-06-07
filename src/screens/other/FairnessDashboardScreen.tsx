import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTripContext } from '../../contexts/TripContext';
import { useAuth } from '../../contexts/AuthContext';
import { expenseService } from '../../services/expenseService';
import { demoExpenses } from '../../lib/mockData';
import { calculateFairnessMetrics, calculateFamilyBalances } from '../../utils/calculations';
import { FairnessMetrics, FamilyBalance } from '../../types';
import { LoadingView } from '../../components/LoadingView';
import { FamilyAvatar } from '../../components/FamilyAvatar';
import { currencySymbol } from '../../utils/currency';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../constants/theme';

export function FairnessDashboardScreen({ route }: { route: { params: { tripId: string } } }) {
  const { tripId } = route.params;
  const { families, currentTrip } = useTripContext();
  const { isDemoMode } = useAuth();
  const [metrics, setMetrics] = useState<FairnessMetrics | null>(null);
  const [balances, setBalances] = useState<FamilyBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    const expenses = isDemoMode
      ? demoExpenses
      : (await expenseService.getExpenses(tripId)).data ?? [];
    const b = calculateFamilyBalances(expenses, families);
    const m = calculateFairnessMetrics({ expenses, families });
    setBalances(b);
    setMetrics(m);
    setLoading(false);
    setRefreshing(false);
  }

  useFocusEffect(useCallback(() => { load(); }, [tripId, families, isDemoMode]));

  if (loading) return <LoadingView />;

  const totalPaid = balances.reduce((s, b) => s + b.totalPaid, 0);
  const currency = currencySymbol(currentTrip?.currency);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
    >
      <Text style={styles.title}>Fairness Dashboard</Text>
      <Text style={styles.subtitle}>See how expenses are distributed across families</Text>

      {/* Insights */}
      {metrics?.insights && metrics.insights.length > 0 && (
        <View style={styles.insightsCard}>
          <Text style={styles.sectionTitle}>💡 Insights</Text>
          {metrics.insights.map((insight, i) => (
            <View key={i} style={styles.insightRow}>
              <Text style={styles.insightBullet}>•</Text>
              <Text style={styles.insightText}>{insight}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Payment share by family */}
      <Text style={styles.sectionTitle}>Payment Share</Text>
      {metrics?.paymentShareByFamily.map((item) => {
        const family = families.find((f) => f.id === item.familyId);
        return (
          <View key={item.familyId} style={styles.shareCard}>
            <View style={styles.shareRow}>
              <FamilyAvatar name={item.familyName} color={family?.color} size={36} />
              <View style={styles.shareInfo}>
                <Text style={styles.shareName}>{item.familyName}</Text>
                <Text style={styles.shareAmount}>{currency}{item.paid.toFixed(2)}</Text>
              </View>
              <Text style={styles.sharePct}>{item.percentage.toFixed(1)}%</Text>
            </View>
            {/* Bar */}
            <View style={styles.barBg}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${item.percentage}%` as any,
                    backgroundColor: family?.color ?? Colors.primary,
                  },
                ]}
              />
            </View>
          </View>
        );
      })}

      {/* Balance summary */}
      <Text style={[styles.sectionTitle, { marginTop: Spacing.lg }]}>Balance Summary</Text>
      {balances.map((b) => {
        const family = families.find((f) => f.id === b.familyId);
        const isPositive = b.balance >= 0;
        return (
          <View key={b.familyId} style={styles.balCard}>
            <FamilyAvatar name={b.familyName} color={family?.color} size={36} />
            <Text style={styles.balName}>{b.familyName}</Text>
            <Text style={[styles.balAmount, { color: isPositive ? Colors.success : Colors.danger }]}>
              {isPositive ? '+' : ''}{currency}{b.balance.toFixed(2)}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md },
  title: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.text, marginBottom: Spacing.xs },
  subtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.lg },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semiBold, color: Colors.text, marginBottom: Spacing.md },
  insightsCard: { backgroundColor: Colors.primaryLight, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.lg },
  insightRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.xs },
  insightBullet: { color: Colors.primary, fontWeight: FontWeight.bold },
  insightText: { flex: 1, fontSize: FontSize.sm, color: Colors.text, lineHeight: 20 },
  shareCard: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm, ...Shadow.sm },
  shareRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm, gap: Spacing.md },
  shareInfo: { flex: 1 },
  shareName: { fontSize: FontSize.md, fontWeight: FontWeight.medium, color: Colors.text },
  shareAmount: { fontSize: FontSize.sm, color: Colors.textSecondary },
  sharePct: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.primary },
  barBg: { height: 8, backgroundColor: Colors.border, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  balCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm, gap: Spacing.md, ...Shadow.sm },
  balName: { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.medium, color: Colors.text },
  balAmount: { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
});
