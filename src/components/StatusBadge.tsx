import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme';
import { PaymentStatus, PollStatus } from '../types';

type StatusValue = PaymentStatus | PollStatus | string;

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  pending:   { label: 'Pending',   bg: Colors.warning + '22',  text: Colors.warning },
  paid:      { label: 'Paid',      bg: Colors.primary + '22',  text: Colors.primary },
  confirmed: { label: 'Confirmed', bg: Colors.success + '22',  text: Colors.success },
  disputed:  { label: 'Disputed',  bg: Colors.danger + '22',   text: Colors.danger },
  active:    { label: 'Active',    bg: Colors.success + '22',  text: Colors.success },
  closed:    { label: 'Closed',    bg: Colors.textSecondary + '22', text: Colors.textSecondary },
};

interface Props {
  status: StatusValue;
  customLabel?: string;
}

export function StatusBadge({ status, customLabel }: Props) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    bg: Colors.border,
    text: Colors.textSecondary,
  };

  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <Text style={[styles.label, { color: config.text }]}>
        {customLabel ?? config.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
  },
});
