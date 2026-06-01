import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Alert, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainStackParamList, Settlement } from '../../types';
import { settlementService } from '../../services/settlementService';
import { LoadingView } from '../../components/LoadingView';
import { EmptyState } from '../../components/EmptyState';
import { SettlementCard } from '../../components/SettlementCard';
import { Colors, Spacing } from '../../constants/theme';

type Props = NativeStackScreenProps<MainStackParamList, 'PaymentTracking'>;

export function PaymentTrackingScreen({ route }: Props) {
  const { tripId } = route.params;
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data } = await settlementService.getSettlements(tripId);
    setSettlements(data ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [tripId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleMarkPaid(id: string) {
    const { error } = await settlementService.updatePaymentStatus(id, 'paid');
    if (error) Alert.alert('Error', error);
    else load();
  }

  async function handleConfirm(id: string) {
    const { error } = await settlementService.confirmPayment(id);
    if (error) Alert.alert('Error', error);
    else load();
  }

  if (loading) return <LoadingView />;

  return (
    <FlatList
      data={settlements}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />
      }
      ListEmptyComponent={
        <EmptyState icon="✅" title="No payment records" subtitle="Use the Settlements tab to record payments." />
      }
      renderItem={({ item }) => (
        <SettlementCard
          settlement={item}
          onMarkPaid={() => handleMarkPaid(item.id)}
          onConfirm={() => handleConfirm(item.id)}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.md, flexGrow: 1, backgroundColor: Colors.background },
});
