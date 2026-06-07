import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Expense } from '../types';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme';
import { CATEGORY_ICONS, CATEGORY_COLORS } from '../constants/theme';
import { CurrencyAmount } from './CurrencyAmount';

interface Props {
  expense: Expense;
  onPress?: () => void;
  currency?: string;
}

export function ExpenseCard({ expense, onPress, currency }: Props) {
  const icon = CATEGORY_ICONS[expense.category] ?? '💸';
  const catColor = CATEGORY_COLORS[expense.category] ?? Colors.textSecondary;
  const dateStr = new Date(expense.date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const payerName = expense.paid_by_family?.name
    ?? expense.paid_by_profile?.full_name
    ?? expense.paid_by_profile?.email
    ?? 'Person';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      style={styles.card}
    >
      <View style={[styles.iconBox, { backgroundColor: catColor + '22' }]}>
        <Text style={styles.icon}>{icon}</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>{expense.title}</Text>
        <Text style={styles.meta}>
          {payerName} • {dateStr}
        </Text>
      </View>
      <CurrencyAmount amount={expense.amount} currency={currency ?? '$'} size="md" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
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
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  icon: {
    fontSize: 20,
  },
  info: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  title: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
    color: Colors.text,
    marginBottom: 2,
  },
  meta: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
});
