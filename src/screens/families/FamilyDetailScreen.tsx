import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Switch } from 'react-native';
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
  const { families, userFamily } = useTripContext();
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingPush, setSendingPush] = useState(false);

  const family = families.find((f) => f.id === familyId);

  useEffect(() => {
    if (isDemoMode) { setLoading(false); return; }
    familyService.getFamilyMembers(familyId).then(({ data }) => {
      setMembers(data ?? []);
      setLoading(false);
    });
  }, [familyId, isDemoMode]);

  if (loading) return <LoadingView />;
  if (!family) return null;

  async function handleTogglePushTalk(member: FamilyMember, enabled: boolean) {
    const { data, error } = await familyService.updateFamilyMemberPushTalk(member.id, enabled);
    if (error) return Alert.alert('Unable to update push talk setting', error);
    setMembers((prev) => prev.map((m) => (m.id === member.id ? data ?? m : m)));
  }

  async function handleSendPushTalk() {
    if (!user || !family) return;
    const recipients = members.filter((m) => m.push_talk_enabled && m.user_id !== user.id);
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

      {/* Members */}
      <Text style={styles.sectionTitle}>Members ({members.length})</Text>
      {members.length === 0 ? (
        <Text style={styles.emptyText}>No members linked yet.</Text>
      ) : (
        members.map((m) => (
          <View key={m.id} style={styles.memberCard}>
            <FamilyAvatar name={m.profile?.full_name ?? '?'} size={40} />
            <View style={styles.memberInfo}>
              <Text style={styles.memberName}>{m.profile?.full_name?.split(' ')[0] ?? 'Unknown'}</Text>
              <Text style={styles.memberEmail}>{m.profile?.email ?? ''}</Text>
              <View style={styles.pushTalkRow}>
                <Text style={styles.pushTalkLabel}>
                  {m.push_talk_enabled ? 'Receiving push talk' : 'Not receiving push talk'}
                </Text>
              </View>
            </View>
            {m.is_admin && (
              <View style={styles.adminBadge}>
                <Text style={styles.adminText}>Admin</Text>
              </View>
            )}
            {user?.id === m.user_id && (
              <Switch
                value={m.push_talk_enabled}
                onValueChange={(value) => handleTogglePushTalk(m, value)}
                thumbColor={m.push_talk_enabled ? Colors.primary : Colors.surface}
                trackColor={{ false: Colors.border, true: Colors.primary + '40' }}
              />
            )}
          </View>
        ))
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
  pushTalkRow: { marginTop: Spacing.xs, flexDirection: 'row', alignItems: 'center' },
  pushTalkLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, marginRight: Spacing.sm },
});
