import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../constants/theme';

interface Props {
  status: 'closed' | 'archived';
  closedAt?: string;
}

export function TripClosedBanner({ status, closedAt }: Props) {
  const isArchived = status === 'archived';
  const date = closedAt
    ? new Date(closedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <View style={[styles.banner, isArchived ? styles.bannerArchived : styles.bannerClosed]}>
      <Text style={styles.icon}>{isArchived ? '📦' : '🔒'}</Text>
      <Text style={styles.text}>
        {isArchived ? 'This trip is archived' : `Trip closed${date ? ` on ${date}` : ''}`}
        {' · '}
        <Text style={styles.sub}>Read only</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  bannerClosed: {
    backgroundColor: Colors.warning + '18',
    borderBottomColor: Colors.warning + '40',
  },
  bannerArchived: {
    backgroundColor: Colors.border,
    borderBottomColor: Colors.border,
  },
  icon: { fontSize: 14 },
  text: { fontSize: FontSize.sm, color: Colors.text, fontWeight: FontWeight.medium, flex: 1 },
  sub: { color: Colors.textSecondary, fontWeight: '400' },
});
