import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainStackParamList, TripJoinRequest } from '../../types';
import { useTripContext } from '../../contexts/TripContext';
import { useAuth } from '../../contexts/AuthContext';
import { tripService } from '../../services/tripService';
import { familyService } from '../../services/familyService';
import { AppTextInput } from '../../components/AppTextInput';
import { AppButton } from '../../components/AppButton';
import { displayName } from '../../utils/displayName';
import { FamilyAvatar } from '../../components/FamilyAvatar';
import { FormKeyboardView } from '../../components/FormKeyboardView';
import { openAppleMapsDirections, openGoogleMapsDirections } from '../../utils/maps';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../constants/theme';

type Props = NativeStackScreenProps<MainStackParamList, 'TripSettings'>;

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
  const { user, isDemoMode } = useAuth();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(currentTrip?.name ?? '');
  const [destination, setDestination] = useState(currentTrip?.destination ?? '');
  const [joinRequests, setJoinRequests] = useState<TripJoinRequest[]>([]);
  const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(null);

  // Re-fetch members on focus so role changes from any device are reflected
  useFocusEffect(useCallback(() => {
    if (isDemoMode) return;
    tripService.getTripMembers(tripId).then(({ data }) => {
      if (data) setMembers(data);
    });
    if (canManageTrip) {
      tripService.getPendingJoinRequests(tripId).then(({ data }) => {
        if (data) setJoinRequests(data);
      });
    } else {
      setJoinRequests([]);
    }
  }, [tripId, isDemoMode, canManageTrip]));

  async function handleSave() {
    if (isDemoMode) { Alert.alert('Demo Mode', 'Editing trip settings is disabled in demo.'); return; }
    setSaving(true);
    const { data, error } = await tripService.updateTrip(tripId, { name, destination });
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

  async function refreshMembersAndRequests() {
    const [freshMembers, freshRequests] = await Promise.all([
      tripService.getTripMembers(tripId),
      canManageTrip ? tripService.getPendingJoinRequests(tripId) : Promise.resolve({ data: [], error: null }),
    ]);
    if (freshMembers.data) setMembers(freshMembers.data);
    if (freshRequests.data) setJoinRequests(freshRequests.data);
  }

  async function handleReviewJoinRequest(request: TripJoinRequest, status: 'approved' | 'rejected') {
    if (!user) return;
    setReviewingRequestId(request.id);
    const { error } = await tripService.reviewJoinRequest(request.id, user.id, status);
    setReviewingRequestId(null);
    if (error) {
      Alert.alert('Request review failed', error);
      return;
    }
    await refreshMembersAndRequests();
  }

  return (
    <FormKeyboardView contentContainerStyle={styles.content}>
      {/* Invite Code */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Invite Code</Text>
        <View style={styles.codeBox}>
          <Text style={styles.inviteCode}>{currentTrip?.invite_code}</Text>
          <Text style={styles.codeHint}>Share this code so people can request access</Text>
        </View>
      </View>

      {currentTrip?.destination ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Destination / Address</Text>
          <View style={styles.destinationBox}>
            <Text style={styles.destinationText}>{currentTrip.destination}</Text>
            <View style={styles.directionRow}>
              <TouchableOpacity
                style={styles.directionBtn}
                onPress={() => openAppleMapsDirections(currentTrip.destination)}
              >
                <Text style={styles.directionBtnText}>Maps</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.directionBtn, styles.googleDirectionBtn]}
                onPress={() => openGoogleMapsDirections(currentTrip.destination)}
              >
                <Text style={[styles.directionBtnText, styles.googleDirectionBtnText]}>Google Maps</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : null}

      {/* Edit Trip */}
      {isTripOrganizer && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trip Details</Text>
          <AppTextInput label="Trip Name" value={name} onChangeText={setName} />
          <AppTextInput
            label="Destination / Address"
            value={destination}
            onChangeText={setDestination}
            placeholder="Hotel, venue, street address, or city"
          />
          <AppButton title="Save Changes" onPress={handleSave} loading={saving} fullWidth />
        </View>
      )}

      {/* Join Requests */}
      {canManageTrip && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, styles.sectionTitleInHeader]}>
              Join Requests ({joinRequests.length})
            </Text>
            <TouchableOpacity
              onPress={async () => {
                const { data } = await tripService.getPendingJoinRequests(tripId);
                if (data) setJoinRequests(data);
              }}
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
          {isTripOrganizer && (
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
            {isTripOrganizer && (
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
        {members.map((m) => {
          const isAdmin = m.role === 'trip_admin';
          const canPromote = isTripOrganizer && m.user_id !== user?.id && m.role !== 'trip_organizer';
          return (
            <View key={m.id} style={styles.memberRow}>
              <FamilyAvatar name={m.profile?.full_name ?? '?'} size={36} />
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{displayName(m.profile?.full_name, m.family?.name)}</Text>
                <Text style={styles.memberRole}>{m.role.replace(/_/g, ' ')}</Text>
              </View>
              {canPromote && (
                <View style={styles.memberActions}>
                  <TouchableOpacity
                    style={[styles.roleBtn, isAdmin && styles.roleBtnActive]}
                    onPress={() => {
                      const newRole = isAdmin ? 'member' : 'trip_admin';
                      const label = isAdmin ? 'Remove Admin' : 'Make Admin';
                      const msg = isAdmin
                        ? `Remove admin privileges from ${m.profile?.full_name}?`
                        : `Give ${m.profile?.full_name} admin rights (can post/delete announcements)?`;
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
                    <Text style={[styles.roleBtnText, isAdmin && styles.roleBtnActiveText]}>
                      {isAdmin ? 'Admin ✓' : 'Make Admin'}
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

      {/* Danger Zone */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Danger Zone</Text>
        <AppButton title="Leave Trip" onPress={handleLeave} variant="outline" fullWidth />
        {isTripOrganizer && (
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  sectionTitleInHeader: { marginBottom: 0 },
  refreshText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.semiBold },
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
  destinationBox: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    ...Shadow.sm,
  },
  destinationText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
    color: Colors.text,
    lineHeight: 22,
    marginBottom: Spacing.md,
  },
  directionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  directionBtn: {
    flex: 1,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  directionBtnText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
  },
  googleDirectionBtn: { backgroundColor: Colors.primary },
  googleDirectionBtnText: { color: Colors.surface },
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
