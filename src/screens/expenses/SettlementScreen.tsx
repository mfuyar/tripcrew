import React, { useState, useCallback, useEffect, useRef } from 'react';
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
  applySettlementsToFamilyBalances,
  applySettlementsToPersonBalances,
} from '../../utils/calculations';
import { LoadingView } from '../../components/LoadingView';
import { EmptyState } from '../../components/EmptyState';
import { FamilyAvatar } from '../../components/FamilyAvatar';
import { AppButton } from '../../components/AppButton';
import { currencySymbol } from '../../utils/currency';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../constants/theme';

type Props = NativeStackScreenProps<MainStackParamList, 'Settlements'>;

const STATUS_LABEL: Record<string, string> = {
  proposed: 'Pending confirmations',
  payer_approved: 'Payer confirmed',
  receiver_approved: 'Receiver confirmed',
  confirmed: 'Ready to close',
  completed: 'Closed',
  disputed: 'Disputed',
  cancelled: 'Cancelled',
};

export function SettlementScreen({ navigation, route }: Props) {
  const { tripId } = route.params;
  const { families, members, currentTrip, isTripOrganizer } = useTripContext();
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
    const rawPersonBalances = calculatePersonBalances(expenses, members);
    const adjustedBalances = applySettlementsToFamilyBalances(rawBalances, existing);
    const adjustedPersonBalances = applySettlementsToPersonBalances(rawPersonBalances, existing);

    setSettlements(calculateSettlements(adjustedBalances));
    setPersonSettlements(calculatePersonSettlements(adjustedPersonBalances));
    setLoading(false);
    setRefreshing(false);
  }

  useFocusEffect(useCallback(() => { load(); }, [tripId, families, members]));

  // Live-refresh balances/status badges when settlement records change
  // elsewhere (e.g. someone confirms or the organizer records a payment).
  // `load` is read via ref so the subscribed callback always recalculates
  // with the latest families/members instead of a stale closure.
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; });

  useEffect(() => {
    if (isDemoMode || !tripId) return;
    return settlementService.subscribeToSettlements(tripId, () => loadRef.current());
  }, [tripId, isDemoMode]);

  async function handleCreateFamilyRequest(s: SettlementCalculation) {
    if (isDemoMode) { Alert.alert('Demo Mode', 'Settlement requests are disabled in demo.'); return; }
    if (!isTripOrganizer) {
      Alert.alert('Organizer only', 'Only the trip organizer can send settlement requests.');
      return;
    }

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
    const { error } = await settlementService.createFamilySettlementRequest(
      tripId,
      s.fromFamilyId,
      s.toFamilyId,
      s.amount,
      currentTrip?.currency ?? 'USD',
      undefined,
      user?.id
    );
    setSaving(null);
    if (error) {
      Alert.alert('Error', error);
    } else {
      Alert.alert('Request sent', 'The involved families were notified. Track confirmations in Payment Tracking.');
      navigation.navigate('PaymentTracking', { tripId });
    }
  }

  async function handleCreatePersonRequest(s: PersonSettlementCalculation) {
    if (isDemoMode) { Alert.alert('Demo Mode', 'Settlement requests are disabled in demo.'); return; }
    if (!isTripOrganizer) {
      Alert.alert('Organizer only', 'Only the trip organizer can send settlement requests.');
      return;
    }

    const duplicate = existingSettlements.find(
      (r) =>
        r.settlement_type === 'person' &&
        r.from_user_id === s.fromUserId &&
        r.to_user_id === s.toUserId &&
        r.status !== 'cancelled' &&
        !r.deleted_at,
    );
    if (duplicate) {
      navigation.navigate('PaymentTracking', { tripId });
      return;
    }

    const key = `${s.fromUserId}-${s.toUserId}`;
    setSaving(key);
    const { error } = await settlementService.createPersonSettlementRequest(
      tripId,
      s.fromUserId,
      s.toUserId,
      s.amount,
      currentTrip?.currency ?? 'USD',
      undefined,
      user?.id
    );
    setSaving(null);
    if (error) {
      Alert.alert('Error', error);
    } else {
      Alert.alert('Request sent', 'The involved people were notified. Track confirmations in Payment Tracking.');
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
            {visiblePersonSettlements.map((item) => {
              const existing = existingSettlements.find(
                (s) =>
                  s.settlement_type === 'person' &&
                  s.from_user_id === item.fromUserId &&
                  s.to_user_id === item.toUserId &&
                  !s.deleted_at &&
                  s.status !== 'cancelled',
              );
              return (
                <View key={`${item.fromUserId}-${item.toUserId}`} style={styles.personCard}>
                  <View style={styles.personInitial}>
                    <Text style={styles.personInitialText}>{item.fromUserName.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={styles.personSettlementText}>
                    <Text style={styles.personSettlementTitle}>
                      <Text style={styles.bold}>{item.fromUserName}</Text>
                      {existing?.status === 'completed' ? ' paid ' : ' pays '}
                      <Text style={styles.bold}>{item.toUserName}</Text>
                    </Text>
                    <Text style={styles.personSettlementSub}>Person balance, separate from family settlements</Text>
                  </View>
                  <Text style={styles.personAmount}>{currency}{item.amount.toFixed(2)}</Text>
                  {(() => {
                    const key = `${item.fromUserId}-${item.toUserId}`;
                    if (existing) {
                      return (
                        <AppButton
                          title={STATUS_LABEL[existing.status] ?? 'View'}
                          onPress={() => navigation.navigate('PaymentTracking', { tripId })}
                          variant="outline"
                          style={styles.personActionBtn}
                        />
                      );
                    }
                    if (!isTripOrganizer) return null;
                    return (
                      <AppButton
                        title="Send Request"
                        onPress={() => handleCreatePersonRequest(item)}
                        loading={saving === key}
                        style={styles.personActionBtn}
                      />
                    );
                  })()}
                </View>
              );
            })}
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

        const canRecord = isTripOrganizer;

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
              {existing?.status === 'completed' ? ' paid ' : ' pays '}
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
            ) : canRecord ? (
              <AppButton
                title="Send Request"
                onPress={() => handleCreateFamilyRequest(item)}
                loading={saving === key}
                fullWidth
                style={styles.payBtn}
              />
            ) : (
              <Text style={styles.viewOnlyNote}>Only the trip organizer can send settlement requests</Text>
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
  personActionBtn: { marginLeft: Spacing.sm, minWidth: 104 },
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
