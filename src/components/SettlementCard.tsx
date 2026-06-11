import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Settlement } from '../types';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme';
import { CurrencyAmount } from './CurrencyAmount';
import { FamilyAvatar } from './FamilyAvatar';

interface Props {
  settlement: Settlement;
  viewerFamilyId?: string;
  viewerUserId?: string;
  canManageTrip: boolean;
  isTripOrganizer: boolean;
  onNotify?: () => void;
  onEmail?: () => void;
  onConfirmAsPayer?: () => void;
  onConfirmAsReceiver?: () => void;
  onClose?: () => void;
  onCancel?: () => void;
  onSoftDelete?: () => void;
  onRestore?: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  proposed: 'Legacy pending',
  payer_approved: 'Payer confirmed',
  receiver_approved: 'Receiver confirmed',
  confirmed: 'Ready to close',
  completed: 'Closed',
  disputed: 'Needs review',
  cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<string, string> = {
  proposed: Colors.warning,
  payer_approved: Colors.primary,
  receiver_approved: Colors.primary,
  confirmed: Colors.success,
  completed: Colors.success,
  disputed: Colors.danger,
  cancelled: Colors.textSecondary,
};

export function SettlementCard({
  settlement,
  viewerFamilyId,
  viewerUserId,
  canManageTrip,
  onNotify,
  onEmail,
  onConfirmAsPayer,
  onConfirmAsReceiver,
  onClose,
  onCancel,
  onSoftDelete,
  onRestore,
}: Props) {
  const { status } = settlement;
  const isDeleted = !!settlement.deleted_at;
  const showNotify = onNotify && canManageTrip && !isDeleted;
  const showEmail = onEmail && canManageTrip && !isDeleted;
  const showClose = onClose && canManageTrip && status === 'confirmed';
  const showCancel = onCancel && canManageTrip && status !== 'cancelled';
  const isPerson = settlement.settlement_type === 'person';
  const payerLabel = isPerson
    ? settlement.from_user?.full_name ?? settlement.from_user?.email ?? 'Payer'
    : settlement.from_family?.name ?? 'Payer family';
  const receiverLabel = isPerson
    ? settlement.to_user?.full_name ?? settlement.to_user?.email ?? 'Receiver'
    : settlement.to_family?.name ?? 'Receiver family';
  const payerConfirmed = !!settlement.payer_family_approved_at;
  const receiverConfirmed = !!settlement.receiver_family_approved_at;
  const viewerIsPayer = isPerson
    ? viewerUserId === settlement.from_user_id
    : viewerFamilyId === settlement.from_family_id;
  const viewerIsReceiver = isPerson
    ? viewerUserId === settlement.to_user_id
    : viewerFamilyId === settlement.to_family_id;
  const showConfirmAsPayer =
    onConfirmAsPayer &&
    viewerIsPayer &&
    !payerConfirmed &&
    !['completed', 'cancelled'].includes(status);
  const showConfirmAsReceiver =
    onConfirmAsReceiver &&
    viewerIsReceiver &&
    !receiverConfirmed &&
    !['completed', 'cancelled'].includes(status);

  const badgeColor = STATUS_COLORS[status] ?? Colors.textSecondary;
  const badgeLabel = STATUS_LABELS[status] ?? status;
  const actionVerb = status === 'completed' ? ' paid ' : ' should pay ';

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.families}>
          <FamilyAvatar
            name={payerLabel}
            color={settlement.from_family?.color}
            size={36}
          />
          <Text style={styles.arrow}>→</Text>
          <FamilyAvatar
            name={receiverLabel}
            color={settlement.to_family?.color}
            size={36}
          />
        </View>
        <View style={styles.amountBox}>
          <CurrencyAmount amount={settlement.amount} size="lg" />
        </View>
      </View>

      <View style={styles.statusRow}>
        <View style={[styles.badge, { backgroundColor: badgeColor + '22' }]}>
          <Text style={[styles.badgeText, { color: badgeColor }]} numberOfLines={2}>
            {badgeLabel}
          </Text>
        </View>
      </View>

      <Text style={styles.desc} numberOfLines={2}>
        <Text style={styles.bold}>{payerLabel}</Text>
        {actionVerb}
        <Text style={styles.bold}>{receiverLabel}</Text>
      </Text>

      <View style={styles.confirmRow}>
        <Text style={[styles.confirmText, payerConfirmed && styles.confirmedText]}>
          {payerConfirmed ? '✓ Payer confirmed' : 'Payer pending'}
        </Text>
        <Text style={[styles.confirmText, receiverConfirmed && styles.confirmedText]}>
          {receiverConfirmed ? '✓ Receiver confirmed' : 'Receiver pending'}
        </Text>
      </View>

      {status === 'disputed' && settlement.dispute_reason ? (
        <Text style={styles.reasonText}>Dispute: {settlement.dispute_reason}</Text>
      ) : null}
      {status === 'cancelled' && settlement.cancel_reason ? (
        <Text style={styles.reasonText}>Reason: {settlement.cancel_reason}</Text>
      ) : null}

      {(showConfirmAsPayer || showConfirmAsReceiver || showNotify || showEmail || showClose || showCancel) ? (
        <View style={styles.actionsContainer}>
          {showConfirmAsPayer ? (
            <TouchableOpacity onPress={onConfirmAsPayer} style={[styles.actionBtn, styles.confirmBtn]}>
              <Text style={styles.actionText}>Confirm Paid</Text>
            </TouchableOpacity>
          ) : null}
          {showConfirmAsReceiver ? (
            <TouchableOpacity onPress={onConfirmAsReceiver} style={[styles.actionBtn, styles.confirmBtn]}>
              <Text style={styles.actionText}>Confirm Received</Text>
            </TouchableOpacity>
          ) : null}
          {showNotify ? (
            <TouchableOpacity onPress={onNotify} style={[styles.actionBtn, styles.notifyBtn]}>
              <Text style={styles.actionText}>Send Notification</Text>
            </TouchableOpacity>
          ) : null}
          {showEmail ? (
            <TouchableOpacity onPress={onEmail} style={[styles.actionBtn, styles.emailBtn]}>
              <Text style={styles.actionText}>Email Parties</Text>
            </TouchableOpacity>
          ) : null}
          {showClose ? (
            <TouchableOpacity onPress={onClose} style={[styles.actionBtn, styles.closeBtn]}>
              <Text style={styles.actionText}>Close Settlement</Text>
            </TouchableOpacity>
          ) : null}
          {showCancel ? (
            <TouchableOpacity onPress={onCancel} style={[styles.actionBtn, styles.cancelBtn]}>
              <Text style={styles.actionText}>Cancel Record</Text>
            </TouchableOpacity>
          ) : null}
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
    gap: Spacing.sm,
  },
  families: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexShrink: 1,
    minWidth: 116,
  },
  arrow: {
    fontSize: FontSize.lg,
    color: Colors.textSecondary,
    marginHorizontal: Spacing.xs,
  },
  amountBox: {
    alignItems: 'flex-end',
    flexShrink: 0,
    minWidth: 96,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: Spacing.xs,
  },
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.md,
    maxWidth: '100%',
  },
  badgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
    textAlign: 'right',
  },
  desc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
    flexShrink: 1,
  },
  bold: {
    fontWeight: FontWeight.semiBold,
    color: Colors.text,
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
  actionBtn: {
    borderRadius: Radius.sm,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  cancelBtn: {
    backgroundColor: Colors.textSecondary,
  },
  notifyBtn: {
    backgroundColor: Colors.primary,
  },
  emailBtn: {
    backgroundColor: Colors.warning,
  },
  closeBtn: {
    backgroundColor: Colors.success,
  },
  confirmBtn: {
    backgroundColor: Colors.success,
  },
  confirmRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  confirmText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  confirmedText: {
    color: Colors.success,
    fontWeight: FontWeight.semiBold,
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
