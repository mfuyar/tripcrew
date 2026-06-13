import React, { useState, useCallback, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Share,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AdminConsentRequest, MainStackParamList, TripJoinRequest, TripMember } from '../../types';
import { useTripContext } from '../../contexts/TripContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { tripService } from '../../services/tripService';
import { familyService } from '../../services/familyService';
import { adminAccessService } from '../../services/adminAccessService';
import { AppTextInput } from '../../components/AppTextInput';
import { AddressAutocomplete } from '../../components/AddressAutocomplete';
import { AppButton } from '../../components/AppButton';
import { displayName } from '../../utils/displayName';
import { FamilyAvatar } from '../../components/FamilyAvatar';
import { FormKeyboardView } from '../../components/FormKeyboardView';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow, TRIP_THEMES, DEFAULT_TRIP_EMOJI } from '../../constants/theme';
import { buildTripInviteLink } from '../../constants/auth';

type Props = NativeStackScreenProps<MainStackParamList, 'TripSettings'>;

function tripMemberName(member: TripMember, fallbackName?: string | null, fallbackEmail?: string | null): string {
  return member.profile?.full_name?.trim()
    || fallbackName?.trim()
    || member.profile?.email
    || fallbackEmail
    || 'Unknown';
}

export function TripSettingsScreen({ navigation, route }: Props) {
  const { tripId } = route.params;
  const {
    currentTrip,
    members,
    setMembers,
    families,
    setFamilies,
    isTripOrganizer,
    canManageTrip,
    setCurrentTrip,
  } = useTripContext();
  const { user, profile, isDemoMode, isGlobalAdmin } = useAuth();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(currentTrip?.name ?? '');
  const [destination, setDestination] = useState(currentTrip?.destination ?? '');
  const [coverEmoji, setCoverEmoji] = useState(currentTrip?.cover_emoji || DEFAULT_TRIP_EMOJI);
  const [joinRequests, setJoinRequests] = useState<TripJoinRequest[]>([]);
  const [canSeeRequests, setCanSeeRequests] = useState(canManageTrip || isGlobalAdmin);
  const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(null);
  const [adminRequests, setAdminRequests] = useState<AdminConsentRequest[]>([]);
  const [activeAdminAccess, setActiveAdminAccess] = useState<AdminConsentRequest[]>([]);
  const [reviewingConsentId, setReviewingConsentId] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  async function handleCopyInviteCode() {
    const code = currentTrip?.invite_code;
    if (!code) return;
    await Clipboard.setStringAsync(code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }

  async function handleShareInviteCode() {
    const code = currentTrip?.invite_code;
    if (!code) return;
    const tripName = currentTrip?.name ?? 'our trip';
    const link = buildTripInviteLink(code);
    try {
      await Share.share({
        message: `Join "${tripName}" on Travel Crew! Tap to request access: ${link}\n\nOr enter invite code ${code} in the app.`,
      });
    } catch {
      // User dismissed the share sheet — nothing to do.
    }
  }

  async function loadJoinRequests() {
    const { data, error } = await tripService.getPendingJoinRequests(tripId);
    if (error) {
      Alert.alert('Join requests error', error);
      return;
    }
    setJoinRequests(data ?? []);
  }

  useFocusEffect(useCallback(() => {
    if (isDemoMode) return;
    const contextCanSeeRequests = canManageTrip || isGlobalAdmin;
    setCanSeeRequests(contextCanSeeRequests);
    if (contextCanSeeRequests) {
      loadJoinRequests();
    }
    // Load trip if not already in context (e.g. deep-linked from a notification)
    if (!currentTrip) {
      tripService.getTripById(tripId).then(({ data }) => {
        if (data) setCurrentTrip(data);
      });
    }
    tripService.getTripMembers(tripId).then(({ data: freshMembers }) => {
      if (!freshMembers) return;
      setMembers(freshMembers);
      const isOrganizer = freshMembers.some(
        (m) => m.user_id === user?.id && m.role === 'trip_organizer'
      );
      const isManager = isGlobalAdmin || freshMembers.some(
        (m) => m.user_id === user?.id &&
               (m.role === 'trip_organizer' || m.role === 'trip_admin')
      );
      setCanSeeRequests(isManager);
      if (isManager) {
        loadJoinRequests();
      } else {
        setJoinRequests([]);
      }
      if (isOrganizer) {
        Promise.all([
          adminAccessService.getPendingForTrip(tripId),
          adminAccessService.getActiveForTrip(tripId),
        ]).then(([pendingResult, activeResult]) => {
          setAdminRequests(pendingResult.data ?? []);
          setActiveAdminAccess(activeResult.data ?? []);
        });
      }
    });
  }, [tripId, isDemoMode, user?.id, isGlobalAdmin, canManageTrip, currentTrip]));

  async function handleSave() {
    if (isDemoMode) { Alert.alert('Demo Mode', 'Editing trip settings is disabled in demo.'); return; }
    setSaving(true);
    const { data, error } = await tripService.updateTrip(tripId, { name, destination, cover_emoji: coverEmoji });
    setSaving(false);
    if (error) {
      Alert.alert('Error', error);
    } else if (data) {
      setCurrentTrip(data);
      Alert.alert('Saved', 'Trip settings updated.');
    }
  }

  async function handleLeave() {
    if (!user) return;

    if (isTripOrganizer) {
      const admins = members.filter(
        (m) => m.role === 'trip_admin' && m.user_id !== user.id
      );

      if (admins.length === 0) {
        // No admins — block leaving
        Alert.alert(
          'Cannot Leave Yet',
          'You are the only organizer. Promote at least one member to admin first, then transfer organizer role before leaving.',
          [{ text: 'OK' }]
        );
        return;
      }

      // Has admins — ask who should become organizer
      Alert.alert(
        'Transfer Organizer Role',
        'Before leaving, select a new organizer:',
        [
          ...admins.map((a) => ({
            text: a.profile?.full_name ?? a.user_id,
            onPress: async () => {
              await tripService.setMemberRole(tripId, a.user_id, 'trip_organizer');
              await tripService.setMemberRole(tripId, user.id, 'member');
              await tripService.removeMember(tripId, user.id);
              setCurrentTrip(null);
              navigation.navigate('Tabs');
            },
          })),
          { text: 'Cancel', style: 'cancel' },
        ]
      );
      return;
    }

    Alert.alert('Leave Trip', 'Are you sure you want to leave this trip?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          await tripService.removeMember(tripId, user.id);
          setCurrentTrip(null);
          navigation.navigate('Tabs');
        },
      },
    ]);
  }

  async function handleDelete() {
    Alert.alert(
      'Delete Trip',
      'This will permanently delete the trip and all its data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await tripService.deleteTrip(tripId);
            setCurrentTrip(null);
            navigation.navigate('Tabs');
          },
        },
      ]
    );
  }

  async function handleDeleteFamily(familyId: string, familyName: string) {
    Alert.alert('Delete Family', `Delete ${familyName}? Members will stay in the trip but become unassigned.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await familyService.deleteFamily(familyId);
          if (error) { Alert.alert('Error', error); return; }
          setFamilies(families.filter((family) => family.id !== familyId));
          setMembers(members.map((member) => (
            member.family_id === familyId
              ? { ...member, family_id: undefined, family: undefined }
              : member
          )));
        },
      },
    ]);
  }

  const refreshMembersAndRequests = useCallback(async () => {
    const [freshMembers, freshRequests] = await Promise.all([
      tripService.getTripMembers(tripId),
      canSeeRequests ? tripService.getPendingJoinRequests(tripId) : Promise.resolve({ data: [], error: null }),
    ]);
    if (freshMembers.data) setMembers(freshMembers.data);
    if (freshRequests.data) setJoinRequests(freshRequests.data);
  }, [tripId, canSeeRequests, setMembers]);

  useEffect(() => {
    if (isDemoMode) return undefined;

    const channelName = `trip-settings-refresh-${tripId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trip_join_requests',
          filter: `trip_id=eq.${tripId}`,
        },
        () => {
          refreshMembersAndRequests();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trip_members',
          filter: `trip_id=eq.${tripId}`,
        },
        () => {
          refreshMembersAndRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tripId, isDemoMode, refreshMembersAndRequests]);

  async function handleReviewJoinRequest(request: TripJoinRequest, status: 'approved' | 'rejected') {
    if (!user) return;
    setReviewingRequestId(request.id);
    const { error } = await tripService.reviewJoinRequest(request.id, user.id, status);
    if (error) {
      setReviewingRequestId(null);
      Alert.alert('Request review failed', error);
      return;
    }
    await refreshMembersAndRequests();
    setReviewingRequestId(null);
  }

  return (
    <FormKeyboardView contentContainerStyle={styles.content}>
      {/* Invite Code */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Invite Code</Text>
        <View style={styles.codeBox}>
          <Text style={styles.inviteCode}>{currentTrip?.invite_code}</Text>
          <Text style={styles.codeHint}>Share this code so people can request access</Text>
          <View style={styles.codeActions}>
            <TouchableOpacity style={styles.codeActionButton} onPress={handleCopyInviteCode} activeOpacity={0.8}>
              <Text style={styles.codeActionText}>{codeCopied ? '✓ Copied' : '📋 Copy Code'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.codeActionButton} onPress={handleShareInviteCode} activeOpacity={0.8}>
              <Text style={styles.codeActionText}>📤 Share via SMS / WhatsApp</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Edit Trip */}
      {canManageTrip && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trip Details</Text>
          <AppTextInput label="Trip Name" value={name} onChangeText={setName} />
          <AddressAutocomplete
            label="Destination / Address"
            value={destination}
            onChangeText={setDestination}
            placeholder="Hotel, venue, street address, or city"
          />
          <Text style={styles.themeLabel}>Trip Theme</Text>
          <View style={styles.themeGrid}>
            {TRIP_THEMES.map((t) => (
              <TouchableOpacity
                key={t.emoji}
                style={[styles.themeChip, coverEmoji === t.emoji && styles.themeChipActive]}
                onPress={() => setCoverEmoji(t.emoji)}
                accessibilityLabel={`Use ${t.label} theme`}
              >
                <Text style={styles.themeEmoji}>{t.emoji}</Text>
                <Text style={[styles.themeChipText, coverEmoji === t.emoji && styles.themeChipTextActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <AppButton title="Save Changes" onPress={handleSave} loading={saving} fullWidth />
        </View>
      )}

      {/* Admin Access Requests */}
      {isTripOrganizer && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Admin Access Requests</Text>
          {adminRequests.length === 0 && activeAdminAccess.length === 0 ? (
            <Text style={styles.emptyText}>No admin access requests.</Text>
          ) : null}
          {adminRequests.map((req) => (
            <View key={req.id} style={styles.memberRow}>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>
                  {req.admin?.full_name || req.admin?.email || 'Admin'}
                </Text>
                <Text style={styles.memberRole}>{req.reason}</Text>
                <Text style={styles.memberRole}>
                  Requested {new Date(req.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </Text>
              </View>
              <View style={styles.memberActions}>
                <TouchableOpacity
                  style={[styles.roleBtn, styles.approveBtn]}
                  disabled={reviewingConsentId === req.id}
                  onPress={async () => {
                    setReviewingConsentId(req.id);
                    const { error } = await adminAccessService.approveRequest(req.id, 24);
                    setReviewingConsentId(null);
                    if (error) { Alert.alert('Error', error); return; }
                    const [p, a] = await Promise.all([
                      adminAccessService.getPendingForTrip(tripId),
                      adminAccessService.getActiveForTrip(tripId),
                    ]);
                    setAdminRequests(p.data ?? []);
                    setActiveAdminAccess(a.data ?? []);
                  }}
                >
                  <Text style={[styles.roleBtnText, styles.approveBtnText]}>
                    {reviewingConsentId === req.id ? '...' : '24h'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.roleBtn, styles.approveBtn]}
                  disabled={reviewingConsentId === req.id}
                  onPress={async () => {
                    setReviewingConsentId(req.id);
                    const { error } = await adminAccessService.approveRequest(req.id, 48);
                    setReviewingConsentId(null);
                    if (error) { Alert.alert('Error', error); return; }
                    const [p, a] = await Promise.all([
                      adminAccessService.getPendingForTrip(tripId),
                      adminAccessService.getActiveForTrip(tripId),
                    ]);
                    setAdminRequests(p.data ?? []);
                    setActiveAdminAccess(a.data ?? []);
                  }}
                >
                  <Text style={[styles.roleBtnText, styles.approveBtnText]}>
                    {reviewingConsentId === req.id ? '...' : '48h'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.roleBtn, styles.approveBtn]}
                  disabled={reviewingConsentId === req.id}
                  onPress={async () => {
                    setReviewingConsentId(req.id);
                    const { error } = await adminAccessService.approveRequest(req.id, 168);
                    setReviewingConsentId(null);
                    if (error) { Alert.alert('Error', error); return; }
                    const [p, a] = await Promise.all([
                      adminAccessService.getPendingForTrip(tripId),
                      adminAccessService.getActiveForTrip(tripId),
                    ]);
                    setAdminRequests(p.data ?? []);
                    setActiveAdminAccess(a.data ?? []);
                  }}
                >
                  <Text style={[styles.roleBtnText, styles.approveBtnText]}>
                    {reviewingConsentId === req.id ? '...' : '7 days'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={reviewingConsentId === req.id}
                  onPress={async () => {
                    setReviewingConsentId(req.id);
                    const { error } = await adminAccessService.rejectRequest(req.id);
                    setReviewingConsentId(null);
                    if (error) { Alert.alert('Error', error); return; }
                    const { data } = await adminAccessService.getPendingForTrip(tripId);
                    setAdminRequests(data ?? []);
                  }}
                >
                  <Text style={styles.removeText}>Reject</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          {activeAdminAccess.map((req) => (
            <View key={req.id} style={styles.memberRow}>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>
                  {req.admin?.full_name || req.admin?.email || 'Admin'}
                </Text>
                <Text style={styles.memberRole}>
                  Expires {req.expires_at
                    ? new Date(req.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : 'never'}
                </Text>
              </View>
              <View style={styles.memberActions}>
                <TouchableOpacity
                  onPress={async () => {
                    const { error } = await adminAccessService.revokeAccess(req.id);
                    if (error) { Alert.alert('Error', error); return; }
                    const { data } = await adminAccessService.getActiveForTrip(tripId);
                    setActiveAdminAccess(data ?? []);
                  }}
                >
                  <Text style={styles.removeText}>Revoke</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Join Requests */}
      {canSeeRequests && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, styles.sectionTitleInHeader]}>
              Join Requests ({joinRequests.length})
            </Text>
            <TouchableOpacity
              onPress={loadJoinRequests}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
              <Text style={styles.refreshText}>↻ Refresh</Text>
            </TouchableOpacity>
          </View>
          {joinRequests.length === 0 ? (
            <Text style={styles.emptyText}>No pending access requests.</Text>
          ) : (
            joinRequests.map((request) => (
              <View key={request.id} style={styles.memberRow}>
                <FamilyAvatar name={request.profile?.full_name ?? request.profile?.email ?? '?'} size={36} />
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{request.profile?.full_name || request.profile?.email || 'New member'}</Text>
                  <Text style={styles.memberRole}>
                    Requested {new Date(request.requested_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </Text>
                </View>
                <View style={styles.memberActions}>
                  <TouchableOpacity
                    style={[styles.roleBtn, styles.approveBtn]}
                    disabled={reviewingRequestId === request.id}
                    onPress={() => handleReviewJoinRequest(request, 'approved')}
                  >
                    <Text style={[styles.roleBtnText, styles.approveBtnText]}>
                      {reviewingRequestId === request.id ? '...' : 'Approve'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={reviewingRequestId === request.id}
                    onPress={() => handleReviewJoinRequest(request, 'rejected')}
                  >
                    <Text style={styles.removeText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      )}

      {/* Families */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, styles.sectionTitleInHeader]}>Families ({families.length})</Text>
          {canManageTrip && (
            <TouchableOpacity onPress={() => navigation.navigate('AddEditFamily', { tripId })}>
              <Text style={styles.addFamilyText}>+ Add</Text>
            </TouchableOpacity>
          )}
        </View>
        {families.map((family) => (
          <View key={family.id} style={styles.memberRow}>
            <FamilyAvatar name={family.name} color={family.color} size={36} />
            <View style={styles.memberInfo}>
              <Text style={styles.memberName}>{family.name}</Text>
              <Text style={styles.memberRole}>
                {family.adults_count} adult{family.adults_count !== 1 ? 's' : ''}
                {family.children_count > 0
                  ? `, ${family.children_count} kid${family.children_count !== 1 ? 's' : ''}`
                  : ''}
              </Text>
            </View>
            {canManageTrip && (
              <View style={styles.familyActions}>
                <TouchableOpacity onPress={() => navigation.navigate('FamilyDetail', { tripId, familyId: family.id })}>
                  <Text style={styles.manageText}>Manage</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeleteFamily(family.id, family.name)}>
                  <Text style={styles.removeText}>Delete</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}
      </View>

      {/* Members */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, styles.sectionTitleInHeader]}>
            Trip Members ({members.length})
          </Text>
          <TouchableOpacity
            onPress={async () => {
              if (isDemoMode) return;
              const { data } = await tripService.getTripMembers(tripId);
              if (data) setMembers(data);
            }}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <Text style={styles.refreshText}>↻ Refresh</Text>
          </TouchableOpacity>
        </View>
        {/* Role colour legend */}
        <View style={styles.roleLegend}>
          <Text style={[styles.legendDot, { color: Colors.primary }]}>● Trip Organizer</Text>
          <Text style={[styles.legendDot, { color: Colors.success }]}>● Trip Admin</Text>
          <Text style={[styles.legendDot, { color: Colors.warning }]}>● Family Admin</Text>
          <Text style={[styles.legendDot, { color: Colors.textSecondary }]}>● Member</Text>
        </View>
        {members.map((m) => {
          const isMe = m.user_id === user?.id || m.profile?.email === user?.email;
          const name = tripMemberName(m, isMe ? profile?.full_name : undefined, isMe ? user?.email : undefined);
          const isTripAdmin = m.role === 'trip_admin';
          const canPromote = isTripOrganizer && m.user_id !== user?.id && m.role !== 'trip_organizer';
          const roleLabel = m.role === 'trip_organizer' ? 'Trip Organizer'
            : m.role === 'trip_admin' ? 'Trip Admin'
            : m.role === 'family_admin' ? 'Family Admin'
            : m.role === 'viewer' ? 'Viewer'
            : 'Member';
          const roleColor = m.role === 'trip_organizer' ? Colors.primary
            : m.role === 'trip_admin' ? Colors.success
            : m.role === 'family_admin' ? Colors.warning
            : Colors.textSecondary;
          return (
            <View key={m.id} style={styles.memberRow}>
              <FamilyAvatar name={name} size={36} />
              <View style={styles.memberInfo}>
                <View style={styles.nameRow}>
                  <Text style={[styles.memberName, isMe && styles.selfMemberName]}>
                    {displayName(name, m.family?.name)}
                  </Text>
                  {isMe && (
                    <View style={styles.youBadge}>
                      <Text style={styles.youBadgeText}>You</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.memberRole, { color: roleColor }]}>{roleLabel}</Text>
              </View>
              {canPromote && (
                <View style={styles.memberActions}>
                  <TouchableOpacity
                    style={[styles.roleBtn, isTripAdmin && styles.roleBtnActive]}
                    onPress={() => {
                      const newRole = isTripAdmin ? 'member' : 'trip_admin';
                      const label = isTripAdmin ? 'Remove Trip Admin' : 'Make Trip Admin';
                      const msg = isTripAdmin
                        ? `Remove Trip Admin privileges from ${m.profile?.full_name}? They will become a regular member.`
                        : `Promote ${m.profile?.full_name} to Trip Admin?\n\nTrip Admins can create expenses, polls, announcements and manage join requests.`;
                      Alert.alert(label, msg, [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: label,
                          onPress: async () => {
                            const { error } = await tripService.setMemberRole(tripId, m.user_id, newRole);
                            if (error) { Alert.alert('Error', error); return; }
                            const { data: fresh } = await tripService.getTripMembers(tripId);
                            if (fresh) setMembers(fresh);
                          },
                        },
                      ]);
                    }}
                  >
                    <Text style={[styles.roleBtnText, isTripAdmin && styles.roleBtnActiveText]}>
                      {isTripAdmin ? 'Trip Admin ✓' : 'Trip Admin'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() =>
                      Alert.alert('Remove Member', `Remove ${m.profile?.full_name}?`, [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Remove',
                          style: 'destructive',
                          onPress: () => tripService.removeMember(tripId, m.user_id),
                        },
                      ])
                    }
                  >
                    <Text style={styles.removeText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* Trip Lifecycle — organizer only */}
      {isTripOrganizer && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trip Status</Text>
          {currentTrip?.status === 'active' && (
            <AppButton
              title="🔒 Close Trip"
              onPress={async () => {
                const hasUnsettled = await tripService.hasUnsettledBalances(tripId);
                const doClose = async () => {
                  const { data, error } = await tripService.closeTrip(tripId);
                  if (error) Alert.alert('Error', error);
                  else if (data) { setCurrentTrip(data); Alert.alert('Trip closed', 'The trip is now read-only.'); }
                };
                if (hasUnsettled) {
                  Alert.alert(
                    'Unsettled balances',
                    'Some families still have outstanding balances. Close anyway?',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Close anyway', style: 'destructive', onPress: doClose },
                    ]
                  );
                } else {
                  Alert.alert('Close trip?', 'The trip will become read-only. You can reopen it later.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Close', onPress: doClose },
                  ]);
                }
              }}
              variant="outline"
              fullWidth
            />
          )}
          {currentTrip?.status === 'closed' && (
            <>
              <AppButton
                title="📦 Archive Trip"
                onPress={() =>
                  Alert.alert('Archive trip?', 'The trip will be hidden from your active list but all data is preserved.', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Archive',
                      onPress: async () => {
                        const { data, error } = await tripService.archiveTrip(tripId);
                        if (error) Alert.alert('Error', error);
                        else if (data) { setCurrentTrip(data); navigation.navigate('Tabs'); }
                      },
                    },
                  ])
                }
                variant="outline"
                fullWidth
                style={{ marginBottom: Spacing.sm }}
              />
              <AppButton
                title="🔓 Reopen Trip"
                onPress={() =>
                  Alert.alert('Reopen trip?', 'The trip will become active again.', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Reopen',
                      onPress: async () => {
                        const { data, error } = await tripService.reopenTrip(tripId);
                        if (error) Alert.alert('Error', error);
                        else if (data) setCurrentTrip(data);
                      },
                    },
                  ])
                }
                variant="outline"
                fullWidth
              />
            </>
          )}
          {currentTrip?.status === 'archived' && (
            <AppButton
              title="🔓 Reopen Trip"
              onPress={() =>
                Alert.alert('Reopen archived trip?', 'The trip will move back to your active list.', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Reopen',
                    onPress: async () => {
                      const { data, error } = await tripService.reopenTrip(tripId);
                      if (error) Alert.alert('Error', error);
                      else if (data) setCurrentTrip(data);
                    },
                  },
                ])
              }
              variant="outline"
              fullWidth
            />
          )}
        </View>
      )}

      {/* Danger Zone */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Danger Zone</Text>
        <AppButton title="Leave Trip" onPress={handleLeave} variant="outline" fullWidth />
        {canManageTrip && (
          <AppButton
            title="Delete Trip"
            onPress={handleDelete}
            variant="danger"
            fullWidth
            style={{ marginTop: Spacing.sm }}
          />
        )}
      </View>
    </FormKeyboardView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.md },
  section: { marginBottom: Spacing.lg },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semiBold,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  themeLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  themeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  themeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  themeChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  themeEmoji: { fontSize: FontSize.md },
  themeChipText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  themeChipTextActive: { color: Colors.primary },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  sectionTitleInHeader: { marginBottom: 0 },
  refreshText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.semiBold },
  roleLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.sm },
  legendDot: { fontSize: FontSize.xs, fontWeight: FontWeight.semiBold },
  addFamilyText: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold, color: Colors.primary },
  emptyText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  codeBox: {
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  inviteCode: {
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    letterSpacing: 8,
    marginBottom: Spacing.xs,
  },
  codeHint: { fontSize: FontSize.sm, color: Colors.textSecondary },
  codeActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    width: '100%',
  },
  codeActionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  codeActionText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
    color: Colors.primary,
    textAlign: 'center',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadow.sm,
  },
  memberInfo: { flex: 1, marginLeft: Spacing.md },
  memberName: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
    color: Colors.text,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, flexWrap: 'wrap' },
  selfMemberName: { color: Colors.primary, fontWeight: FontWeight.semiBold },
  youBadge: {
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  youBadgeText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.bold },
  memberRole: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textTransform: 'capitalize',
  },
  familyActions: { alignItems: 'flex-end', gap: Spacing.xs },
  manageText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.semiBold },
  removeText: { fontSize: FontSize.sm, color: Colors.danger },
  memberActions: { alignItems: 'flex-end', gap: Spacing.xs },
  roleBtn: {
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  roleBtnActive: { backgroundColor: Colors.primary },
  roleBtnText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semiBold },
  roleBtnActiveText: { color: Colors.surface },
  approveBtn: { backgroundColor: Colors.success, borderColor: Colors.success },
  approveBtnText: { color: Colors.surface },
});
