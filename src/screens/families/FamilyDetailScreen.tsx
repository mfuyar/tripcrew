import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  TouchableOpacity,
  Alert,
  Platform,
  TextInput,
  Linking,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainStackParamList, FamilyMember } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useTripContext } from '../../contexts/TripContext';
import { familyService } from '../../services/familyService';
import { tripService } from '../../services/tripService';
import { notificationService } from '../../services/notificationService';
import { FamilyAvatar } from '../../components/FamilyAvatar';
import { AppButton } from '../../components/AppButton';
import { LoadingView } from '../../components/LoadingView';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../constants/theme';
import { buildTripInviteLink } from '../../constants/auth';

type Props = NativeStackScreenProps<MainStackParamList, 'FamilyDetail'>;

function familyCapacity(adultsCount: number, childrenCount: number): number {
  return adultsCount + childrenCount;
}

function memberName(member: FamilyMember, fallbackName?: string | null, fallbackEmail?: string | null): string {
  return member.profile?.full_name?.trim()
    || fallbackName?.trim()
    || member.profile?.email
    || fallbackEmail
    || 'Unknown';
}

function memberDisplayName(member: FamilyMember, isMe: boolean, fallbackName?: string | null, fallbackEmail?: string | null): string {
  const name = memberName(member, isMe ? fallbackName : undefined, isMe ? fallbackEmail : undefined);
  return name;
}

export function FamilyDetailScreen({ navigation, route }: Props) {
  const { tripId, familyId } = route.params;
  const { user, profile, isDemoMode } = useAuth();
  const {
    families,
    setFamilies,
    currentTrip,
    userFamily,
    members: tripMembers,
    setMembers,
    canManageTrip,
  } = useTripContext();
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingPush, setSendingPush] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  const family = families.find((f) => f.id === familyId);

  // Trip members not yet assigned to any family
  const unassigned = tripMembers.filter((m) => !m.family_id && (canManageTrip || m.user_id !== user?.id));
  // Is the current user an admin of this family?
  const isMyFamily = familyMembers.some((m) => m.user_id === user?.id);
  const isAdmin = familyMembers.some((m) => m.user_id === user?.id && m.is_admin);
  const canManageFamily = canManageTrip || isAdmin;
  const memberCapacity = family ? familyCapacity(family.adults_count, family.children_count) : 0;
  const familyIsFull = Boolean(family && familyMembers.length >= memberCapacity);
  const isCurrentUserFamily = userFamily?.id === familyId;
  const canShowFamilyChoice = !isCurrentUserFamily;

  function showFamilyFullError() {
    Alert.alert(
      'Family is full',
      'This family is already at its defined head count. Increase the head count in the family first, then add another member.'
    );
  }

  async function refresh() {
    if (isDemoMode) { setLoading(false); return; }
    const { data } = await familyService.getFamilyMembers(familyId);
    setFamilyMembers(data ?? []);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, [familyId, isDemoMode]);

  async function handleAddMember(tripMemberId: string, name: string) {
    if (familyIsFull) {
      showFamilyFullError();
      return;
    }

    setAdding(tripMemberId);
    const { error } = await familyService.addFamilyMember(familyId, tripId, tripMemberId);
    setAdding(null);
    if (error) { Alert.alert('Error', error); return; }
    setMembers(tripMembers.map((m) => (
      m.user_id === tripMemberId ? { ...m, family_id: familyId, family } : m
    )));
    refresh();
  }

  function buildInviteEmail() {
    const email = inviteEmail.trim().toLowerCase();
    const name = inviteName.trim();
    const tripName = currentTrip?.name ?? 'our trip';
    const inviteCode = currentTrip?.invite_code ?? '';
    const subject = `Join ${tripName} on Travel Crew`;
    const greeting = name ? `Hi ${name},` : 'Hi,';
    const body = [
      greeting,
      '',
      `I added your family to ${tripName} in Travel Crew.`,
      inviteCode ? `Tap to join: ${buildTripInviteLink(inviteCode)}` : '',
      inviteCode ? `Or enter invite code: ${inviteCode}` : '',
      '',
      `Family: ${family?.name ?? 'Family'}`,
      '',
      'After you sign in or create an account, join the trip with the invite link/code and the organizer can place you in the family.',
    ].filter(Boolean).join('\n');

    return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  async function handleSendInviteEmail() {
    const email = inviteEmail.trim().toLowerCase();
    if (!email.includes('@')) {
      Alert.alert('Email required', 'Enter a valid email address to send an invite.');
      return;
    }

    const url = buildInviteEmail();
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      Alert.alert('Email unavailable', 'No email app is available on this device.');
      return;
    }
    await Linking.openURL(url);
  }

  async function handleInviteByEmail() {
    if (familyIsFull) {
      showFamilyFullError();
      return;
    }

    const email = inviteEmail.trim().toLowerCase();
    if (!email.includes('@')) {
      Alert.alert('Email required', 'Enter a valid email address.');
      return;
    }

    setInviting(true);
    const { data, error } = await familyService.addFamilyMemberByEmail(familyId, tripId, email);
    setInviting(false);

    if (data) {
      const [{ data: refreshedFamilyMembers }, { data: refreshedTripMembers }] = await Promise.all([
        familyService.getFamilyMembers(familyId),
        tripService.getTripMembers(tripId),
      ]);
      setFamilyMembers(refreshedFamilyMembers ?? []);
      if (refreshedTripMembers) setMembers(refreshedTripMembers);
      setInviteName('');
      setInviteEmail('');
      Alert.alert('Member Added', `${email} was added to ${family?.name ?? 'this family'}.`);
      return;
    }

    if (error?.includes('No Travel Crew account') || error?.includes('No TripCrew account') || error?.includes('migration')) {
      Alert.alert('Send Invite Email', error, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send Email', onPress: handleSendInviteEmail },
      ]);
      return;
    }

    Alert.alert('Unable to Add Member', error ?? 'Could not add member by email.');
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
    const { error } = await familyService.removeFamilyMember(familyId, memberUserId);
    if (error) { Alert.alert('Error', error); return; }
    setFamilyMembers((prev) => prev.filter((m) => m.id !== memberId));
    setMembers(tripMembers.map((m) => (
      m.user_id === memberUserId ? { ...m, family_id: undefined, family: undefined } : m
    )));
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
    const recipients = familyMembers.filter((m) => m.user_id !== user.id);
    if (recipients.length === 0) {
      return Alert.alert('No recipients', 'No other family members are in this family yet.');
    }

    setSendingPush(true);
    const title = 'Family ping';
    const body = `${profile?.full_name ?? 'A family member'} wants ${family.name} to check the trip chat.`;
    const { error } = await notificationService.notifyUsers(
      recipients.map((recipient) => recipient.user_id),
      tripId,
      'push_talk',
      title,
      body,
      {
        type: 'push_talk',
        trip_id: tripId,
        family_id: familyId,
        family_name: family.name,
        sender_id: user.id,
        family_only: true,
        push_talk_ping: true,
      }
    );
    setSendingPush(false);
    if (error) {
      Alert.alert('Family ping failed', error);
      return;
    }
    Alert.alert('Family ping sent', `Sent to ${recipients.length} family member${recipients.length === 1 ? '' : 's'}.`);
  }

  async function handleDeleteFamily() {
    if (!family) return;
    Alert.alert('Delete Family', `Delete ${family.name}? Members will stay in the trip but become unassigned.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await familyService.deleteFamily(familyId);
          if (error) { Alert.alert('Error', error); return; }
          setFamilies(families.filter((f) => f.id !== familyId));
          setMembers(tripMembers.map((m) => (
            m.family_id === familyId ? { ...m, family_id: undefined, family: undefined } : m
          )));
          navigation.goBack();
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={96}
    >
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
    >
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

      {/* Family choice — join if unassigned, change if already in another family */}
      {canShowFamilyChoice && (
        <AppButton
          title={userFamily ? 'Change Family' : 'Join this Family'}
          onPress={() => navigation.navigate('JoinFamily', { tripId })}
          variant={userFamily ? 'outline' : 'primary'}
          fullWidth
          style={styles.editBtn}
        />
      )}

      {isCurrentUserFamily && (
        <View style={styles.currentFamilyBanner}>
          <Text style={styles.currentFamilyText}>You are in this family.</Text>
        </View>
      )}

      {canManageFamily && (
        <AppButton
          title="Edit Family"
          onPress={() => navigation.navigate('AddEditFamily', { tripId, familyId })}
          variant="outline"
          fullWidth
          style={styles.editBtn}
        />
      )}

      <AppButton
        title="🔔 Send Family Ping"
        onPress={handleSendPushTalk}
        loading={sendingPush}
        fullWidth
        style={styles.pushTalkBtn}
      />
      <Text style={styles.pushTalkLabel}>
        Sends a notification to other family members and opens trip chat when they tap it.
      </Text>

      {/* Current Members */}
      <Text style={styles.sectionTitle}>Members ({familyMembers.length}/{memberCapacity})</Text>
      {familyIsFull ? (
        <View style={styles.fullBanner}>
          <Text style={styles.fullBannerText}>
            This family is at its defined head count. Increase the head count in the family first to add another member.
          </Text>
        </View>
      ) : null}
      {familyMembers.length === 0 ? (
        <Text style={styles.emptyText}>No members linked yet.</Text>
      ) : (
        familyMembers.map((m) => {
          // Match by UUID, with email fallback in case of session/profile ID mismatch
          const isMe = user?.id === m.user_id || user?.email === m.profile?.email;
          const displayMemberName = memberDisplayName(m, isMe, profile?.full_name, user?.email);
          return (
            <View key={m.id} style={styles.memberCard}>
              {/* Top row: avatar + info + push-talk */}
              <View style={styles.memberCardTop}>
                <FamilyAvatar name={memberName(m, isMe ? profile?.full_name : undefined, isMe ? user?.email : undefined)} size={40} />
                <View style={styles.memberMain}>
                  <View style={styles.memberInfo}>
                    <View style={styles.nameRow}>
                      <Text style={[styles.memberName, isMe && styles.selfMemberName]} numberOfLines={2}>
                        {displayMemberName}
                      </Text>
                      {isMe && (
                        <View style={styles.youBadge}>
                          <Text style={styles.youBadgeText}>You</Text>
                        </View>
                      )}
                      {m.is_admin && (
                        <View style={styles.adminBadge}>
                          <Text style={styles.adminText}>Family Admin</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.memberEmail} numberOfLines={1}>{m.profile?.email ?? ''}</Text>
                  </View>
                  {/* Push talk toggle — only the member themselves can change it */}
                  {isMe ? (
                    <TouchableOpacity
                      style={[styles.pushTalkBtn2, m.push_talk_enabled && styles.pushTalkBtnOn]}
                      onPress={() => handleTogglePushTalk(m, !m.push_talk_enabled)}
                    >
                      <Text style={[styles.pushTalkBtnText, m.push_talk_enabled && styles.pushTalkBtnTextOn]}>
                        {m.push_talk_enabled ? '🔔 Live Audio On' : '▶ Manual'}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.pushTalkStatus}>
                      {m.push_talk_enabled ? '🔔' : '▶'}
                    </Text>
                  )}
                </View>
              </View>

              {/* Bottom row: admin toggle + remove (managers only, not self) */}
              {canManageFamily && !isMe && (
                <View style={styles.memberCardActions}>
                  {canManageTrip && (
                    <TouchableOpacity
                      style={[styles.memberActionBtn, m.is_admin && styles.memberActionBtnActive]}
                      onPress={() => {
                        const label = m.is_admin ? 'Remove Family Admin' : 'Make Family Admin';
                        const msg = m.is_admin
                          ? `Remove Family Admin from ${m.profile?.full_name}?`
                          : `Make ${m.profile?.full_name} a Family Admin? They can add/remove members.`;
                        Alert.alert(label, msg, [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: label,
                            onPress: async () => {
                              const { data, error } = await familyService.setFamilyMemberAdmin(m.id, !m.is_admin);
                              if (error) Alert.alert('Error', error);
                              else if (data) setFamilyMembers((prev) => prev.map((x) => x.id === m.id ? data : x));
                            },
                          },
                        ]);
                      }}
                    >
                      <Text style={[styles.memberActionText, m.is_admin && styles.memberActionTextActive]}>
                        {m.is_admin ? 'Family Admin ✓' : 'Make Family Admin'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {(!m.is_admin || canManageTrip) && (
                    <TouchableOpacity
                      style={styles.memberActionBtnDanger}
                      onPress={() => handleRemoveMember(m.id, m.user_id)}
                    >
                      <Text style={styles.removeText}>Remove</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          );
        })
      )}

      {/* Add unassigned trip members — visible to family managers */}
      {canManageFamily && unassigned.length > 0 && (
        <View style={styles.addSection}>
          <Text style={styles.sectionTitle}>Add trip members to this family</Text>
          {unassigned.map((m) => (
            <View key={m.id} style={styles.memberCard}>
              <FamilyAvatar name={m.profile?.full_name ?? '?'} size={40} />
              <View style={styles.memberInfo}>
                <Text style={[styles.memberName, m.user_id === user?.id && styles.selfMemberName]}>
                  {m.user_id === user?.id ? profile?.full_name ?? user?.email ?? m.profile?.full_name ?? m.profile?.email ?? 'Unknown' : m.profile?.full_name ?? 'Unknown'}
                </Text>
                {m.user_id === user?.id && (
                  <View style={styles.youBadge}>
                    <Text style={styles.youBadgeText}>You</Text>
                  </View>
                )}
                <Text style={styles.memberEmail}>{m.profile?.email ?? ''}</Text>
              </View>
              <TouchableOpacity
                style={[styles.addBtn, (adding === m.user_id || familyIsFull) && styles.addBtnDisabled]}
                onPress={() => handleAddMember(m.user_id, m.profile?.full_name ?? '')}
                disabled={adding !== null || familyIsFull}
              >
                <Text style={styles.addBtnText}>{familyIsFull ? 'Full' : adding === m.user_id ? '…' : '+ Add'}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {canManageTrip && (
        <View style={styles.inviteSection}>
          <Text style={styles.sectionTitle}>Invite family member</Text>
          <Text style={styles.inviteHelp}>
            Add an existing Travel Crew user by email, or send the trip invite code.
          </Text>
          <TextInput
            style={styles.input}
            value={inviteName}
            onChangeText={setInviteName}
            placeholder="Name"
            placeholderTextColor={Colors.textSecondary}
            returnKeyType="next"
          />
          <TextInput
            style={styles.input}
            value={inviteEmail}
            onChangeText={setInviteEmail}
            placeholder="email@example.com"
            placeholderTextColor={Colors.textSecondary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="send"
            onSubmitEditing={handleInviteByEmail}
          />
          <View style={styles.inviteActions}>
            <AppButton
              title="Add by Email"
              onPress={handleInviteByEmail}
              loading={inviting}
              disabled={familyIsFull}
              style={styles.inviteAction}
            />
            <AppButton
              title="Send Invite"
              onPress={handleSendInviteEmail}
              variant="outline"
              style={styles.inviteAction}
            />
          </View>
        </View>
      )}

      {canManageTrip && (
        <AppButton
          title="Delete Family"
          onPress={handleDeleteFamily}
          variant="danger"
          fullWidth
          style={styles.deleteBtn}
        />
      )}
    </ScrollView>
    </KeyboardAvoidingView>
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
  currentFamilyBanner: {
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.lg,
    alignItems: 'center',
  },
  currentFamilyText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: FontWeight.semiBold,
  },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semiBold, color: Colors.text, marginBottom: Spacing.md },
  fullBanner: {
    backgroundColor: Colors.warning + '20',
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  fullBannerText: { fontSize: FontSize.sm, color: Colors.warning, lineHeight: 18 },
  emptyText: { fontSize: FontSize.md, color: Colors.textSecondary, textAlign: 'center' },
  memberCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadow.sm,
  },
  memberCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  memberCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginLeft: 40 + Spacing.md, // align with name (avatar width + margin)
  },
  memberActionBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.warning,
  },
  memberActionBtnActive: { backgroundColor: Colors.warning + '20' },
  memberActionText: { fontSize: FontSize.xs, color: Colors.warning, fontWeight: FontWeight.semiBold },
  memberActionTextActive: { color: Colors.warning },
  memberActionBtnDanger: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.danger + '60',
  },
  memberMain: {
    flex: 1,
    minWidth: 0,
    marginLeft: Spacing.md,
  },
  memberInfo: { flex: 1, minWidth: 0 },
  memberName: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
    color: Colors.text,
  },
  selfMemberName: { color: Colors.primary, fontWeight: FontWeight.semiBold },
  memberEmail: { fontSize: FontSize.xs, color: Colors.textSecondary },
  adminBadge: {
    backgroundColor: Colors.warning + '20',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  adminText: { fontSize: FontSize.xs, color: Colors.warning, fontWeight: FontWeight.semiBold },
  youBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  youBadgeText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.bold },
  adminToggleText: { fontSize: FontSize.xs, color: Colors.warning, fontWeight: FontWeight.semiBold },
  adminToggleActiveText: { color: Colors.success },
  pushTalkBtn: { marginBottom: Spacing.sm },
  pushTalkLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    lineHeight: 17,
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  memberActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  removeText: { fontSize: FontSize.sm, color: Colors.danger },
  pushTalkBtn2: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    alignSelf: 'flex-start',
    marginTop: Spacing.xs,
  },
  pushTalkBtnOn: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  pushTalkBtnText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.semiBold },
  pushTalkBtnTextOn: { color: Colors.primary },
  pushTalkStatus: { fontSize: 18, marginTop: Spacing.xs },
  addSection: { marginTop: Spacing.lg },
  inviteSection: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginTop: Spacing.lg,
    ...Shadow.sm,
  },
  inviteHelp: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.text,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.background,
  },
  inviteActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  inviteAction: { flex: 1 },
  deleteBtn: { marginTop: Spacing.lg },
  addBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  addBtnDisabled: { opacity: 0.5 },
  addBtnText: { color: Colors.surface, fontSize: FontSize.sm, fontWeight: FontWeight.semiBold },
});
