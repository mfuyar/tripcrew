import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, FontSize, FontWeight, Spacing } from '../constants/theme';
import { AppButton } from './AppButton';

interface Props {
  icon?: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon, title, subtitle, actionLabel, onAction }: Props) {
  return (
    <View style={styles.container}>
      {icon ? <Text style={styles.icon}>{icon}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {actionLabel && onAction ? (
        <AppButton
          title={actionLabel}
          onPress={onAction}
          style={styles.button}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  icon: {
    fontSize: 56,
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  button: {
    marginTop: Spacing.sm,
  },
});
