import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Announcement, MainStackParamList } from '../../types';
import { useTripContext } from '../../contexts/TripContext';
import { useAuth } from '../../contexts/AuthContext';
import { expenseService } from '../../services/expenseService';
import { announcementService } from '../../services/announcementService';
import { tripService } from '../../services/tripService';
import { pollService } from '../../services/pollService';
import { Poll } from '../../types';
import { demoExpenses, demoAnnouncements } from '../../lib/mockData';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../constants/theme';
import { LoadingView } from '../../components/LoadingView';
import { TripClosedBanner } from '../../components/TripClosedBanner';
import { isMappableDestination, openAppleMapsDirections, openGoogleMapsDirections } from '../../utils/maps';
import { currencySymbol } from '../../utils/currency';
import { isSelfOnlyExpense } from '../../utils/expenseVisibility';
import { TripFeatureKey } from '../../constants/features';

type Nav = NativeStackNavigationProp<MainStackParamList>;

interface QuickLink {
  emoji: string;
  label: string;
  screen: keyof MainStackParamList;
  feature: TripFeatureKey;
}

const ALL_QUICK_LINKS: (QuickLink & { adminOnly?: boolean; expenseOnly?: boolean })[] = [
  { emoji: '🧭', label: 'Explore', screen: 'CommunitySpots', feature: 'community_spots' },
  { emoji: '👨‍👩‍👧‍👦', label: 'Families', screen: 'Families', feature: 'families' },
  { emoji: '⚖️', label: 'Balances', screen: 'Balances', feature: 'expenses', expenseOnly: true },
  { emoji: '💸', label: 'Settlements', screen: 'Settlements', feature: 'expenses', expenseOnly: true },
  { emoji: '📷', label: 'Receipt Scan', screen: 'ReceiptScanner', feature: 'receipt_scan', adminOnly: true, expenseOnly: true },
];

export function TripDashboardScreen({ route }: { route: { params: { tripId: string } } }) {
  const navigation = useNavigation<Nav>();
  const { tripId } = route.params;
  const { currentTrip, families, members, setMembers, userFamily, isTripOrganizer, canManageAnnouncements, canManageTrip, canViewExpenses, isFeatureEnabled, isTripClosed } = useTripContext();
  const { user, isDemoMode } = useAuth();
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [activePolls, setActivePolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    if (isDemoMode) {
      const familyExpenses = demoExpenses.filter((e) => e.paid_by_family_id && !isSelfOnlyExpense(e));
      setTotalExpenses(familyExpenses.reduce((s, e) => s + e.amount, 0));
      setAnnouncements(demoAnnouncements.slice(0, 3));
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const [expResult, annResult, pollResult] = await Promise.all([
      canViewExpenses ? expenseService.getExpenses(tripId) : Promise.resolve({ data: [], error: null }),
      isFeatureEnabled('announcements') ? announcementService.getLatest(tripId, 3) : Promise.resolve({ data: [], error: null }),
      isFeatureEnabled('polls') ? pollService.getActivePolls(tripId, 3) : Promise.resolve({ data: [], error: null }),
    ]);
    const familyExpenses = (expResult.data ?? []).filter((e) => e.paid_by_family_id && !isSelfOnlyExpense(e));
    setTotalExpenses(familyExpenses.reduce((s, e) => s + e.amount, 0));
    if (annResult.error) {
      Alert.alert('Unable to load announcements', annResult.error);
    }
    setAnnouncements(annResult.data ?? []);
    setActivePolls(pollResult.data ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [tripId, canViewExpenses, isFeatureEnabled]);

  useFocusEffect(
    useCallback(() => {
      loadData();
      // Re-fetch members so role changes (e.g. newly promoted admin) are
      // reflected in canManageTrip/isTripAdmin without requiring a full restart.
      if (!isDemoMode) {
        tripService.getTripMembers(tripId).then(({ data }) => {
          if (data) setMembers(data);
        });
      }
    }, [loadData, tripId, isDemoMode])
  );

  if (loading) return <LoadingView />;

  function timeLeft(deadline?: string): string | null {
    if (!deadline) return null;
    const ms = new Date(deadline).getTime() - Date.now();
    if (ms <= 0) return 'Ended';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (h >= 24) return `${Math.floor(h / 24)}d left`;
    if (h > 0) return `${h}h ${m}m left`;
    return `${m}m left`;
  }

  const trip = currentTrip;
  const canOpenDestinationMaps = isMappableDestination(trip?.destination);
  const daysLeft = trip
    ? Math.ceil(
        (new Date(trip.end_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      )
    : 0;

  return (
    <>
    {isTripClosed && currentTrip && (
      <TripClosedBanner status={currentTrip.status as 'closed' | 'archived'} closedAt={currentTrip.closed_at} />
    )}
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => {
          setRefreshing(true);
          loadData();
        }} tintColor={Colors.primary} />
      }
    >
      {/* Trip Header Card */}
      <View style={styles.heroCard}>
        <Text style={styles.heroEmoji}>🏖️</Text>
        <Text style={styles.heroTitle}>{trip?.name ?? 'Trip'}</Text>
        <View style={styles.heroDates}>
          <Text style={styles.heroDateText}>
            {trip?.start_date} → {trip?.end_date}
          </Text>
          {daysLeft > 0 && (
            <View style={styles.daysLeftPill}>
              <Text style={styles.daysLeftText}>{daysLeft} days left</Text>
            </View>
          )}
        </View>
        {trip?.invite_code && (
          <TouchableOpacity
            style={styles.inviteCodeRow}
            onPress={() => navigation.navigate('TripSettings', { tripId })}
          >
            <Text style={styles.inviteCodeLabel}>Invite code</Text>
            <Text style={styles.inviteCode}>{trip.invite_code}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.settingsBtn}
          onPress={() => navigation.navigate('TripSettings', { tripId })}
        >
          <Text style={styles.settingsBtnText}>⚙️ Settings</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.allTripsBtn}
          onPress={() => navigation.navigate('Tabs')}
          accessibilityRole="button"
          accessibilityLabel="Go to all trips"
          activeOpacity={0.85}
        >
          <Text style={styles.allTripsBtnText}>← All Trips</Text>
        </TouchableOpacity>
      </View>

      {trip?.destination ? (
        <View style={styles.destinationCard}>
          <View style={styles.destinationHeader}>
            <Text style={styles.destinationIcon}>📍</Text>
            <View style={styles.destinationCopy}>
              <Text style={styles.destinationLabel}>Destination / address</Text>
              <Text style={styles.destinationText}>{trip.destination}</Text>
            </View>
          </View>
          {!canOpenDestinationMaps ? (
            <View style={styles.destinationFixRow}>
              <Text style={styles.destinationWarning}>
                Add a proper address or place to enable maps.
              </Text>
              <TouchableOpacity
                style={styles.destinationEditBtn}
                onPress={() => navigation.navigate('TripSettings', { tripId })}
                activeOpacity={0.8}
              >
                <Text style={styles.destinationEditBtnText}>Edit address</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          <View style={styles.directionRow}>
            <TouchableOpacity
              style={[styles.directionBtn, !canOpenDestinationMaps && styles.directionBtnDisabled]}
              onPress={() => openAppleMapsDirections(trip.destination)}
              disabled={!canOpenDestinationMaps}
              activeOpacity={0.8}
            >
              <Text style={[styles.directionBtnText, !canOpenDestinationMaps && styles.directionBtnTextDisabled]}>Maps</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.directionBtn,
                styles.googleDirectionBtn,
                !canOpenDestinationMaps && styles.googleDirectionBtnDisabled,
              ]}
              onPress={() => openGoogleMapsDirections(trip.destination)}
              disabled={!canOpenDestinationMaps}
              activeOpacity={0.8}
            >
              <Text style={[
                styles.directionBtnText,
                styles.googleDirectionBtnText,
                !canOpenDestinationMaps && styles.directionBtnTextDisabled,
              ]}>Google Maps</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* Announcements — only shown when there are active announcements */}
      {isFeatureEnabled('announcements') && announcements.length > 0 && (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>📢 Announcements</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Announcements', { tripId })}>
            <Text style={styles.seeAll}>See all</Text>
          </TouchableOpacity>
        </View>
        {(
          announcements.map((ann) => (
            <View key={ann.id} style={styles.announcementRow}>
              <Text style={styles.annPriority}>
                {ann.priority === 'urgent' ? '🔴' : ann.priority === 'high' ? '🟠' : '🟢'}
              </Text>
              <Text style={styles.annTitle} numberOfLines={2}>{ann.title}</Text>
              {canManageAnnouncements && (
                <TouchableOpacity
                  hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                  onPress={() =>
                    Alert.alert(
                      ann.title,
                      'What would you like to do?',
                      [
                        {
                          text: 'Archive',
                          onPress: async () => {
                            const { error } = await announcementService.archive(ann.id);
                            if (error) {
                              Alert.alert('Archive failed', error);
                              return;
                            }
                            setAnnouncements((prev) => prev.filter((a) => a.id !== ann.id));
                          },
                        },
                        {
                          text: 'Delete',
                          style: 'destructive',
                          onPress: async () => {
                            const { error } = await announcementService.delete(ann.id);
                            if (error) {
                              Alert.alert('Delete failed', error);
                              return;
                            }
                            setAnnouncements((prev) => prev.filter((a) => a.id !== ann.id));
                          },
                        },
                        { text: 'Cancel', style: 'cancel' },
                      ]
                    )
                  }
                >
                  <Text style={styles.annAction}>⋯</Text>
                </TouchableOpacity>
              )}
            </View>
          ))
        )}
      </View>
      )}

      {/* Explore community spots — moved above stats for visibility */}
      {isFeatureEnabled('community_spots') && (
        <TouchableOpacity
          style={styles.exploreCard}
          onPress={() => (navigation as any).navigate('CommunitySpots', { tripId })}
          activeOpacity={0.85}
        >
          <Text style={styles.exploreEmoji}>🧭</Text>
          <View style={styles.exploreCopy}>
            <Text style={styles.exploreTitle}>Explore Community Spots</Text>
            <Text style={styles.exploreSubtitle}>Discover local gems near your destination</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      )}

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <TouchableOpacity
          style={styles.statCard}
          onPress={() => navigation.navigate('Families', { tripId })}
          accessibilityRole="button"
          accessibilityLabel="Open families"
          activeOpacity={0.8}
        >
          <Text style={styles.statValue}>{families.length}</Text>
          <Text style={styles.statLabel}>Families</Text>
          <Text style={styles.statAction}>View</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.statCard}
          onPress={() => navigation.navigate('TripSettings', { tripId })}
          accessibilityRole="button"
          accessibilityLabel="Open trip members"
          activeOpacity={0.8}
        >
          <Text style={styles.statValue}>{members.length}</Text>
          <Text style={styles.statLabel}>Members</Text>
          <Text style={styles.statAction}>Manage</Text>
        </TouchableOpacity>
        {canViewExpenses && isFeatureEnabled('expenses') && (
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{currencySymbol(trip?.currency)}{totalExpenses.toFixed(0)}</Text>
            <Text style={styles.statLabel}>Expenses</Text>
          </View>
        )}
      </View>

      {/* Active Polls */}
      {isFeatureEnabled('polls') && activePolls.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>🗳️ Active Polls</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Polls', { tripId })}>
              <Text style={styles.seeAll}>See all</Text>
            </TouchableOpacity>
          </View>
          {activePolls.map((poll) => {
            const total = poll.options?.reduce((s, o) => s + o.votes_count, 0) ?? 0;
            const remaining = timeLeft(poll.deadline);
            return (
              <TouchableOpacity
                key={poll.id}
                style={styles.pollCard}
                onPress={() => navigation.navigate('PollDetail', { tripId, pollId: poll.id })}
                activeOpacity={0.8}
              >
                <Text style={styles.pollQuestion} numberOfLines={2}>{poll.question}</Text>
                <View style={styles.pollMeta}>
                  <Text style={styles.pollVotes}>{total} vote{total !== 1 ? 's' : ''}</Text>
                  {remaining && (
                    <View style={[styles.timerPill, remaining === 'Ended' && styles.timerPillEnded]}>
                      <Text style={[styles.timerText, remaining === 'Ended' && styles.timerTextEnded]}>
                        ⏱ {remaining}
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Join-family prompt for users without a family */}
      {isFeatureEnabled('families') && families.length > 0 && !userFamily && !isTripOrganizer && (
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.setupBanner, { borderColor: Colors.warning, borderWidth: 1.5 }]}
            onPress={() => navigation.navigate('JoinFamily', { tripId })}
          >
            <Text style={styles.setupBannerEmoji}>👤</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.setupBannerTitle}>Join your family</Text>
              <Text style={styles.setupBannerSubtitle}>
                Select which family you belong to so messages and expenses are attributed correctly
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Quick Links Grid */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Access</Text>
        <View style={styles.linksGrid}>
          {ALL_QUICK_LINKS.filter((l) =>
            isFeatureEnabled(l.feature) &&
            (!l.adminOnly || canManageTrip) && (!l.expenseOnly || canViewExpenses)
          ).map((link) => (
            <TouchableOpacity
              key={link.label}
              style={styles.linkCard}
              onPress={() => (navigation as any).navigate(link.screen, { tripId })}
            >
              <Text style={styles.linkEmoji}>{link.emoji}</Text>
              <Text style={styles.linkLabel}>{link.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md },
  heroCard: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    alignItems: 'center',
  },
  heroEmoji: { fontSize: 36, marginBottom: Spacing.xs },
  heroTitle: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.surface,
    textAlign: 'center',
  },
  heroDates: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  heroDateText: { fontSize: FontSize.sm, color: Colors.surface + 'CC' },
  daysLeftPill: {
    backgroundColor: Colors.surface + '33',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  daysLeftText: { fontSize: FontSize.xs, color: Colors.surface, fontWeight: FontWeight.semiBold },
  settingsBtn: {
    marginTop: Spacing.md,
    backgroundColor: Colors.surface + '22',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  settingsBtnText: { color: Colors.surface, fontSize: FontSize.sm },
  allTripsBtn: {
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.surface + '88',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minWidth: 132,
    alignItems: 'center',
  },
  allTripsBtnText: {
    color: Colors.surface,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
  },
  destinationCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.sm,
  },
  destinationHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  destinationIcon: { fontSize: 24 },
  destinationCopy: { flex: 1 },
  destinationLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  destinationText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
    color: Colors.text,
    lineHeight: 22,
  },
  destinationFixRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexWrap: 'wrap',
    marginBottom: Spacing.sm,
  },
  destinationWarning: {
    flex: 1,
    minWidth: 190,
    fontSize: FontSize.xs,
    color: Colors.warning,
    lineHeight: 17,
  },
  destinationEditBtn: {
    borderWidth: 1,
    borderColor: Colors.warning,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
  },
  destinationEditBtnText: {
    fontSize: FontSize.xs,
    color: Colors.warning,
    fontWeight: FontWeight.semiBold,
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
  directionBtnDisabled: {
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    opacity: 0.65,
  },
  directionBtnText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
  },
  directionBtnTextDisabled: { color: Colors.textSecondary },
  googleDirectionBtn: { backgroundColor: Colors.primary },
  googleDirectionBtnDisabled: { backgroundColor: Colors.background },
  googleDirectionBtnText: { color: Colors.surface },
  inviteCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  inviteCodeLabel: { fontSize: FontSize.xs, color: Colors.surface + 'AA' },
  inviteCode: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.surface,
    letterSpacing: 4,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
    ...Shadow.sm,
  },
  statValue: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
  },
  statLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  statAction: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: FontWeight.semiBold,
    marginTop: Spacing.xs,
  },
  section: { marginBottom: Spacing.md },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semiBold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  seeAll: { fontSize: FontSize.sm, color: Colors.primary },
  announcementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
    ...Shadow.sm,
  },
  annPriority: { fontSize: 16 },
  annTitle: { flex: 1, fontSize: FontSize.sm, color: Colors.text },
  annAction: { fontSize: 20, color: Colors.textSecondary, paddingLeft: Spacing.sm },
  announcementEmpty: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  announcementEmptyTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semiBold,
    color: Colors.text,
    marginBottom: 2,
  },
  announcementEmptyText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  pollCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pollQuestion: { fontSize: FontSize.md, fontWeight: FontWeight.medium, color: Colors.text, marginBottom: Spacing.xs },
  pollMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pollVotes: { fontSize: FontSize.xs, color: Colors.textSecondary },
  timerPill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.warning + '20',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 2,
  },
  timerPillEnded: { backgroundColor: Colors.border },
  timerText: { fontSize: FontSize.xs, color: Colors.warning, fontWeight: FontWeight.semiBold },
  timerTextEnded: { color: Colors.textSecondary },
  setupBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
  },
  setupBannerEmoji: { fontSize: 28 },
  setupBannerTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semiBold,
    color: Colors.primary,
  },
  setupBannerSubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary },
  chevron: { fontSize: 20, color: Colors.primary, marginLeft: 'auto' },
  exploreCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.primary + '40',
    ...Shadow.sm,
  },
  exploreEmoji: { fontSize: 32, marginRight: Spacing.md },
  exploreCopy: { flex: 1 },
  exploreTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semiBold, color: Colors.text },
  exploreSubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  familiesRow: { flexDirection: 'row' },
  familyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginRight: Spacing.sm,
    gap: Spacing.xs,
    ...Shadow.sm,
  },
  familyDot: { width: 10, height: 10, borderRadius: 5 },
  familyChipName: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.text,
  },
  familyChipCount: { fontSize: FontSize.xs, color: Colors.textSecondary },
  familyChipAdd: {
    borderWidth: 1,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
  },
  familyChipAddText: { fontSize: FontSize.sm, color: Colors.primary },
  linksGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  linkCard: {
    width: '47%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    ...Shadow.sm,
  },
  linkEmoji: { fontSize: 28, marginBottom: Spacing.xs },
  linkLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.text,
    textAlign: 'center',
  },
});
