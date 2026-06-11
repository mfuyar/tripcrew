import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Alert,
  RefreshControl,
  TouchableOpacity,
  Platform,
  TextInput,
  Modal,
  SafeAreaView,
  Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainStackParamList, Settlement } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useTripContext } from '../../contexts/TripContext';
import { settlementService } from '../../services/settlementService';
import { LoadingView } from '../../components/LoadingView';
import { EmptyState } from '../../components/EmptyState';
import { SettlementCard } from '../../components/SettlementCard';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../constants/theme';

type Props = NativeStackScreenProps<MainStackParamList, 'PaymentTracking'>;

export function PaymentTrackingScreen({ route }: Props) {
  const { tripId } = route.params;
  const { isDemoMode, user } = useAuth();
  const { userFamily, isTripOrganizer } = useTripContext();
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [showDeleted, setShowDeleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Reason prompt state
  const [reasonModalVisible, setReasonModalVisible] = useState(false);
  const [reasonText, setReasonText] = useState('');
  const [pendingReasonAction, setPendingReasonAction] = useState<((reason: string) => void) | null>(null);
  const [reasonPromptTitle, setReasonPromptTitle] = useState('');

  const load = useCallback(async () => {
    if (isDemoMode) { setSettlements([]); setLoading(false); setRefreshing(false); return; }
    const { data } = isTripOrganizer
      ? await settlementService.getAllSettlementsForOrganizer(tripId)
      : await settlementService.getSettlements(tripId, userFamily?.id, user?.id);
    setSettlements(data ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [tripId, isDemoMode, isTripOrganizer, userFamily?.id, user?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Live-refresh when anyone (payer, receiver, or organizer) changes a
  // settlement, so confirmations/cancellations show up without manual reload.
  // `load` is read via ref so the channel isn't torn down and recreated every
  // time `load` changes identity (removeChannel is async, so re-subscribing
  // immediately can hit an already-joined channel and throw).
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);

  useEffect(() => {
    if (isDemoMode || !tripId) return;
    return settlementService.subscribeToSettlements(tripId, () => loadRef.current());
  }, [tripId, isDemoMode]);

  function promptForReason(title: string, onConfirm: (reason: string) => void) {
    if (Platform.OS === 'ios') {
      Alert.prompt(
        title,
        'Please provide a reason (required).',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Confirm',
            onPress: (reason: string | undefined) => {
              if (!reason?.trim()) { Alert.alert('Reason required', 'Please enter a reason.'); return; }
              onConfirm(reason.trim());
            },
          },
        ],
        'plain-text'
      );
    } else {
      setReasonPromptTitle(title);
      setReasonText('');
      setPendingReasonAction(() => onConfirm);
      setReasonModalVisible(true);
    }
  }

  function submitReason() {
    if (!reasonText.trim()) { Alert.alert('Reason required', 'Please enter a reason.'); return; }
    if (pendingReasonAction) pendingReasonAction(reasonText.trim());
    setReasonModalVisible(false);
    setPendingReasonAction(null);
  }

  function handleCancel(id: string) {
    promptForReason('Cancel Settlement Record', async (reason) => {
      const { error } = await settlementService.cancel(id, reason, user?.id);
      if (error) Alert.alert('Error', error);
      else load();
    });
  }

  function handleSoftDelete(id: string) {
    Alert.alert('Delete Record', 'This will hide the record from members. You can restore it later.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const { error } = await settlementService.softDelete(id);
          if (error) Alert.alert('Error', error);
          else load();
        },
      },
    ]);
  }

  async function handleRestore(id: string) {
    const { error } = await settlementService.restoreSettlement(id);
    if (error) Alert.alert('Error', error);
    else load();
  }

  async function handleNotify(id: string) {
    const { error } = await settlementService.sendSettlementNotification(id, user?.id);
    if (error) Alert.alert('Notification failed', error);
    else Alert.alert('Notification sent', 'The involved families were notified.');
  }

  async function handleEmail(settlement: Settlement) {
    const { data: recipients, error } = await settlementService.getSettlementEmailRecipients(settlement);
    if (error) { Alert.alert('Email failed', error); return; }
    if (!recipients?.length) { Alert.alert('No email found', 'No email addresses were found for the involved parties.'); return; }

    const payer = settlement.settlement_type === 'person'
      ? settlement.from_user?.full_name ?? settlement.from_user?.email ?? 'Payer'
      : settlement.from_family?.name ?? 'Payer family';
    const receiver = settlement.settlement_type === 'person'
      ? settlement.to_user?.full_name ?? settlement.to_user?.email ?? 'Receiver'
      : settlement.to_family?.name ?? 'Receiver family';
    const subject = 'TripCrew settlement reminder';
    const body = `${payer} should pay ${receiver} ${settlement.currency ?? 'USD'} ${settlement.amount.toFixed(2)}.\n\nPlease confirm in TripCrew after the payment is sent or received.`;
    const url = `mailto:${recipients.map(encodeURIComponent).join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) { Alert.alert('Email unavailable', 'No email app is available on this device.'); return; }
    await Linking.openURL(url);
    await settlementService.markSettlementEmailed(settlement.id);
    load();
  }

  async function handleConfirmAsPayer(id: string) {
    const { error } = await settlementService.confirmAsPayer(id, user?.id);
    if (error) Alert.alert('Confirm failed', error);
    else load();
  }

  async function handleConfirmAsReceiver(id: string) {
    const { error } = await settlementService.confirmAsReceiver(id, user?.id);
    if (error) Alert.alert('Confirm failed', error);
    else load();
  }

  async function handleClose(id: string) {
    const { error } = await settlementService.closeSettlement(id, user?.id);
    if (error) Alert.alert('Close failed', error);
    else load();
  }

  if (loading) return <LoadingView />;

  const active = settlements.filter((s) => !s.deleted_at);
  const deleted = settlements.filter((s) => s.deleted_at);
  const visible = showDeleted ? settlements : active;

  return (
    <>
      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />
        }
        ListHeaderComponent={
          isTripOrganizer && deleted.length > 0 ? (
            <TouchableOpacity onPress={() => setShowDeleted((v) => !v)} style={styles.toggleRow}>
              <Text style={styles.toggleText}>
                {showDeleted ? 'Hide deleted records' : `Show ${deleted.length} deleted record${deleted.length !== 1 ? 's' : ''}`}
              </Text>
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState icon="✅" title="No settlement records" subtitle="The trip organizer can settle family balances from the Settlements tab." />
        }
        renderItem={({ item }) => {
          const isDeleted = !!item.deleted_at;
          return (
            <View style={isDeleted ? styles.deletedWrapper : undefined}>
              {isDeleted && <Text style={styles.deletedBadge}>Deleted</Text>}
              <SettlementCard
                settlement={item}
                viewerFamilyId={userFamily?.id}
                viewerUserId={user?.id}
                canManageTrip={isTripOrganizer}
                isTripOrganizer={isTripOrganizer}
                onNotify={
                  !isDeleted && isTripOrganizer
                    ? () => handleNotify(item.id)
                    : undefined
                }
                onEmail={
                  !isDeleted && isTripOrganizer
                    ? () => handleEmail(item)
                    : undefined
                }
                onConfirmAsPayer={
                  !isDeleted
                    ? () => handleConfirmAsPayer(item.id)
                    : undefined
                }
                onConfirmAsReceiver={
                  !isDeleted
                    ? () => handleConfirmAsReceiver(item.id)
                    : undefined
                }
                onClose={
                  !isDeleted && isTripOrganizer && item.status === 'confirmed'
                    ? () => handleClose(item.id)
                    : undefined
                }
                onCancel={
                  !isDeleted && isTripOrganizer && item.status !== 'cancelled'
                    ? () => handleCancel(item.id)
                    : undefined
                }
                onSoftDelete={
                  !isDeleted && isTripOrganizer
                    ? () => handleSoftDelete(item.id)
                    : undefined
                }
                onRestore={
                  isDeleted && isTripOrganizer
                    ? () => handleRestore(item.id)
                    : undefined
                }
              />
            </View>
          );
        }}
      />

      <Modal visible={reasonModalVisible} transparent animationType="fade">
        <SafeAreaView style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>{reasonPromptTitle}</Text>
            <Text style={styles.modalSubtitle}>Please provide a reason (required).</Text>
            <TextInput
              style={styles.reasonInput}
              value={reasonText}
              onChangeText={setReasonText}
              placeholder="Enter reason..."
              placeholderTextColor={Colors.textSecondary}
              autoFocus
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => { setReasonModalVisible(false); setPendingReasonAction(null); }}
                style={[styles.modalBtn, styles.modalBtnCancel]}
              >
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={submitReason} style={[styles.modalBtn, styles.modalBtnConfirm]}>
                <Text style={styles.modalBtnConfirmText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.md, flexGrow: 1, backgroundColor: Colors.background },
  toggleRow: { paddingVertical: Spacing.sm, alignItems: 'center' },
  toggleText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.semiBold },
  deletedWrapper: { opacity: 0.55 },
  deletedBadge: { fontSize: FontSize.xs, color: Colors.danger, fontWeight: FontWeight.semiBold, marginBottom: 2, marginLeft: Spacing.sm },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBox: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    width: '85%',
    gap: Spacing.sm,
  },
  modalTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  modalSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  reasonInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    fontSize: FontSize.sm,
    color: Colors.text,
    minHeight: 72,
    textAlignVertical: 'top',
    marginTop: Spacing.xs,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  modalBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
  },
  modalBtnCancel: {
    backgroundColor: Colors.border,
  },
  modalBtnCancelText: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: FontWeight.medium,
  },
  modalBtnConfirm: {
    backgroundColor: Colors.primary,
  },
  modalBtnConfirmText: {
    fontSize: FontSize.sm,
    color: Colors.surface,
    fontWeight: FontWeight.semiBold,
  },
});
