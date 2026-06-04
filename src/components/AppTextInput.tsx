import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
  TextInputProps,
} from 'react-native';
import { Colors, Radius, FontSize, Spacing, FontWeight } from '../constants/theme';

interface Props extends TextInputProps {
  label?: string;
  error?: string;
  required?: boolean;
  containerStyle?: ViewStyle;
}

export function AppTextInput({
  label,
  error,
  required,
  secureTextEntry,
  containerStyle,
  multiline,
  style,
  ...rest
}: Props) {
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text style={styles.label}>
          {label}{required ? <Text style={styles.requiredStar}> *</Text> : null}
        </Text>
      ) : null}
      <View style={[
        styles.inputWrapper,
        focused && styles.inputWrapperFocused,
        !!error && styles.inputWrapperError,
        multiline && styles.inputWrapperMultiline,
      ]}>
        <TextInput
          style={[styles.input, multiline && styles.inputMultiline, style]}
          secureTextEntry={secureTextEntry && !showPassword}
          multiline={multiline}
          placeholderTextColor={Colors.textSecondary}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...rest}
        />
        {secureTextEntry && (
          <TouchableOpacity
            onPress={() => setShowPassword((v) => !v)}
            style={styles.eyeButton}
          >
            <Text style={styles.eyeText}>{showPassword ? '🙈' : '👁️'}</Text>
          </TouchableOpacity>
        )}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
  },
  inputWrapperFocused: {
    borderColor: Colors.primary,
  },
  inputWrapperError: {
    borderColor: Colors.danger,
  },
  inputWrapperMultiline: {
    alignItems: 'flex-start',
    minHeight: 100,
    paddingVertical: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.text,
    paddingVertical: Spacing.sm + 2,
    minHeight: 44,
  },
  inputMultiline: {
    textAlignVertical: 'top',
    minHeight: 80,
  },
  eyeButton: {
    padding: Spacing.xs,
  },
  eyeText: {
    fontSize: 16,
  },
  error: {
    fontSize: FontSize.xs,
    color: Colors.danger,
    marginTop: Spacing.xs,
    marginLeft: Spacing.xs,
  },
  requiredStar: {
    color: Colors.danger,
    fontWeight: FontWeight.bold,
  },
});
