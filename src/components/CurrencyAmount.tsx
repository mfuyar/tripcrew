import React from 'react';
import { Text, StyleSheet, TextStyle } from 'react-native';
import { Colors, FontSize, FontWeight } from '../constants/theme';

interface Props {
  amount: number;
  currency?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  colorCoded?: boolean; // positive = green, negative = red
  style?: TextStyle;
}

const sizeMap = {
  sm: FontSize.sm,
  md: FontSize.md,
  lg: FontSize.lg,
  xl: FontSize.xl,
};

export function CurrencyAmount({
  amount,
  currency = '$',
  size = 'md',
  colorCoded = false,
  style,
}: Props) {
  const color = colorCoded
    ? amount >= 0
      ? Colors.success
      : Colors.danger
    : Colors.text;

  const prefix = colorCoded && amount > 0 ? '+' : '';
  const formatted = `${prefix}${currency}${Math.abs(amount).toFixed(2)}`;

  return (
    <Text style={[styles.base, { fontSize: sizeMap[size], color }, style]}>
      {formatted}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    fontWeight: FontWeight.semiBold,
  },
});
