import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Alert, Platform, Linking,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationsContext';
import { authService } from '../../services/authService';
import { AppTextInput } from '../../components/AppTextInput';
import { AppButton } from '../../components/AppButton';
import { FamilyAvatar } from '../../components/FamilyAvatar';
import { FormKeyboardView } from '../../components/FormKeyboardView';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../constants/theme';

export function ProfileScreen() {
  const { user, profile, signOut, refreshProfile, isDemoMode } = useAuth();
  const { enablePushNotifications, pushTokenError, notificationsEnabled } = useNotifications();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [enablingNotifications, setEnablingNotifications] = useState(false);

  async function handleSave() {
    if (!user || isDemoMode) { Alert.alert('Demo Mode', 'Profile editing is disabled in demo.'); return; }
    setSaving(true);
    const { error } = await authService.updateProfile(user.id, {
      full_name: name.trim(),
      phone: phone.trim() || undefined,
    });
    setSaving(false);
    if (error) {
      Alert.alert('Error', error);
    } else {
      await refreshProfile();
      setEditing(false);
    }
  }

  async function handleSignOut() {
    if (Platform.OS === 'web') {
      // Alert.alert confirmation buttons don't work on web
      if (window.confirm('Are you sure you want to sign out?')) {
        await signOut();
      }
      return;
    }
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  }

  async function handleEnableNotifications() {
    if (isDemoMode) {
      Alert.alert('Demo Mode', 'Notifications are disabled in demo.');
      return;
    }

    setEnablingNotifications(true);
    const { data, error } = await enablePushNotifications();
    setEnablingNotifications(false);

    if (data) {
      Alert.alert('Notifications Enabled', 'You will receive push talk, message, and announcement alerts.');
      return;
    }

    if (error?.includes('not granted')) {
      Alert.alert('Notifications Disabled', 'Enable notifications in Settings to receive trip alerts.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]);
      return;
    }

    Alert.alert('Notifications', error ?? 'Notifications could not be enabled.');
  }

  return (
    <FormKeyboardView contentContainerStyle={styles.container}>
        {/* Profile header */}
        <View style={styles.header}>
          <FamilyAvatar name={profile?.full_name ?? user?.email ?? '?'} size={80} />
          <Text style={styles.name}>{profile?.full_name ?? 'Your Name'}</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </View>

        {/* Edit form */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Profile Info</Text>
            {!editing && (
              <Text style={styles.editLink} onPress={() => setEditing(true)}>Edit</Text>
            )}
          </View>

          {editing ? (
            <>
              <AppTextInput label="Full Name" value={name} onChangeText={setName} placeholder="Your full name" />
              <AppTextInput label="Phone" value={phone} onChangeText={setPhone} placeholder="+1 (555) 123-4567" keyboardType="phone-pad" />
              <View style={styles.editActions}>
                <AppButton title="Save" onPress={handleSave} loading={saving} style={styles.halfBtn} />
                <AppButton title="Cancel" onPress={() => setEditing(false)} variant="outline" style={styles.halfBtn} />
              </View>
            </>
          ) : (
            <View style={styles.infoRows}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Name</Text>
                <Text style={styles.infoValue}>{profile?.full_name ?? '—'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Email</Text>
                <Text style={styles.infoValue}>{user?.email ?? '—'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Phone</Text>
                <Text style={styles.infoValue}>{profile?.phone ?? '—'}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Notifications */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Notifications</Text>
          <Text style={styles.appInfo}>
            Receive push talk, message, and announcement alerts.
          </Text>
          {notificationsEnabled ? (
            <View style={styles.notifEnabledRow}>
              <Text style={styles.notifEnabledIcon}>🔔</Text>
              <Text style={styles.notifEnabledText}>Notifications are enabled</Text>
            </View>
          ) : (
            <>
              {pushTokenError ? <Text style={styles.noticeText}>{pushTokenError}</Text> : null}
              <AppButton
                title="Enable Notifications"
                onPress={handleEnableNotifications}
                loading={enablingNotifications}
                fullWidth
                style={styles.notificationBtn}
              />
            </>
          )}
        </View>

        {/* App info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>About TripCrew</Text>
          <Text style={styles.appInfo}>
            Plan together. Pay fairly. Remember everything.
          </Text>
          <Text style={styles.version}>Version 1.0.0 (MVP)</Text>
        </View>

        {/* Sign out */}
        <AppButton
          title="Sign Out"
          onPress={handleSignOut}
          variant="danger"
          fullWidth
          style={styles.signOutBtn}
        />
    </FormKeyboardView>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.md, paddingTop: Spacing.xl },
  header: { alignItems: 'center', marginBottom: Spacing.xl },
  name: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.text, marginTop: Spacing.md },
  email: { fontSize: FontSize.md, color: Colors.textSecondary, marginTop: Spacing.xs },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.md, ...Shadow.sm },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  cardTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semiBold, color: Colors.text },
  editLink: { fontSize: FontSize.md, color: Colors.primary, fontWeight: FontWeight.semiBold },
  editActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  halfBtn: { flex: 1 },
  infoRows: {},
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  infoLabel: { fontSize: FontSize.sm, color: Colors.textSecondary },
  infoValue: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.text },
  appInfo: { fontSize: FontSize.md, color: Colors.textSecondary, fontStyle: 'italic', marginBottom: Spacing.sm },
  noticeText: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.sm },
  notificationBtn: { marginTop: Spacing.xs },
  notifEnabledRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xs },
  notifEnabledIcon: { fontSize: 20 },
  notifEnabledText: { fontSize: FontSize.sm, color: Colors.success, fontWeight: FontWeight.semiBold },
  version: { fontSize: FontSize.xs, color: Colors.textSecondary },
  signOutBtn: { marginTop: Spacing.sm },
});
