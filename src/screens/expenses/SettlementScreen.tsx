import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Alert,
  RefreshControl,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainStackParamList, SettlementCalculation } from '../../types';
import { useTripContext } from '../../contexts/TripContext';
import { useAuth } from '../../contexts/AuthContext';
import { expenseService } from '../../services/expenseService';
import { demoExpenses } from '../../lib/mockData';
import { settlementService } from '../../services/settlementService';
import { calculateFamilyBalances, calculateSettlements } from '../../utils/calculations';
import { LoadingView } from '../../components/LoadingView';
import { EmptyState } from '../../components/EmptyState';
import { FamilyAvatar } from '../../components/FamilyAvatar';
import { AppButton } from '../../components/AppButton';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../constants/theme';

type Props = NativeStackScreenProps<MainStackParamList, 'Settlements'>;

export function SettlementScreen({ navigation, route }: Props) {
  const { tripId } = route.params;
  const { families, currentTrip, canManageTrip } = useTripContext();
  const { isDemoMode } = useAuth();
  const [settlements, setSettlements] = useState<SettlementCalculation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  async function load() {
    const expenses = isDemoMode
      ? demoExpenses
      : (await expenseService.getExpenses(tripId)).data ?? [];
    const balances = calculateFamilyBalances(expenses, families);
    const calcs = calculateSettlements(balances);
    setSettlements(calcs);
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => { load(); }, [tripId, families]);

  async function handleMarkPaid(s: SettlementCalculation) {
    if (isDemoMode) { Alert.alert('Demo Mode', 'Recording payments is disabled in demo.'); return; }
    const key = `${s.fromFamilyId}-${s.toFamilyId}`;
    setSaving(key);
    const { error } = await settlementService.createSettlement(tripId, {
      from_family_id: s.fromFamilyId,
      to_family_id: s.toFamilyId,
      amount: s.amount,
      currency: currentTrip?.currency ?? 'USD',
      notes: undefined,
    });
    setSaving(null);
    if (error) {
      Alert.alert('Error', error);
    } else {
      Alert.alert('Recorded', 'Payment marked as paid. The recipient can confirm it.');
      navigation.navigate('PaymentTracking', { tripId });
    }
  }

  if (loading) return <LoadingView />;

  const currency = currentTrip?.currency ?? '$';

  return (
    <FlatList
      data={settlements}
      keyExtractor={(item) => `${item.fromFamilyId}-${item.toFamilyId}`}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Settlements</Text>
          <Text style={styles.headerSubtitle}>
            {settlements.length === 0
              ? 'All settled up!'
              : `${settlements.length} payment${settlements.length !== 1 ? 's' : ''} needed`}
          </Text>
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          icon="🎉"
          title="All settled up!"
          subtitle="No payments needed. Expenses are balanced."
        />
      }
      renderItem={({ item }) => {
        const key = `${item.fromFamilyId}-${item.toFamilyId}`;
        const fromFamily = families.find((f) => f.id === item.fromFamilyId);
        const toFamily = families.find((f) => f.id === item.toFamilyId);
        return (
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <View style={styles.familySide}>
                <FamilyAvatar name={item.fromFamilyName} color={fromFamily?.color} size={40} />
                <Text style={styles.familyName}>{item.fromFamilyName}</Text>
              </View>
              <View style={styles.middle}>
                <Text style={styles.arrow}>→</Text>
                <Text style={styles.amount}>
                  {currency} {item.amount.toFixed(2)}
                </Text>
              </View>
              <View style={styles.familySide}>
                <FamilyAvatar name={item.toFamilyName} color={toFamily?.color} size={40} />
                <Text style={styles.familyName}>{item.toFamilyName}</Text>
              </View>
            </View>
            <Text style={styles.desc}>
              <Text style={styles.bold}>{item.fromFamilyName}</Text>
              {' pays '}
              <Text style={styles.bold}>{item.toFamilyName}</Text>
            </Text>
            {canManageTrip ? (
              <AppButton
                title="Record Payment"
                onPress={() => handleMarkPaid(item)}
                loading={saving === key}
                fullWidth
                style={styles.payBtn}
              />
            ) : (
              <Text style={styles.viewOnlyNote}>Only admins can record payments</Text>
            )}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.md, flexGrow: 1, backgroundColor: Colors.background },
  header: { marginBottom: Spacing.lg },
  headerTitle: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.text },
  headerSubtitle: { fontSize: FontSize.md, color: Colors.textSecondary, marginTop: Spacing.xs },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.sm,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  familySide: { flex: 1, alignItems: 'center', gap: Spacing.xs },
  familyName: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.text, textAlign: 'center' },
  middle: { alignItems: 'center', paddingHorizontal: Spacing.sm },
  arrow: { fontSize: 20, color: Colors.textSecondary },
  amount: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.primary },
  desc: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.sm },
  bold: { fontWeight: FontWeight.semiBold, color: Colors.text },
  payBtn: { marginTop: Spacing.xs },
  viewOnlyNote: { fontSize: FontSize.xs, color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.sm },
});
