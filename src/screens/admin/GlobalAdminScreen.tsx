import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, RefreshControl, TextInput, Modal, Platform, KeyboardAvoidingView,
  ScrollView, Switch,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AdminConsentRequest, MainStackParamList, Trip, TripMember, TripRole } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useTripContext } from '../../contexts/TripContext';
import { tripService } from '../../services/tripService';
import { familyService } from '../../services/familyService';
import { adminAccessService } from '../../services/adminAccessService';
import { featureFlagService } from '../../services/featureFlagService';
import { TRIP_FEATURES, TripFeatureKey } from '../../constants/features';
import { LoadingView } from '../../components/LoadingView';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../constants/theme';

type Nav = NativeStackNavigationProp<MainStackParamList>;

export function GlobalAdminScreen() {
  const navigation = useNavigation<Nav>();
  const { isGlobalAdmin } = useAuth();
  const { setCurrentTrip, setFamilies, setMembers, setFeatureFlags } = useTripContext();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [holdModalTrip, setHoldModalTrip] = useState<Trip | null>(null);
  const [holdReason, setHoldReason] = useState('');
  const [memberModalTrip, setMemberModalTrip] = useState<Trip | null>(null);
  const [memberModalMembers, setMemberModalMembers] = useState<TripMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [consentRequests, setConsentRequests] = useState<AdminConsentRequest[]>([]);
  const [consentModal, setConsentModal] = useState<Trip | null>(null);
  const [featureModalTrip, setFeatureModalTrip] = useState<Trip | null>(null);
  const [featureFlagsModal, setFeatureFlagsModal] = useState<Record<TripFeatureKey, boolean> | null>(null);
  const [featureLoading, setFeatureLoading] = useState(false);
  const [featureSaving, setFeatureSaving] = useState<TripFeatureKey | null>(null);
  const [consentReason, setConsentReason] = useState('');
  const [consentAgreed, setConsentAgreed] = useState(false);
  const [submittingConsent, setSubmittingConsent] = useState(false);

  const load = useCallback(async () => {
    const [tripsResult, consentResult] = await Promise.all([
      tripService.getAllTrips(),
      adminAccessService.getMyRequests(),
    ]);
    setTrips(tripsResult.data ?? []);
    setConsentRequests(consentResult.data ?? []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!isGlobalAdmin) return null;

  const filtered = trips.filter((t) =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.destination ?? '').toLowerCase().includes(search.toLowerCase())
  );

  async function openTrip(trip: Trip) {
    setCurrentTrip(trip);
    const [fam, mem, flags] = await Promise.all([
      familyService.getFamilies(trip.id),
      tripService.getTripMembers(trip.id),
      featureFlagService.getTripFlags(trip.id),
    ]);
    setFamilies(fam.data ?? []);
    setMembers(mem.data ?? []);
    if (flags.data) setFeatureFlags(flags.data);
    navigation.navigate('TripStack', { tripId: trip.id });
  }

  async function handleHoldConfirm() {
    if (!holdModalTrip || !holdReason.trim()) return;
    setActing(true);
    const { error } = await tripService.holdTrip(holdModalTrip.id, holdReason.trim());
    setActing(false);
    if (error) { Alert.alert('Error', error); return; }
    setTrips((prev) => prev.map((t) =>
      t.id === holdModalTrip.id ? { ...t, is_held: true, held_reason: holdReason.trim() } : t
    ));
    setHoldModalTrip(null);
    setHoldReason('');
  }

  async function handleUnhold(trip: Trip) {
    const { error } = await tripService.unholdTrip(trip.id);
    if (error) { Alert.alert('Error', error); return; }
    setTrips((prev) => prev.map((t) =>
      t.id === trip.id ? { ...t, is_held: false, held_reason: undefined } : t
    ));
  }

  async function loadMembersForTrip(trip: Trip) {
    setMembersLoading(true);
    const { data, error } = await tripService.getTripMembers(trip.id);
    setMembersLoading(false);
    if (error) {
      Alert.alert('Unable to load members', error);
      return;
    }
    setMemberModalMembers(data ?? []);
  }

  async function openMembers(trip: Trip) {
    setMemberModalTrip(trip);
    setMemberModalMembers([]);
    await loadMembersForTrip(trip);
  }

  async function openFeatureFlags(trip: Trip) {
    setFeatureModalTrip(trip);
    setFeatureFlagsModal(null);
    setFeatureLoading(true);
    const { data, error } = await featureFlagService.getTripFlags(trip.id);
    setFeatureLoading(false);
    if (error) {
      Alert.alert('Unable to load feature flags', error);
      setFeatureModalTrip(null);
      return;
    }
    setFeatureFlagsModal(data ?? null);
  }

  async function toggleFeature(featureKey: TripFeatureKey, enabled: boolean) {
    if (!featureModalTrip || !featureFlagsModal) return;
    const previous = featureFlagsModal[featureKey] !== false;
    setFeatureFlagsModal({ ...featureFlagsModal, [featureKey]: enabled });
    setFeatureSaving(featureKey);
    const { error } = await featureFlagService.setTripFlag(featureModalTrip.id, featureKey, enabled);
    setFeatureSaving(null);
    if (error) {
      Alert.alert('Feature update failed', error);
      setFeatureFlagsModal({ ...featureFlagsModal, [featureKey]: previous });
    }
  }

  async function refreshAdminTrips() {
    const { data } = await tripService.getAllTrips();
    if (data) setTrips(data);
  }

  function updateRole(member: TripMember, role: TripRole) {
    if (!memberModalTrip) return;
    const memberName = member.profile?.full_name || member.profile?.email || 'this member';
    Alert.alert(
      'Change Role',
      `Set ${memberName} to ${role.replace(/_/g, ' ')}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Change',
          onPress: async () => {
            setActing(true);
            const { error } = await tripService.setMemberRole(memberModalTrip.id, member.user_id, role);
            setActing(false);
            if (error) { Alert.alert('Role update failed', error); return; }
            await loadMembersForTrip(memberModalTrip);
          },
        },
      ]
    );
  }

  function showMemberActions(member: TripMember) {
    const name = member.profile?.full_name || member.profile?.email || 'Member';
    const roleOptions: TripRole[] = ['trip_organizer', 'trip_admin', 'family_admin', 'member', 'viewer'];
    Alert.alert(
      name,
      member.profile?.email ?? member.role.replace(/_/g, ' '),
      [
        ...roleOptions
          .filter((role) => role !== member.role)
          .map((role) => ({
            text: `Set ${role.replace(/_/g, ' ')}`,
            onPress: () => updateRole(member, role),
          })),
        { text: 'Remove from Trip', style: 'destructive', onPress: () => removeTripMember(member) },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }

  function removeTripMember(member: TripMember) {
    if (!memberModalTrip) return;
    const name = member.profile?.full_name || member.profile?.email || 'this member';
    Alert.alert(
      'Remove Member',
      `Remove ${name} from "${memberModalTrip.name}"? They will lose access to this trip.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            if (!memberModalTrip) return;
            setActing(true);
            const { error } = await tripService.removeMember(memberModalTrip.id, member.user_id);
            setActing(false);
            if (error) { Alert.alert('Remove failed', error); return; }
            await Promise.all([loadMembersForTrip(memberModalTrip), refreshAdminTrips()]);
          },
        },
      ]
    );
  }

  function consentForTrip(tripId: string): AdminConsentRequest | undefined {
    return consentRequests.find((r) => r.trip_id === tripId && (r.status === 'pending' || r.status === 'approved'));
  }

  async function handleConsentSubmit() {
    if (!consentModal || !consentReason.trim()) return;
    setSubmittingConsent(true);
    const { error } = await adminAccessService.requestAccess(consentModal.id, consentReason.trim());
    setSubmittingConsent(false);
    if (error) { Alert.alert('Error', error); return; }
    const { data } = await adminAccessService.getMyRequests();
    setConsentRequests(data ?? []);
    setConsentModal(null);
    setConsentReason('');
    setConsentAgreed(false);
  }

  async function handleDelete(trip: Trip) {
    Alert.alert(
      'Delete Trip',
      `Permanently delete "${trip.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await tripService.deleteTrip(trip.id);
            if (error) { Alert.alert('Error', error); return; }
            setTrips((prev) => prev.filter((t) => t.id !== trip.id));
          },
        },
      ]
    );
  }

  function showActions(trip: Trip) {
    Alert.alert(
      trip.name,
      trip.is_held ? `Held: ${trip.held_reason ?? '—'}` : 'Choose an action',
      [
        {
          text: trip.is_held ? 'Unhold Trip' : 'Hold Trip (violation)',
          onPress: () => {
            if (trip.is_held) {
              handleUnhold(trip);
            } else {
              setHoldModalTrip(trip);
              setHoldReason('');
            }
          },
        },
        { text: 'View Members', onPress: () => openMembers(trip) },
        { text: 'Feature Flags', onPress: () => openFeatureFlags(trip) },
        { text: 'Delete Trip', style: 'destructive', onPress: () => handleDelete(trip) },
        { text: 'Open Trip', onPress: () => openTrip(trip) },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }

  if (loading) return <LoadingView />;

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search trips..."
          placeholderTextColor={Colors.textSecondary}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />
        }
        ListHeaderComponent={
          <Text style={styles.count}>{filtered.length} trips</Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.card, item.is_held && styles.cardHeld]}
            onPress={() => openTrip(item)}
            onLongPress={() => showActions(item)}
            activeOpacity={0.8}
          >
            <View style={styles.cardMain}>
              <View style={styles.cardInfo}>
                <View style={styles.nameRow}>
                  <Text style={styles.tripName} numberOfLines={1}>{item.name}</Text>
                  {item.is_held && <View style={styles.heldBadge}><Text style={styles.heldBadgeText}>HELD</Text></View>}
                </View>
                <Text style={styles.tripDest} numberOfLines={1}>📍 {item.destination}</Text>
                <Text style={styles.tripMeta}>
                  {item.start_date} → {item.end_date} · {item.member_count ?? 0} members
                </Text>
                {item.is_held && item.held_reason ? (
                  <Text style={styles.heldReason}>Reason: {item.held_reason}</Text>
                ) : null}
              </View>
              <TouchableOpacity style={styles.actionBtn} onPress={() => showActions(item)}>
                <Text style={styles.actionBtnText}>⋯</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.cardActions}>
              <TouchableOpacity style={styles.inlineBtn} onPress={() => openMembers(item)}>
                <Text style={styles.inlineBtnText}>Members</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.inlineBtn} onPress={() => openFeatureFlags(item)}>
                <Text style={styles.inlineBtnText}>Features</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.inlineBtn, item.is_held ? styles.inlineBtnSuccess : styles.inlineBtnDanger]}
                onPress={() => {
                  if (item.is_held) {
                    handleUnhold(item);
                  } else {
                    setHoldModalTrip(item);
                    setHoldReason('');
                  }
                }}
              >
                <Text style={[
                  styles.inlineBtnText,
                  item.is_held ? styles.inlineBtnSuccessText : styles.inlineBtnDangerText,
                ]}>
                  {item.is_held ? 'Unhold' : 'Hold'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.inlineBtn, styles.inlineBtnDanger]} onPress={() => handleDelete(item)}>
                <Text style={[styles.inlineBtnText, styles.inlineBtnDangerText]}>Delete</Text>
              </TouchableOpacity>
            </View>
            {(() => {
              const consent = consentForTrip(item.id);
              if (!consent || consent.status === 'rejected' || consent.status === 'revoked') {
                return (
                  <View style={styles.consentRow}>
                    <TouchableOpacity
                      style={[styles.inlineBtn, styles.inlineBtnPrimary]}
                      onPress={() => { setConsentModal(item); setConsentReason(''); setConsentAgreed(false); }}
                    >
                      <Text style={[styles.inlineBtnText, styles.inlineBtnPrimaryText]}>Request Access</Text>
                    </TouchableOpacity>
                  </View>
                );
              }
              if (consent.status === 'pending') {
                return (
                  <View style={styles.consentRow}>
                    <View style={[styles.inlineBtn, styles.inlineBtnDisabled]}>
                      <Text style={[styles.inlineBtnText, styles.inlineBtnDisabledText]}>Pending Approval</Text>
                    </View>
                  </View>
                );
              }
              const isExpired = consent.expires_at ? new Date(consent.expires_at) <= new Date() : false;
              if (isExpired) {
                return (
                  <View style={styles.consentRow}>
                    <View style={[styles.inlineBtn, styles.inlineBtnDisabled]}>
                      <Text style={[styles.inlineBtnText, styles.inlineBtnDisabledText]}>Access Expired</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.inlineBtn, styles.inlineBtnPrimary]}
                      onPress={() => { setConsentModal(item); setConsentReason(''); setConsentAgreed(false); }}
                    >
                      <Text style={[styles.inlineBtnText, styles.inlineBtnPrimaryText]}>Request Access</Text>
                    </TouchableOpacity>
                  </View>
                );
              }
              const expiryStr = consent.expires_at
                ? new Date(consent.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                : 'no expiry';
              return (
                <View style={styles.consentRow}>
                  <TouchableOpacity
                    style={[styles.inlineBtn, styles.inlineBtnSuccess]}
                    onPress={() => openTrip(item)}
                  >
                    <Text style={[styles.inlineBtnText, styles.inlineBtnSuccessText]}>
                      Access Active · expires {expiryStr}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })()}
          </TouchableOpacity>
        )}
      />

      <Modal visible={!!memberModalTrip} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, styles.membersModalBox]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderText}>
                <Text style={styles.modalTitle}>{memberModalTrip?.name}</Text>
                <Text style={styles.modalSubtitle}>
                  {membersLoading ? 'Loading members...' : `${memberModalMembers.length} trip members`}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setMemberModalTrip(null)}
                accessibilityRole="button"
                accessibilityLabel="Close members"
              >
                <Text style={styles.closeBtnText}>×</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.membersList}>
              {memberModalMembers.map((member) => (
                <View key={member.id} style={styles.memberRow}>
                  <View style={styles.memberAvatar}>
                    <Text style={styles.memberAvatarText}>
                      {(member.profile?.full_name || member.profile?.email || '?').slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {member.profile?.full_name || member.profile?.email || 'Unknown member'}
                    </Text>
                    <Text style={styles.memberMeta} numberOfLines={1}>
                      {member.profile?.email ?? 'No email'} · {member.family?.name ?? 'No family'}
                    </Text>
                    <Text style={styles.memberRole}>{member.role.replace(/_/g, ' ')}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.memberActionBtn}
                    onPress={() => showMemberActions(member)}
                    disabled={acting}
                  >
                    <Text style={styles.memberActionText}>Manage</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {!membersLoading && memberModalMembers.length === 0 ? (
                <Text style={styles.emptyMembers}>No members found for this trip.</Text>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={!!featureModalTrip} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, styles.membersModalBox]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderText}>
                <Text style={styles.modalTitle}>{featureModalTrip?.name} Features</Text>
                <Text style={styles.modalSubtitle}>
                  Disabled features are hidden for that trip. Existing data stays saved.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => {
                  setFeatureModalTrip(null);
                  setFeatureFlagsModal(null);
                }}
                accessibilityRole="button"
                accessibilityLabel="Close feature flags"
              >
                <Text style={styles.closeBtnText}>×</Text>
              </TouchableOpacity>
            </View>
            {featureLoading || !featureFlagsModal ? (
              <Text style={styles.emptyMembers}>Loading feature flags...</Text>
            ) : (
              <ScrollView contentContainerStyle={styles.featureList}>
                {TRIP_FEATURES.map((feature) => {
                  const enabled = featureFlagsModal[feature.key] !== false;
                  const isSaving = featureSaving === feature.key;
                  return (
                    <View key={feature.key} style={[styles.featureRow, !enabled && styles.featureRowOff]}>
                      <View style={styles.featureInfo}>
                        <View style={styles.featureHeaderRow}>
                          <Text style={styles.featureName}>{feature.label}</Text>
                          <View style={[styles.featureStatusBadge, enabled ? styles.featureStatusEnabled : styles.featureStatusDisabled]}>
                            <Text style={[styles.featureStatusText, enabled ? styles.featureStatusTextEnabled : styles.featureStatusTextDisabled]}>
                              {enabled ? 'Enabled' : 'Disabled'}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.featureDescription}>{feature.description}</Text>
                      </View>
                      <View style={styles.featureSwitchGroup}>
                        <Text style={[styles.featureSwitchLabel, enabled ? styles.featureSwitchLabelEnabled : styles.featureSwitchLabelDisabled]}>
                          {enabled ? 'Disable' : 'Enable'}
                        </Text>
                        <Switch
                          value={enabled}
                          disabled={!!featureSaving}
                          onValueChange={(next) => toggleFeature(feature.key, next)}
                          trackColor={{ false: Colors.border, true: Colors.primaryLight }}
                          thumbColor={enabled ? Colors.primary : Colors.textSecondary}
                          accessibilityLabel={`${feature.label} is ${enabled ? 'enabled' : 'disabled'}. ${enabled ? 'Disable' : 'Enable'} feature.`}
                        />
                      </View>
                      {isSaving ? <Text style={styles.featureSaving}>Saving</Text> : null}
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Consent request modal */}
      <Modal visible={!!consentModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.modalBox} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>Request Access to "{consentModal?.name}"</Text>

            <View style={styles.agreementBox}>
              <Text style={styles.agreementTitle}>Data Access Agreement</Text>
              <Text style={styles.agreementText}>
                By requesting access to this trip's private data, I confirm that:{'\n\n'}
                {'• '}This access is for a legitimate audit, safety investigation, or platform integrity purpose only.{'\n\n'}
                {'• '}I will not use, share, or disclose any personal data, messages, photos, or financial information to any third party.{'\n\n'}
                {'• '}Access is temporary and limited to the duration approved by the trip organizer.{'\n\n'}
                {'• '}All access is logged and may be reviewed for compliance.{'\n\n'}
                {'• '}Misuse of this access may result in removal of global admin privileges.
              </Text>
            </View>

            <TouchableOpacity
              style={styles.agreementCheckRow}
              onPress={() => setConsentAgreed((v) => !v)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, consentAgreed && styles.checkboxChecked]}>
                {consentAgreed && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.agreementCheckLabel}>I have read and agree to the terms above</Text>
            </TouchableOpacity>

            <Text style={styles.modalSubtitle}>Reason for access request</Text>
            <TextInput
              style={styles.modalInput}
              value={consentReason}
              onChangeText={setConsentReason}
              placeholder="e.g. Investigating a reported content issue..."
              placeholderTextColor={Colors.textSecondary}
              multiline
            />
            <TouchableOpacity
              style={[styles.modalConfirm, styles.modalConfirmPrimary, (!consentReason.trim() || !consentAgreed || submittingConsent) && styles.modalConfirmDisabled]}
              onPress={handleConsentSubmit}
              disabled={!consentReason.trim() || !consentAgreed || submittingConsent}
            >
              <Text style={styles.modalConfirmText}>{submittingConsent ? 'Submitting...' : 'Submit Request'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancel} onPress={() => { setConsentModal(null); setConsentAgreed(false); setConsentReason(''); }}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Hold reason modal */}
      <Modal visible={!!holdModalTrip} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Hold "{holdModalTrip?.name}"</Text>
            <Text style={styles.modalSubtitle}>Reason (shown to no one, internal only)</Text>
            <TextInput
              style={styles.modalInput}
              value={holdReason}
              onChangeText={setHoldReason}
              placeholder="e.g. Terms violation, spam content..."
              placeholderTextColor={Colors.textSecondary}
              multiline
              autoFocus
            />
            <TouchableOpacity
              style={[styles.modalConfirm, (!holdReason.trim() || acting) && styles.modalConfirmDisabled]}
              onPress={handleHoldConfirm}
              disabled={!holdReason.trim() || acting}
            >
              <Text style={styles.modalConfirmText}>{acting ? 'Holding...' : 'Hold Trip'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setHoldModalTrip(null)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  searchBar: {
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  searchInput: {
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSize.md,
    color: Colors.text,
  },
  list: { padding: Spacing.md },
  count: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.sm },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    marginBottom: Spacing.sm,
    ...Shadow.sm,
    overflow: 'hidden',
  },
  cardHeld: { borderLeftWidth: 4, borderLeftColor: Colors.danger },
  cardMain: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md },
  cardInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 2 },
  tripName: { fontSize: FontSize.md, fontWeight: FontWeight.semiBold, color: Colors.text, flex: 1 },
  heldBadge: {
    backgroundColor: Colors.danger,
    borderRadius: Radius.sm,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  heldBadgeText: { color: '#fff', fontSize: 10, fontWeight: FontWeight.bold },
  tripDest: { fontSize: FontSize.sm, color: Colors.textSecondary },
  tripMeta: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  heldReason: { fontSize: FontSize.xs, color: Colors.danger, marginTop: 4, fontStyle: 'italic' },
  actionBtn: { padding: Spacing.sm },
  actionBtnText: { fontSize: 22, color: Colors.textSecondary },
  cardActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  inlineBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    backgroundColor: Colors.surface,
  },
  inlineBtnText: { color: Colors.primary, fontWeight: FontWeight.semiBold, fontSize: FontSize.sm },
  inlineBtnDanger: { borderColor: Colors.danger },
  inlineBtnDangerText: { color: Colors.danger },
  inlineBtnSuccess: { borderColor: Colors.success },
  inlineBtnSuccessText: { color: Colors.success },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    padding: Spacing.xl,
  },
  membersModalBox: { maxHeight: '82%' },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.sm },
  modalHeaderText: { flex: 1 },
  modalTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text, marginBottom: 4 },
  modalSubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.md },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  closeBtnText: { fontSize: 26, lineHeight: 30, color: Colors.textSecondary },
  membersList: { paddingBottom: Spacing.md },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    marginRight: Spacing.sm,
  },
  memberAvatarText: { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.bold },
  memberInfo: { flex: 1 },
  memberName: { fontSize: FontSize.md, color: Colors.text, fontWeight: FontWeight.semiBold },
  memberMeta: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  memberRole: {
    alignSelf: 'flex-start',
    fontSize: FontSize.xs,
    color: Colors.primary,
    marginTop: 4,
    textTransform: 'capitalize',
    fontWeight: FontWeight.semiBold,
  },
  memberActionBtn: {
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    marginLeft: Spacing.sm,
  },
  memberActionText: { color: Colors.primary, fontSize: FontSize.xs, fontWeight: FontWeight.semiBold },
  emptyMembers: { color: Colors.textSecondary, textAlign: 'center', paddingVertical: Spacing.lg },
  featureList: { paddingBottom: Spacing.md },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  featureRowOff: { opacity: 0.72 },
  featureInfo: { flex: 1 },
  featureHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, flexWrap: 'wrap' },
  featureName: { fontSize: FontSize.md, color: Colors.text, fontWeight: FontWeight.semiBold },
  featureStatusBadge: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  featureStatusEnabled: { backgroundColor: Colors.success + '20' },
  featureStatusDisabled: { backgroundColor: Colors.textSecondary + '20' },
  featureStatusText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  featureStatusTextEnabled: { color: Colors.success },
  featureStatusTextDisabled: { color: Colors.textSecondary },
  featureDescription: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 3, lineHeight: 17 },
  featureSwitchGroup: { alignItems: 'center', minWidth: 76 },
  featureSwitchLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, marginBottom: 2 },
  featureSwitchLabelEnabled: { color: Colors.danger },
  featureSwitchLabelDisabled: { color: Colors.primary },
  featureSaving: {
    position: 'absolute',
    right: 0,
    bottom: 4,
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  modalInput: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    padding: Spacing.md, fontSize: FontSize.md, color: Colors.text,
    minHeight: 80, textAlignVertical: 'top', marginBottom: Spacing.md,
  },
  modalConfirm: {
    backgroundColor: Colors.danger, borderRadius: Radius.md,
    padding: Spacing.md, alignItems: 'center', marginBottom: Spacing.sm,
  },
  modalConfirmDisabled: { opacity: 0.5 },
  modalConfirmText: { color: '#fff', fontWeight: FontWeight.bold, fontSize: FontSize.md },
  modalCancel: { alignItems: 'center', padding: Spacing.sm },
  modalCancelText: { color: Colors.textSecondary, fontSize: FontSize.md },
  consentRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  inlineBtnPrimary: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  inlineBtnPrimaryText: { color: '#fff' },
  inlineBtnDisabled: { borderColor: Colors.border, backgroundColor: Colors.background },
  inlineBtnDisabledText: { color: Colors.textSecondary },
  modalConfirmPrimary: { backgroundColor: Colors.primary },
  agreementBox: {
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  agreementTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  agreementText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  agreementCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  checkboxChecked: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: FontWeight.bold,
  },
  agreementCheckLabel: {
    fontSize: FontSize.sm,
    color: Colors.text,
    flex: 1,
  },
});
