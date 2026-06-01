import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Settlement, PaymentStatus } from '../types';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme';
import { CurrencyAmount } from './CurrencyAmount';
import { StatusBadge } from './StatusBadge';
import { FamilyAvatar } from './FamilyAvatar';

interface Props {
  settlement: Settlement;
  onMarkPaid?: () => void;
  onConfirm?: () => void;
  showActions?: boolean;
}

export function SettlementCard({ settlement, onMarkPaid, onConfirm, showActions = true }: Props) {
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
          <StatusBadge status={settlement.status} />
        </View>
      </View>
      <Text style={styles.desc}>
        <Text style={styles.bold}>{settlement.from_family?.name}</Text>
        {' owes '}
        <Text style={styles.bold}>{settlement.to_family?.name}</Text>
      </Text>
      {showActions && settlement.status === 'pending' && onMarkPaid ? (
        <TouchableOpacity onPress={onMarkPaid} style={styles.actionBtn}>
          <Text style={styles.actionText}>Mark as Paid</Text>
        </TouchableOpacity>
      ) : null}
      {showActions && settlement.status === 'paid' && onConfirm ? (
        <TouchableOpacity onPress={onConfirm} style={[styles.actionBtn, styles.confirmBtn]}>
          <Text style={styles.actionText}>Confirm Receipt</Text>
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
  desc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  bold: {
    fontWeight: FontWeight.semiBold,
    color: Colors.text,
  },
  actionBtn: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: Radius.sm,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  confirmBtn: {
    backgroundColor: Colors.success,
  },
  actionText: {
    color: Colors.surface,
    fontWeight: FontWeight.semiBold,
    fontSize: FontSize.sm,
  },
});
