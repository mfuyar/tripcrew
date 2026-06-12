import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { AppTextInput } from '../../components/AppTextInput';
import { AppButton } from '../../components/AppButton';
import { FormKeyboardView } from '../../components/FormKeyboardView';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../constants/theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const { signIn, signInWithGoogle, signInDemo } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [acceptedPolicy, setAcceptedPolicy] = useState(false);

  function requirePolicyAgreement(): boolean {
    if (acceptedPolicy) return true;
    setError('Please agree to the Privacy Policy and Disclosure before using Travel Crew.');
    return false;
  }

  async function handleSignIn() {
    if (!requirePolicyAgreement()) return;
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setError('');
    setLoading(true);
    const { error: e } = await signIn(email.trim().toLowerCase(), password);
    setLoading(false);
    if (e) setError(e);
  }

  async function handleGoogle() {
    if (!requirePolicyAgreement()) return;
    setError('');
    setGoogleLoading(true);
    const { error: e } = await signInWithGoogle();
    setGoogleLoading(false);
    if (e) setError(e);
  }

  function handleDemo() {
    if (!requirePolicyAgreement()) return;
    signInDemo();
  }

  return (
    <FormKeyboardView contentContainerStyle={styles.container} keyboardVerticalOffset={0}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>🏖️</Text>
          <Text style={styles.appName}>Travel Crew</Text>
          <Text style={styles.slogan}>Plan together. Pay fairly. Remember everything.</Text>
        </View>

        {/* Form card */}
        <View style={styles.form}>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in to your account</Text>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
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
          <AppTextInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            secureTextEntry
            autoComplete="password"
          />

          <AppButton title="Sign In" onPress={handleSignIn} loading={loading} fullWidth />

          <TouchableOpacity
            style={styles.forgotButton}
            onPress={() => navigation.navigate('ForgotPassword')}
            activeOpacity={0.8}
          >
            <Text style={styles.link}>Forgot password?</Text>
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Google Sign-In */}
          <TouchableOpacity
            style={styles.googleButton}
            onPress={handleGoogle}
            disabled={googleLoading}
            activeOpacity={0.8}
          >
            <Text style={styles.googleIcon}>G</Text>
            <Text style={styles.googleText}>
              {googleLoading ? 'Opening Google…' : 'Continue with Google'}
            </Text>
          </TouchableOpacity>

          <View style={styles.consentBox}>
            <TouchableOpacity
              style={[styles.checkbox, acceptedPolicy && styles.checkboxChecked]}
              onPress={() => setAcceptedPolicy((prev) => !prev)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: acceptedPolicy }}
              activeOpacity={0.8}
            >
              {acceptedPolicy ? <Text style={styles.checkboxMark}>✓</Text> : null}
            </TouchableOpacity>
            <Text style={styles.consentText}>
              I agree to the{' '}
              <Text style={styles.policyLink} onPress={() => navigation.navigate('PrivacyPolicy')}>
                Privacy Policy and Disclosure
              </Text>
              .
            </Text>
          </View>

          {/* Demo mode */}
          <TouchableOpacity style={styles.demoButton} onPress={handleDemo} activeOpacity={0.8}>
            <Text style={styles.demoText}>🏖️  Try Demo — explore without sign-up</Text>
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('SignUp')}>
              <Text style={styles.link}>Create one</Text>
            </TouchableOpacity>
          </View>
        </View>

    </FormKeyboardView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: Spacing.lg, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: Spacing.xl },
  logo: { fontSize: 56, marginBottom: Spacing.sm },
  appName: {
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    marginBottom: Spacing.xs,
  },
  slogan: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  form: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
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
  forgotButton: { alignItems: 'flex-end', marginTop: Spacing.sm },
  consentBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: Radius.sm,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxChecked: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  checkboxMark: { color: Colors.surface, fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  consentText: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 18 },
  policyLink: { color: Colors.primary, fontWeight: FontWeight.semiBold },

  // Divider
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: Spacing.md },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: {
    marginHorizontal: Spacing.sm,
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },

  // Google button
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingVertical: 12,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  googleIcon: {
    fontSize: 18,
    fontWeight: FontWeight.bold,
    color: '#4285F4',
  },
  googleText: { fontSize: FontSize.md, fontWeight: FontWeight.semiBold, color: Colors.text },

  // Demo button
  demoButton: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: Radius.md,
    backgroundColor: Colors.primaryLight,
    marginBottom: Spacing.sm,
  },
  demoText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
    color: Colors.primary,
  },

  // Footer
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: Spacing.sm },
  footerText: { color: Colors.textSecondary, fontSize: FontSize.sm },
  link: { color: Colors.primary, fontWeight: FontWeight.semiBold, fontSize: FontSize.sm },
});
