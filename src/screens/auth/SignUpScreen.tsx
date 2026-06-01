import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { AppTextInput } from '../../components/AppTextInput';
import { AppButton } from '../../components/AppButton';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../constants/theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'SignUp'>;

export function SignUpScreen({ navigation }: Props) {
  const { signUp } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function handleSignUp() {
    if (!fullName.trim()) {
      setError('Please enter your full name.');
      return;
    }
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setError('');
    setLoading(true);
    const { error: e } = await signUp(email.trim().toLowerCase(), password, fullName.trim());
    setLoading(false);
    if (e) {
      setError(e);
    } else {
      setSuccess(true);
    }
  }

  if (success) {
    return (
      <View style={styles.successContainer}>
        <Text style={styles.successIcon}>🎉</Text>
        <Text style={styles.successTitle}>Account Created!</Text>
        <Text style={styles.successSubtitle}>
          Check your email to verify your account, then sign in.
        </Text>
        <AppButton
          title="Back to Sign In"
          onPress={() => navigation.navigate('Login')}
          style={styles.button}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.logo}>✈️</Text>
          <Text style={styles.appName}>TripCrew</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.title}>Create an account</Text>
          <Text style={styles.subtitle}>Join TripCrew and plan your next adventure</Text>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <AppTextInput
            label="Full Name"
            value={fullName}
            onChangeText={setFullName}
            placeholder="Your full name"
            autoComplete="name"
          />
          <AppTextInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <AppTextInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            secureTextEntry
            autoComplete="new-password"
          />

          <AppButton
            title="Create Account"
            onPress={handleSignUp}
            loading={loading}
            fullWidth
          />

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.link}>Sign in</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
  container: {
    flexGrow: 1,
    padding: Spacing.lg,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  logo: {
    fontSize: 48,
    marginBottom: Spacing.sm,
  },
  appName: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
  },
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
  errorText: {
    color: Colors.danger,
    fontSize: FontSize.sm,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: Spacing.md,
  },
  footerText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  link: {
    color: Colors.primary,
    fontWeight: FontWeight.semiBold,
    fontSize: FontSize.sm,
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    backgroundColor: Colors.background,
  },
  successIcon: { fontSize: 64, marginBottom: Spacing.lg },
  successTitle: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  successSubtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.xl,
  },
  button: { width: '100%' },
});
