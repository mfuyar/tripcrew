import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Settlement } from '../types';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme';
import { CurrencyAmount } from './CurrencyAmount';
import { FamilyAvatar } from './FamilyAvatar';

interface Props {
  settlement: Settlement;
  viewerFamilyId?: string;
  canManageTrip: boolean;
  isTripOrganizer: boolean;
  onApproveAsPayer?: () => void;
  onApproveAsReceiver?: () => void;
  onDispute?: () => void;
  onCancel?: () => void;
  onResolveDispute?: () => void;
  onSoftDelete?: () => void;
  onRestore?: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  proposed: 'Proposed — pending approvals',
  payer_approved: 'Payer approved — awaiting receiver',
  receiver_approved: 'Receiver approved — awaiting payer',
  completed: 'Completed',
  disputed: 'Disputed',
  cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<string, string> = {
  proposed: Colors.warning,
  payer_approved: Colors.primary,
  receiver_approved: Colors.primary,
  completed: Colors.success,
  disputed: Colors.danger,
  cancelled: Colors.textSecondary,
};

export function SettlementCard({
  settlement,
  viewerFamilyId,
  canManageTrip,
  onApproveAsPayer,
  onApproveAsReceiver,
  onDispute,
  onCancel,
  onResolveDispute,
  onSoftDelete,
  onRestore,
}: Props) {
  const { status } = settlement;
  const isPayer = viewerFamilyId === settlement.from_family_id;
  const isReceiver = viewerFamilyId === settlement.to_family_id;
  const isDeleted = !!settlement.deleted_at;
  const isActive = status !== 'completed' && status !== 'cancelled';

  const payerApproved = !!settlement.payer_family_approved_at;
  const receiverApproved = !!settlement.receiver_family_approved_at;

  const showApproveAsPayer =
    onApproveAsPayer &&
    isPayer &&
    !payerApproved &&
    (status === 'proposed' || status === 'receiver_approved');

  const showApproveAsReceiver =
    onApproveAsReceiver &&
    isReceiver &&
    !receiverApproved &&
    (status === 'proposed' || status === 'payer_approved');

  const showDispute =
    onDispute &&
    (isPayer || isReceiver) &&
    isActive;

  const showCancel =
    onCancel &&
    canManageTrip &&
    isActive;

  const showResolveDispute =
    onResolveDispute &&
    canManageTrip &&
    status === 'disputed';

  const badgeColor = STATUS_COLORS[status] ?? Colors.textSecondary;
  const badgeLabel = STATUS_LABELS[status] ?? status;

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.families}>
          <FamilyAvatar
            name={settlement.from_family?.name ?? '?'}
            color={settlement.from_family?.color}
            size={36}
          />
          <Text style={styles.arrow}>→</Text>
          <FamilyAvatar
            name={settlement.to_family?.name ?? '?'}
            color={settlement.to_family?.color}
            size={36}
          />
        </View>
        <View style={styles.right}>
          <CurrencyAmount amount={settlement.amount} size="lg" />
          <View style={[styles.badge, { backgroundColor: badgeColor + '22' }]}>
            <Text style={[styles.badgeText, { color: badgeColor }]}>{badgeLabel}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.desc}>
        <Text style={styles.bold}>{settlement.from_family?.name}</Text>
        {' owes '}
        <Text style={styles.bold}>{settlement.to_family?.name}</Text>
      </Text>

      <View style={styles.approvalsRow}>
        <Text style={[styles.approvalItem, payerApproved ? styles.approvalDone : styles.approvalPending]}>
          {payerApproved ? '✓ Payer approved' : '⏳ Payer pending'}
        </Text>
        <Text style={[styles.approvalItem, receiverApproved ? styles.approvalDone : styles.approvalPending]}>
          {receiverApproved ? '✓ Receiver approved' : '⏳ Receiver pending'}
        </Text>
      </View>

      {status === 'disputed' && settlement.dispute_reason ? (
        <Text style={styles.reasonText}>Dispute: {settlement.dispute_reason}</Text>
      ) : null}
      {status === 'cancelled' && settlement.cancel_reason ? (
        <Text style={styles.reasonText}>Reason: {settlement.cancel_reason}</Text>
      ) : null}

      {(showApproveAsPayer || showApproveAsReceiver || showDispute || showCancel || showResolveDispute) ? (
        <View style={styles.actionsContainer}>
          {showApproveAsPayer ? (
            <TouchableOpacity onPress={onApproveAsPayer} style={[styles.actionBtn, styles.approveBtn]}>
              <Text style={styles.actionText}>Approve as Payer</Text>
            </TouchableOpacity>
          ) : null}
          {showApproveAsReceiver ? (
            <TouchableOpacity onPress={onApproveAsReceiver} style={[styles.actionBtn, styles.approveBtn]}>
              <Text style={styles.actionText}>Approve as Receiver</Text>
            </TouchableOpacity>
          ) : null}
          {showResolveDispute ? (
            <TouchableOpacity onPress={onResolveDispute} style={[styles.actionBtn, styles.resolveBtn]}>
              <Text style={styles.actionText}>Resolve Dispute</Text>
            </TouchableOpacity>
          ) : null}
          <View style={styles.secondaryActions}>
            {showDispute ? (
              <TouchableOpacity onPress={onDispute} style={[styles.actionBtn, styles.disputeBtn, styles.actionHalf]}>
                <Text style={styles.actionText}>Dispute</Text>
              </TouchableOpacity>
            ) : null}
            {showCancel ? (
              <TouchableOpacity onPress={onCancel} style={[styles.actionBtn, styles.cancelBtn, styles.actionHalf]}>
                <Text style={styles.actionText}>Cancel</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}

      {canManageTrip && !isDeleted ? (
        <TouchableOpacity onPress={onSoftDelete} style={styles.linkBtn}>
          <Text style={styles.linkDanger}>Delete Record</Text>
        </TouchableOpacity>
      ) : null}
      {canManageTrip && isDeleted ? (
        <TouchableOpacity onPress={onRestore} style={styles.linkBtn}>
          <Text style={styles.linkPrimary}>Restore Record</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.8,
    shadowRadius: 3,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  families: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  arrow: {
    fontSize: FontSize.lg,
    color: Colors.textSecondary,
    marginHorizontal: Spacing.xs,
  },
  right: {
    alignItems: 'flex-end',
    gap: Spacing.xs,
  },
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
  },
  desc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  bold: {
    fontWeight: FontWeight.semiBold,
    color: Colors.text,
  },
  approvalsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  approvalItem: {
    fontSize: FontSize.xs,
  },
  approvalDone: {
    color: Colors.success,
    fontWeight: FontWeight.semiBold,
  },
  approvalPending: {
    color: Colors.textSecondary,
  },
  reasonText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    marginBottom: Spacing.xs,
  },
  actionsContainer: {
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  actionBtn: {
    borderRadius: Radius.sm,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  approveBtn: {
    backgroundColor: Colors.success,
  },
  disputeBtn: {
    backgroundColor: Colors.danger,
  },
  cancelBtn: {
    backgroundColor: Colors.textSecondary,
  },
  resolveBtn: {
    backgroundColor: Colors.primary,
  },
  actionHalf: {
    flex: 1,
  },
  actionText: {
    color: Colors.surface,
    fontWeight: FontWeight.semiBold,
    fontSize: FontSize.sm,
  },
  linkBtn: {
    marginTop: Spacing.sm,
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  linkDanger: {
    fontSize: FontSize.xs,
    color: Colors.danger,
  },
  linkPrimary: {
    fontSize: FontSize.xs,
    color: Colors.primary,
  },
});
