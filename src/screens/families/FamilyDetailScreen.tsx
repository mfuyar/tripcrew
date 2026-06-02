import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Switch, Platform } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainStackParamList, FamilyMember } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useTripContext } from '../../contexts/TripContext';
import { familyService } from '../../services/familyService';
import { notificationService } from '../../services/notificationService';
import { FamilyAvatar } from '../../components/FamilyAvatar';
import { AppButton } from '../../components/AppButton';
import { displayName } from '../../utils/displayName';
import { LoadingView } from '../../components/LoadingView';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../constants/theme';

type Props = NativeStackScreenProps<MainStackParamList, 'FamilyDetail'>;

export function FamilyDetailScreen({ navigation, route }: Props) {
  const { tripId, familyId } = route.params;
  const { user, profile, isDemoMode } = useAuth();
  const { families, userFamily, members: tripMembers } = useTripContext();
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingPush, setSendingPush] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  const family = families.find((f) => f.id === familyId);

  // Trip members not yet assigned to any family
  const unassigned = tripMembers.filter((m) => !m.family_id && m.user_id !== user?.id);
  // Is the current user an admin of this family?
  const isMyFamily = familyMembers.some((m) => m.user_id === user?.id);
  const isAdmin = familyMembers.some((m) => m.user_id === user?.id && m.is_admin);

  async function refresh() {
    if (isDemoMode) { setLoading(false); return; }
    const { data } = await familyService.getFamilyMembers(familyId);
    setFamilyMembers(data ?? []);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, [familyId, isDemoMode]);

  async function handleAddMember(tripMemberId: string, name: string) {
    setAdding(tripMemberId);
    const { error } = await familyService.addFamilyMember(familyId, tripId, tripMemberId);
    setAdding(null);
    if (error) { Alert.alert('Error', error); return; }
    refresh();
  }

  async function handleRemoveMember(memberId: string, memberUserId: string) {
    const confirmed = Platform.OS === 'web'
      ? window.confirm('Remove this member from the family?')
      : await new Promise<boolean>((resolve) =>
          Alert.alert('Remove Member', 'Remove from this family?', [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Remove', style: 'destructive', onPress: () => resolve(true) },
          ])
        );
    if (!confirmed) return;
    await familyService.removeFamilyMember(familyId, memberUserId);
    setFamilyMembers((prev) => prev.filter((m) => m.id !== memberId));
  }

  if (loading) return <LoadingView />;
  if (!family) return null;

  async function handleTogglePushTalk(member: FamilyMember, enabled: boolean) {
    const { data, error } = await familyService.updateFamilyMemberPushTalk(member.id, enabled);
    if (error) return Alert.alert('Unable to update push talk setting', error);
    setFamilyMembers((prev) => prev.map((m) => (m.id === member.id ? data ?? m : m)));
  }

  async function handleSendPushTalk() {
    if (!user || !family) return;
    const recipients = familyMembers.filter((m) => m.push_talk_enabled && m.user_id !== user.id);
    if (recipients.length === 0) {
      return Alert.alert('No recipients', 'No family members have opted in to receive push talk messages.');
    }

    setSendingPush(true);
    const title = 'Push talk ping';
    const body = `${profile?.full_name ?? 'A family member'} sent a push talk ping.`;
    await Promise.all(recipients.map((recipient) => notificationService.createNotification({
      user_id: recipient.user_id,
      trip_id: tripId,
      type: 'push_talk',
      title,
      body,
      data: { family_id: familyId, family_name: family.name, sender_id: user.id },
      is_read: false,
    })));
    setSendingPush(false);
    Alert.alert('Push talk sent', `Sent to ${recipients.length} opted-in member${recipients.length === 1 ? '' : 's'}.`);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Family header */}
      <View style={styles.header}>
        <FamilyAvatar name={family.name} color={family.color} size={80} />
        <Text style={styles.name}>{family.name}</Text>
        <Text style={styles.meta}>
          {family.adults_count} adult{family.adults_count !== 1 ? 's' : ''}
          {family.children_count > 0 ? ` • ${family.children_count} kid${family.children_count !== 1 ? 's' : ''}` : ''}
        </Text>
        {family.notes ? <Text style={styles.notes}>{family.notes}</Text> : null}
      </View>

      {/* Join this family — shown to trip members who aren't in any family yet */}
      {!userFamily && (
        <AppButton
          title="Join this Family"
          onPress={() => navigation.navigate('JoinFamily', { tripId })}
          fullWidth
          style={styles.editBtn}
        />
      )}

      <AppButton
        title="Edit Family"
        onPress={() => navigation.navigate('AddEditFamily', { tripId, familyId })}
        variant="outline"
        fullWidth
        style={styles.editBtn}
      />

      <AppButton
        title="Send Push Talk Ping"
        onPress={handleSendPushTalk}
        loading={sendingPush}
        fullWidth
        style={styles.pushTalkBtn}
      />

      {/* Current Members */}
      <Text style={styles.sectionTitle}>Members ({familyMembers.length})</Text>
      {familyMembers.length === 0 ? (
        <Text style={styles.emptyText}>No members linked yet.</Text>
      ) : (
        familyMembers.map((m) => (
          <View key={m.id} style={styles.memberCard}>
            <FamilyAvatar name={m.profile?.full_name ?? '?'} size={40} />
            <View style={styles.memberInfo}>
              <Text style={styles.memberName}>{m.profile?.full_name?.split(' ')[0] ?? 'Unknown'}</Text>
              <Text style={styles.memberEmail}>{m.profile?.email ?? ''}</Text>
              <Text style={styles.pushTalkLabel}>
                {m.push_talk_enabled ? '🔔 Push talk on' : '🔕 Push talk off'}
              </Text>
            </View>
            {m.is_admin && (
              <View style={styles.adminBadge}>
                <Text style={styles.adminText}>Admin</Text>
              </View>
            )}
            <View style={styles.memberActions}>
              {user?.id === m.user_id && (
                <Switch
                  value={m.push_talk_enabled}
                  onValueChange={(v) => handleTogglePushTalk(m, v)}
                  thumbColor={m.push_talk_enabled ? Colors.primary : Colors.surface}
                  trackColor={{ false: Colors.border, true: Colors.primary + '40' }}
                />
              )}
              {isAdmin && !m.is_admin && user?.id !== m.user_id && (
                <TouchableOpacity onPress={() => handleRemoveMember(m.id, m.user_id)}>
                  <Text style={styles.removeText}>Remove</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))
      )}

      {/* Add unassigned trip members — visible to family admin */}
      {isAdmin && unassigned.length > 0 && (
        <View style={styles.addSection}>
          <Text style={styles.sectionTitle}>Add trip members to this family</Text>
          {unassigned.map((m) => (
            <View key={m.id} style={styles.memberCard}>
              <FamilyAvatar name={m.profile?.full_name ?? '?'} size={40} />
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{m.profile?.full_name ?? 'Unknown'}</Text>
                <Text style={styles.memberEmail}>{m.profile?.email ?? ''}</Text>
              </View>
              <TouchableOpacity
                style={[styles.addBtn, adding === m.user_id && styles.addBtnDisabled]}
                onPress={() => handleAddMember(m.user_id, m.profile?.full_name ?? '')}
                disabled={adding !== null}
              >
                <Text style={styles.addBtnText}>{adding === m.user_id ? '…' : '+ Add'}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md },
  header: { alignItems: 'center', marginBottom: Spacing.lg },
  name: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.text, marginTop: Spacing.md },
  meta: { fontSize: FontSize.md, color: Colors.textSecondary, marginTop: Spacing.xs },
  notes: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.sm },
  editBtn: { marginBottom: Spacing.lg },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semiBold, color: Colors.text, marginBottom: Spacing.md },
  emptyText: { fontSize: FontSize.md, color: Colors.textSecondary, textAlign: 'center' },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadow.sm,
  },
  memberInfo: { flex: 1, marginLeft: Spacing.md },
  memberName: { fontSize: FontSize.md, fontWeight: FontWeight.medium, color: Colors.text },
  memberEmail: { fontSize: FontSize.xs, color: Colors.textSecondary },
  adminBadge: {
    backgroundColor: Colors.primary + '20',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  adminText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semiBold },
  pushTalkBtn: { marginBottom: Spacing.lg },
  pushTalkLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  memberActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  removeText: { fontSize: FontSize.sm, color: Colors.danger },
  addSection: { marginTop: Spacing.lg },
  addBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  addBtnDisabled: { opacity: 0.5 },
  addBtnText: { color: Colors.surface, fontSize: FontSize.sm, fontWeight: FontWeight.semiBold },
});
