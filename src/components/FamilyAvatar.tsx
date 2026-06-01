import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors, FontWeight, Radius } from '../constants/theme';
import { FAMILY_COLORS } from '../constants/theme';

interface Props {
  name: string;
  color?: string;
  size?: number;
  style?: ViewStyle;
}

function getAvatarColor(name: string): string {
  const idx = name.charCodeAt(0) % FAMILY_COLORS.length;
  return FAMILY_COLORS[idx];
}

export function FamilyAvatar({ name, color, size = 40, style }: Props) {
  const bgColor = color ?? getAvatarColor(name);
  const initial = name.trim().charAt(0).toUpperCase();
  const fontSize = size * 0.38;

  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bgColor },
        style,
      ]}
    >
      <Text style={[styles.initial, { fontSize }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    color: Colors.surface,
    fontWeight: FontWeight.bold,
  },
});
