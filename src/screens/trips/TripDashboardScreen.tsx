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
import { MainStackParamList } from '../../types';
import { useTripContext } from '../../contexts/TripContext';
import { useAuth } from '../../contexts/AuthContext';
import { expenseService } from '../../services/expenseService';
import { announcementService } from '../../services/announcementService';
import { tripService } from '../../services/tripService';
import { demoExpenses, demoAnnouncements } from '../../lib/mockData';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../constants/theme';
import { LoadingView } from '../../components/LoadingView';
import { openAppleMapsDirections, openGoogleMapsDirections } from '../../utils/maps';

type Nav = NativeStackNavigationProp<MainStackParamList>;

interface QuickLink {
  emoji: string;
  label: string;
  screen: keyof MainStackParamList;
}

const ALL_QUICK_LINKS: (QuickLink & { adminOnly?: boolean })[] = [
  { emoji: '👨‍👩‍👧‍👦', label: 'Families', screen: 'Families' },
  { emoji: '⚖️', label: 'Balances', screen: 'Balances', adminOnly: true },
  { emoji: '💸', label: 'Settlements', screen: 'Settlements', adminOnly: true },
  { emoji: '📷', label: 'Receipt Scan', screen: 'ReceiptScanner', adminOnly: true },
];

export function TripDashboardScreen({ route }: { route: { params: { tripId: string } } }) {
  const navigation = useNavigation<Nav>();
  const { tripId } = route.params;
  const { currentTrip, families, members, setMembers, userFamily, isTripOrganizer, canManageAnnouncements, canManageTrip } = useTripContext();
  const { user, isDemoMode } = useAuth();
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [announcements, setAnnouncements] = useState<{ id: string; title: string; priority: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    if (isDemoMode) {
      setTotalExpenses(demoExpenses.reduce((s, e) => s + e.amount, 0));
      setAnnouncements(demoAnnouncements.slice(0, 3));
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const [expResult, annResult] = await Promise.all([
      expenseService.getExpenses(tripId),
      announcementService.getAll(tripId),
    ]);
    const total = (expResult.data ?? []).reduce((s, e) => s + e.amount, 0);
    setTotalExpenses(total);
    setAnnouncements(annResult.data?.slice(0, 3) ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [tripId]);

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

  const trip = currentTrip;
  const daysLeft = trip
    ? Math.ceil(
        (new Date(trip.end_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      )
    : 0;

  return (
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
        <Text style={styles.heroEmoji}>✈️</Text>
        <Text style={styles.heroTitle}>{trip?.name ?? 'Trip'}</Text>
        <Text style={styles.heroDestination}>📍 {trip?.destination}</Text>
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
          <View style={styles.directionRow}>
            <TouchableOpacity
              style={styles.directionBtn}
              onPress={() => openAppleMapsDirections(trip.destination)}
              activeOpacity={0.8}
            >
              <Text style={styles.directionBtnText}>Maps</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.directionBtn, styles.googleDirectionBtn]}
              onPress={() => openGoogleMapsDirections(trip.destination)}
              activeOpacity={0.8}
            >
              <Text style={[styles.directionBtnText, styles.googleDirectionBtnText]}>Google Maps</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{families.length}</Text>
          <Text style={styles.statLabel}>Families</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{members.length}</Text>
          <Text style={styles.statLabel}>Members</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{trip?.currency} {totalExpenses.toFixed(0)}</Text>
          <Text style={styles.statLabel}>Expenses</Text>
        </View>
      </View>

      {/* Announcements */}
      {announcements.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>📢 Announcements</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Announcements', { tripId })}>
              <Text style={styles.seeAll}>See all</Text>
            </TouchableOpacity>
          </View>
          {announcements.map((ann) => (
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
                            await announcementService.archive(ann.id);
                            setAnnouncements((prev) => prev.filter((a) => a.id !== ann.id));
                          },
                        },
                        {
                          text: 'Delete',
                          style: 'destructive',
                          onPress: async () => {
                            await announcementService.delete(ann.id);
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
          ))}
        </View>
      )}

      {/* Join-family prompt for users without a family */}
      {families.length > 0 && !userFamily && !isTripOrganizer && (
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

      {/* Families section */}
      {families.length === 0 ? (
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.setupBanner}
            onPress={() => navigation.navigate('AddEditFamily', { tripId })}
          >
            <Text style={styles.setupBannerEmoji}>👨‍👩‍👧‍👦</Text>
            <View>
              <Text style={styles.setupBannerTitle}>Add your family</Text>
              <Text style={styles.setupBannerSubtitle}>Set up families to track expenses fairly</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Families in this trip</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.familiesRow}>
            {families.map((f) => (
              <TouchableOpacity
                key={f.id}
                style={styles.familyChip}
                onPress={() => navigation.navigate('FamilyDetail', { tripId, familyId: f.id })}
              >
                <View style={[styles.familyDot, { backgroundColor: f.color ?? Colors.primary }]} />
                <Text style={styles.familyChipName}>{f.name}</Text>
                <Text style={styles.familyChipCount}>
                  {f.adults_count}A {f.children_count > 0 ? `+ ${f.children_count}K` : ''}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.familyChip, styles.familyChipAdd]}
              onPress={() => navigation.navigate('AddEditFamily', { tripId })}
            >
              <Text style={styles.familyChipAddText}>+ Add</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {/* Quick Links Grid */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Access</Text>
        <View style={styles.linksGrid}>
          {ALL_QUICK_LINKS.filter((l) => !l.adminOnly || canManageTrip).map((link) => (
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
  heroDestination: {
    fontSize: FontSize.md,
    color: Colors.surface + 'CC',
    marginTop: Spacing.xs,
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
