import React, { ReactNode } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { Colors, Radius, Spacing, Shadow } from '../constants/theme';

interface Props {
  children: ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  padding?: number;
}

export function AppCard({ children, onPress, style, padding = Spacing.md }: Props) {
  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        style={[styles.card, { padding }, style]}
        activeOpacity={0.7}
      >
        {children}
      </TouchableOpacity>
    );
  }
  return (
    <View style={[styles.card, { padding }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    ...Shadow.sm,
  },
});
