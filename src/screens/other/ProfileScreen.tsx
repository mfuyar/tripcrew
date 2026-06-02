import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { authService } from '../../services/authService';
import { AppTextInput } from '../../components/AppTextInput';
import { AppButton } from '../../components/AppButton';
import { FamilyAvatar } from '../../components/FamilyAvatar';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../constants/theme';

export function ProfileScreen() {
  const { user, profile, signOut, refreshProfile, isDemoMode } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [saving, setSaving] = useState(false);

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

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container}>
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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
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
  version: { fontSize: FontSize.xs, color: Colors.textSecondary },
  signOutBtn: { marginTop: Spacing.sm },
});
