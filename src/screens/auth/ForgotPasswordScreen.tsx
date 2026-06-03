import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { AppButton } from '../../components/AppButton';
import { AppTextInput } from '../../components/AppTextInput';
import { FormKeyboardView } from '../../components/FormKeyboardView';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

export function ForgotPasswordScreen({ navigation }: Props) {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function handleSendReset() {
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    setError('');
    setLoading(true);
    const { error: resetError } = await requestPasswordReset(email.trim().toLowerCase());
    setLoading(false);

    if (resetError) {
      setError(resetError);
      return;
    }
    setSent(true);
  }

  return (
    <FormKeyboardView contentContainerStyle={styles.container} keyboardVerticalOffset={0}>
      <View style={styles.form}>
        <Text style={styles.title}>Reset password</Text>
        <Text style={styles.subtitle}>
          Enter your email and we will send a fresh reset link.
        </Text>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {sent ? (
          <View style={styles.successBox}>
            <Text style={styles.successText}>
              Check your email. Open the newest reset link on this device.
            </Text>
          </View>
        ) : null}

        <AppTextInput
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />

        <AppButton title="Send Reset Link" onPress={handleSendReset} loading={loading} fullWidth />

        <TouchableOpacity style={styles.backButton} onPress={() => navigation.navigate('Login')}>
          <Text style={styles.link}>Back to sign in</Text>
        </TouchableOpacity>
      </View>
    </FormKeyboardView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: Spacing.lg, justifyContent: 'center' },
  form: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 4,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
  },
  errorBox: {
    backgroundColor: Colors.danger + '15',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  errorText: { color: Colors.danger, fontSize: FontSize.sm },
  successBox: {
    backgroundColor: Colors.success + '15',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  successText: { color: Colors.success, fontSize: FontSize.sm },
  backButton: { alignItems: 'center', marginTop: Spacing.md },
  link: {
    color: Colors.primary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semiBold,
  },
});
