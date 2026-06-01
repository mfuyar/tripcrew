import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { Colors, FontSize, Spacing } from '../constants/theme';

interface Props {
  message?: string;
}

export function LoadingView({ message }: Props) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Colors.primary} />
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    padding: Spacing.xl,
  },
  message: {
    marginTop: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
