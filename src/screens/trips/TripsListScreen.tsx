import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MainStackParamList, Trip } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useTripContext } from '../../contexts/TripContext';
import { useNotifications } from '../../contexts/NotificationsContext';
import { tripService } from '../../services/tripService';
import { familyService } from '../../services/familyService';
import { demoTrip, demoFamilies } from '../../lib/mockData';
import { LoadingView } from '../../components/LoadingView';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { AppButton } from '../../components/AppButton';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../constants/theme';

type Nav = NativeStackNavigationProp<MainStackParamList>;

function TripCard({ trip, onPress }: { trip: Trip; onPress: () => void }) {
  const start = new Date(trip.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const end = new Date(trip.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const isUpcoming = new Date(trip.start_date) > new Date();
  const isActive = new Date(trip.start_date) <= new Date() && new Date(trip.end_date) >= new Date();

  return (
    <TouchableOpacity style={styles.tripCard} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.tripCardContent}>
        <View style={styles.tripIconBox}>
          <Text style={styles.tripIcon}>✈️</Text>
        </View>
        <View style={styles.tripInfo}>
          <Text style={styles.tripName} numberOfLines={1}>{trip.name}</Text>
          <Text style={styles.tripDest} numberOfLines={1}>📍 {trip.destination}</Text>
          <Text style={styles.tripDates}>{start} – {end}</Text>
          <Text style={styles.tripCounts}>
            {trip.family_count ?? 0} families · {trip.member_count ?? 0} members
          </Text>
        </View>
        <View style={styles.tripMeta}>
          {isActive && (
            <View style={styles.activePill}>
              <Text style={styles.activePillText}>Active</Text>
            </View>
          )}
          {isUpcoming && (
            <View style={styles.upcomingPill}>
              <Text style={styles.upcomingPillText}>Upcoming</Text>
            </View>
          )}
          <Text style={styles.chevron}>›</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export function TripsListScreen() {
  const navigation = useNavigation<Nav>();
  const { user, isDemoMode } = useAuth();
  const { unreadCount } = useNotifications();
  const { setCurrentTrip, setFamilies, setMembers } = useTripContext();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [showJoin, setShowJoin] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [joining, setJoining] = useState(false);

  const loadTrips = useCallback(async () => {
    if (!user) return;
    if (isDemoMode) {
      setTrips([demoTrip]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const { data, error: e } = await tripService.getMyTrips(user.id);
    if (e) setError(e);
    else setTrips(data ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [user, isDemoMode]);

  useFocusEffect(
    useCallback(() => {
      loadTrips();
    }, [loadTrips])
  );

  async function openTrip(trip: Trip) {
    setCurrentTrip(trip);
    if (isDemoMode) {
      setFamilies(demoFamilies);
      setMembers([]);
    } else {
      const [fam, mem] = await Promise.all([
        familyService.getFamilies(trip.id),
        tripService.getTripMembers(trip.id),
      ]);
      setFamilies(fam.data ?? []);
      setMembers(mem.data ?? []);
    }
    navigation.navigate('TripStack', { tripId: trip.id });
  }

  async function handleJoin() {
    if (!user || !inviteCode.trim()) return;
    setJoining(true);
    const { data, error: e } = await tripService.joinTrip(user.id, inviteCode.trim());
    setJoining(false);
    if (e) {
      Alert.alert('Error', e);
    } else if (data) {
      setShowJoin(false);
      setInviteCode('');
      await loadTrips();
      openTrip(data);
    }
  }

  if (loading) return <LoadingView message="Loading your trips..." />;
  if (error) return <ErrorState message={error} onRetry={loadTrips} />;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>My Trips</Text>
          <TouchableOpacity
            style={styles.notificationBtn}
            onPress={() => navigation.navigate('Notifications')}
            activeOpacity={0.8}
          >
            <Text style={styles.notificationIcon}>🔔</Text>
            {unreadCount > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.headerBtn, styles.joinBtn]}
            onPress={() => setShowJoin(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.headerBtnText}>Join</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerBtn, styles.headerBtnPrimary, styles.newTripBtn]}
            onPress={() => navigation.navigate('CreateTrip')}
            activeOpacity={0.8}
          >
            <Text style={[styles.headerBtnText, styles.headerBtnTextWhite]}>+ New Trip</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={trips}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TripCard trip={item} onPress={() => openTrip(item)} />
        )}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => {
            setRefreshing(true);
            loadTrips();
          }} tintColor={Colors.primary} />
        }
        ListEmptyComponent={
          <EmptyState
            icon="✈️"
            title="No trips yet"
            subtitle="Create your first trip or join one with an invite code."
            actionLabel="Create a Trip"
            onAction={() => navigation.navigate('CreateTrip')}
          />
        }
      />

      {/* Join Trip Modal */}
      <Modal visible={showJoin} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Join a Trip</Text>
            <Text style={styles.modalSubtitle}>Enter the 8-character invite code</Text>
            <TextInput
              style={styles.codeInput}
              value={inviteCode}
              onChangeText={(t) => setInviteCode(t.toUpperCase())}
              placeholder="e.g. ABC12345"
              maxLength={8}
              autoCapitalize="characters"
              placeholderTextColor={Colors.textSecondary}
            />
            <AppButton title="Join Trip" onPress={handleJoin} loading={joining} fullWidth />
            <AppButton
              title="Cancel"
              onPress={() => setShowJoin(false)}
              variant="outline"
              fullWidth
              style={{ marginTop: Spacing.sm }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    padding: Spacing.lg,
    paddingTop: Spacing.xl,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  headerTitle: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    flex: 1,
  },
  notificationBtn: {
    width: 56,
    height: 44,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationIcon: { fontSize: 20 },
  notificationBadge: {
    position: 'absolute',
    top: -7,
    right: -7,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  notificationBadgeText: {
    color: Colors.surface,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  headerActions: { flexDirection: 'row', gap: Spacing.sm },
  headerBtn: {
    minHeight: 44,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinBtn: { width: 104 },
  newTripBtn: { flex: 1 },
  headerBtnPrimary: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  headerBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
    color: Colors.primary,
  },
  headerBtnTextWhite: { color: Colors.surface },
  list: { padding: Spacing.md, flexGrow: 1 },
  tripCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    marginBottom: Spacing.md,
    ...Shadow.sm,
  },
  tripCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
  },
  tripIconBox: {
    width: 52,
    height: 52,
    borderRadius: Radius.md,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  tripIcon: { fontSize: 24 },
  tripInfo: { flex: 1 },
  tripName: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semiBold,
    color: Colors.text,
    marginBottom: 2,
  },
  tripDest: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: 2 },
  tripDates: { fontSize: FontSize.xs, color: Colors.textSecondary },
  tripCounts: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  tripMeta: { alignItems: 'flex-end', gap: Spacing.xs },
  activePill: {
    backgroundColor: Colors.success + '20',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  activePillText: { fontSize: FontSize.xs, color: Colors.success, fontWeight: FontWeight.semiBold },
  upcomingPill: {
    backgroundColor: Colors.primary + '20',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  upcomingPillText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semiBold },
  chevron: { fontSize: 20, color: Colors.textSecondary },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.xl,
  },
  modalTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  modalSubtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
  },
  codeInput: {
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: Radius.md,
    padding: Spacing.md,
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    textAlign: 'center',
    color: Colors.text,
    letterSpacing: 8,
    marginBottom: Spacing.lg,
  },
});
