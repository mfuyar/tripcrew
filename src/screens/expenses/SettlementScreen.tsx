import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Alert,
  RefreshControl,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainStackParamList, PersonSettlementCalculation, Settlement, SettlementCalculation } from '../../types';
import { useFocusEffect } from '@react-navigation/native';
import { useTripContext } from '../../contexts/TripContext';
import { useAuth } from '../../contexts/AuthContext';
import { expenseService } from '../../services/expenseService';
import { demoExpenses } from '../../lib/mockData';
import { settlementService } from '../../services/settlementService';
import {
  calculateFamilyBalances,
  calculatePersonBalances,
  calculatePersonSettlements,
  calculateSettlements,
} from '../../utils/calculations';
import { LoadingView } from '../../components/LoadingView';
import { EmptyState } from '../../components/EmptyState';
import { FamilyAvatar } from '../../components/FamilyAvatar';
import { AppButton } from '../../components/AppButton';
import { currencySymbol } from '../../utils/currency';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../constants/theme';

type Props = NativeStackScreenProps<MainStackParamList, 'Settlements'>;

const STATUS_LABEL: Record<string, string> = {
  proposed: 'Proposed — pending approvals',
  payer_approved: 'Payer approved — awaiting receiver',
  receiver_approved: 'Receiver approved — awaiting payer',
  completed: 'Completed',
  disputed: 'Disputed',
  cancelled: 'Cancelled',
};

export function SettlementScreen({ navigation, route }: Props) {
  const { tripId } = route.params;
  const { families, members, currentTrip, canManageTrip, userFamily, isTripOrganizer } = useTripContext();
  const { isDemoMode, user, isGlobalAdmin } = useAuth();
  const [settlements, setSettlements] = useState<SettlementCalculation[]>([]);
  const [personSettlements, setPersonSettlements] = useState<PersonSettlementCalculation[]>([]);
  const [existingSettlements, setExistingSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  async function load() {
    const [expenseResult, settlementResult] = await Promise.all([
      isDemoMode ? Promise.resolve({ data: demoExpenses }) : expenseService.getExpenses(tripId),
      isDemoMode ? Promise.resolve({ data: [] as Settlement[] }) : settlementService.getSettlements(tripId),
    ]);

    const expenses = expenseResult.data ?? [];
    const existing = settlementResult.data ?? [];
    setExistingSettlements(existing);

    const rawBalances = calculateFamilyBalances(expenses, families);
    const personBalances = calculatePersonBalances(expenses, members);
    const activeSettlements = existing.filter(
      (s) => !s.deleted_at && s.status !== 'cancelled',
    );
    const adjustedBalances = rawBalances.map((b) => {
      let balance = b.balance;
      for (const s of activeSettlements) {
        if (s.from_family_id === b.familyId) balance = Math.round((balance + s.amount) * 100) / 100;
        if (s.to_family_id === b.familyId) balance = Math.round((balance - s.amount) * 100) / 100;
      }
      return { ...b, balance };
    });

    setSettlements(calculateSettlements(adjustedBalances));
    setPersonSettlements(calculatePersonSettlements(personBalances));
    setLoading(false);
    setRefreshing(false);
  }

  useFocusEffect(useCallback(() => { load(); }, [tripId, families, members]));

  async function handleProposeSettlement(s: SettlementCalculation) {
    if (isDemoMode) { Alert.alert('Demo Mode', 'Recording payments is disabled in demo.'); return; }

    const duplicate = existingSettlements.find(
      (r) =>
        r.from_family_id === s.fromFamilyId &&
        r.to_family_id === s.toFamilyId &&
        r.status !== 'cancelled' &&
        !r.deleted_at,
    );
    if (duplicate) {
      navigation.navigate('PaymentTracking', { tripId });
      return;
    }

    const key = `${s.fromFamilyId}-${s.toFamilyId}`;
    setSaving(key);
    const { error } = await settlementService.createProposal(
      tripId,
      s.fromFamilyId,
      s.toFamilyId,
      s.amount,
      currentTrip?.currency ?? 'USD',
      undefined,
      userFamily?.id ?? '',
    );
    setSaving(null);
    if (error) {
      Alert.alert('Error', error);
    } else {
      Alert.alert('Proposed', 'Settlement proposal created. Go to Payment Tracking to manage approvals.');
      navigation.navigate('PaymentTracking', { tripId });
    }
  }

  if (loading) return <LoadingView />;

  const currency = currencySymbol(currentTrip?.currency);
  const visiblePersonSettlements = personSettlements.filter((item) =>
    isTripOrganizer || isGlobalAdmin || item.fromUserId === user?.id || item.toUserId === user?.id
  );

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
            {settlements.length === 0 && visiblePersonSettlements.length === 0
              ? 'All settled up!'
              : `${settlements.length + visiblePersonSettlements.length} payment${settlements.length + visiblePersonSettlements.length !== 1 ? 's' : ''} needed`}
          </Text>
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>Family Settlements</Text>
            <Text style={styles.sectionSubtitle}>Based on family-paid expenses and family splits.</Text>
          </View>
        </View>
      }
      ListFooterComponent={
        visiblePersonSettlements.length > 0 ? (
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>Person Settlements</Text>
            <Text style={styles.sectionSubtitle}>For equal-by-person and selected-person expenses.</Text>
            {visiblePersonSettlements.map((item) => (
              <View key={`${item.fromUserId}-${item.toUserId}`} style={styles.personCard}>
                <View style={styles.personInitial}>
                  <Text style={styles.personInitialText}>{item.fromUserName.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.personSettlementText}>
                  <Text style={styles.personSettlementTitle}>
                    <Text style={styles.bold}>{item.fromUserName}</Text>
                    {' pays '}
                    <Text style={styles.bold}>{item.toUserName}</Text>
                  </Text>
                  <Text style={styles.personSettlementSub}>Person balance, separate from family settlements</Text>
                </View>
                <Text style={styles.personAmount}>{currency}{item.amount.toFixed(2)}</Text>
              </View>
            ))}
          </View>
        ) : null
      }
      ListEmptyComponent={
        visiblePersonSettlements.length === 0 ? (
          <EmptyState
            icon="🎉"
            title="All settled up!"
            subtitle="No payments needed. Expenses are balanced."
          />
        ) : null
      }
      renderItem={({ item }) => {
        const key = `${item.fromFamilyId}-${item.toFamilyId}`;
        const fromFamily = families.find((f) => f.id === item.fromFamilyId);
        const toFamily = families.find((f) => f.id === item.toFamilyId);
        const existing = existingSettlements.find(
          (s) =>
            s.from_family_id === item.fromFamilyId &&
            s.to_family_id === item.toFamilyId &&
            !s.deleted_at &&
            s.status !== 'cancelled',
        );

        // family_admin can only propose for rows where they are the payer
        const canPropose = canManageTrip || userFamily?.id === item.fromFamilyId;

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
                  {currency}{item.amount.toFixed(2)}
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
            {existing ? (
              <View style={styles.statusRow}>
                <Text style={[styles.statusText, existing.status === 'completed' && styles.statusCompleted]}>
                  {STATUS_LABEL[existing.status] ?? existing.status}
                </Text>
                <AppButton
                  title="View"
                  onPress={() => navigation.navigate('PaymentTracking', { tripId })}
                  variant="outline"
                  style={styles.viewBtn}
                />
              </View>
            ) : canPropose ? (
              <AppButton
                title="Propose Settlement"
                onPress={() => handleProposeSettlement(item)}
                loading={saving === key}
                fullWidth
                style={styles.payBtn}
              />
            ) : (
              <Text style={styles.viewOnlyNote}>Only admins or the payer family can propose a settlement</Text>
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
  sectionBlock: { marginTop: Spacing.lg },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text },
  sectionSubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  personCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginTop: Spacing.sm,
    ...Shadow.sm,
  },
  personInitial: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  personInitialText: { color: Colors.surface, fontSize: FontSize.md, fontWeight: FontWeight.bold },
  personSettlementText: { flex: 1 },
  personSettlementTitle: { fontSize: FontSize.sm, color: Colors.text },
  personSettlementSub: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  personAmount: { fontSize: FontSize.md, color: Colors.primary, fontWeight: FontWeight.bold },
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
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.sm },
  statusText: { fontSize: FontSize.sm, color: Colors.textSecondary, flex: 1 },
  statusCompleted: { color: Colors.success, fontWeight: FontWeight.semiBold },
  viewBtn: { marginLeft: Spacing.sm },
});
