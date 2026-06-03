import React, { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ScrollViewProps,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { Colors, Spacing } from '../constants/theme';

type Props = {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  keyboardVerticalOffset?: number;
} & Omit<ScrollViewProps, 'contentContainerStyle' | 'style'>;

const DEFAULT_KEYBOARD_OFFSET = 96;

export function FormKeyboardView({
  children,
  contentContainerStyle,
  style,
  keyboardVerticalOffset = DEFAULT_KEYBOARD_OFFSET,
  ...scrollProps
}: Props) {
  return (
    <KeyboardAvoidingView
      style={[styles.flex, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? keyboardVerticalOffset : 0}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        contentInsetAdjustmentBehavior="automatic"
        {...scrollProps}
        contentContainerStyle={[contentContainerStyle, styles.content]}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingBottom: Spacing.xl * 4,
  },
});
