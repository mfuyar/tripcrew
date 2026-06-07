import React, { useState, useCallback } from 'react';
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
  const { isDemoMode } = useAuth();
  const { userFamily, canManageTrip, isTripOrganizer } = useTripContext();
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
      : await settlementService.getSettlements(tripId, userFamily?.id);
    setSettlements(data ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [tripId, isDemoMode, isTripOrganizer, userFamily?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

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

  async function handleApproveAsPayer(id: string) {
    if (!userFamily) return;
    const { error } = await settlementService.approveAsPayer(id, userFamily.id);
    if (error) Alert.alert('Error', error);
    else load();
  }

  async function handleApproveAsReceiver(id: string) {
    if (!userFamily) return;
    const { error } = await settlementService.approveAsReceiver(id, userFamily.id);
    if (error) Alert.alert('Error', error);
    else load();
  }

  function handleDispute(id: string) {
    promptForReason('Dispute Settlement', async (reason) => {
      const { error } = await settlementService.dispute(id, reason);
      if (error) Alert.alert('Error', error);
      else load();
    });
  }

  function handleCancel(id: string) {
    promptForReason('Cancel Settlement', async (reason) => {
      const { error } = await settlementService.cancel(id, reason);
      if (error) Alert.alert('Error', error);
      else load();
    });
  }

  async function handleResolveDispute(id: string) {
    const { error } = await settlementService.resolveDispute(id);
    if (error) Alert.alert('Error', error);
    else load();
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
          <EmptyState icon="✅" title="No payment records" subtitle="Use the Settlements tab to propose a settlement." />
        }
        renderItem={({ item }) => {
          const isDeleted = !!item.deleted_at;
          return (
            <View style={isDeleted ? styles.deletedWrapper : undefined}>
              {isDeleted && <Text style={styles.deletedBadge}>Deleted</Text>}
              <SettlementCard
                settlement={item}
                viewerFamilyId={userFamily?.id}
                canManageTrip={canManageTrip}
                isTripOrganizer={isTripOrganizer}
                onApproveAsPayer={
                  !isDeleted && userFamily?.id === item.from_family_id && !item.payer_family_approved_at
                    ? () => handleApproveAsPayer(item.id)
                    : undefined
                }
                onApproveAsReceiver={
                  !isDeleted && userFamily?.id === item.to_family_id && !item.receiver_family_approved_at
                    ? () => handleApproveAsReceiver(item.id)
                    : undefined
                }
                onDispute={
                  !isDeleted && item.status !== 'completed' && item.status !== 'cancelled'
                    ? () => handleDispute(item.id)
                    : undefined
                }
                onCancel={
                  !isDeleted && canManageTrip && item.status !== 'completed' && item.status !== 'cancelled'
                    ? () => handleCancel(item.id)
                    : undefined
                }
                onResolveDispute={
                  !isDeleted && canManageTrip && item.status === 'disputed'
                    ? () => handleResolveDispute(item.id)
                    : undefined
                }
                onSoftDelete={
                  !isDeleted && canManageTrip
                    ? () => handleSoftDelete(item.id)
                    : undefined
                }
                onRestore={
                  isDeleted && canManageTrip
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
