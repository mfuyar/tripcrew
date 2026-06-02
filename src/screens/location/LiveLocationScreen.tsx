import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, Linking, Switch, Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainStackParamList, LiveLocation } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useTripContext } from '../../contexts/TripContext';
import { locationService } from '../../services/locationService';
import { LoadingView } from '../../components/LoadingView';
import { FamilyAvatar } from '../../components/FamilyAvatar';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../constants/theme';

type Props = NativeStackScreenProps<MainStackParamList, 'LiveLocation'>;

function formatTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 10) return 'Just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function openInMaps(lat: number, lng: number, label: string) {
  const encoded = encodeURIComponent(label);
  const url = Platform.OS === 'ios'
    ? `maps://?q=${encoded}&ll=${lat},${lng}`
    : `geo:${lat},${lng}?q=${lat},${lng}(${encoded})`;
  Linking.openURL(url).catch(() =>
    Linking.openURL(`https://maps.google.com/?q=${lat},${lng}`)
  );
}

export function LiveLocationScreen({ route }: Props) {
  const { tripId } = route.params;
  const { user, profile, isDemoMode } = useAuth();
  const { userFamily, currentTrip } = useTripContext();

  const [locations, setLocations] = useState<Map<string, LiveLocation>>(new Map());
  const [isSharing, setIsSharing] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [starting, setStarting] = useState(false);
  const stopSharingRef = useRef<(() => void) | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Tick to refresh "X ago" timestamps
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15000);
    return () => clearInterval(id);
  }, []);

  // Subscribe to other members' locations
  useEffect(() => {
    if (isDemoMode) return;
    unsubscribeRef.current = locationService.subscribeToLocations(
      tripId,
      (updated) => setLocations(updated)
    );
    return () => {
      unsubscribeRef.current?.();
      stopSharingRef.current?.();
    };
  }, [tripId, isDemoMode]);

  async function handleToggleSharing(enabled: boolean) {
    if (isDemoMode) {
      Alert.alert('Demo Mode', 'Live location is disabled in demo.');
      return;
    }
    if (enabled) {
      setStarting(true);
      const status = await locationService.requestPermission();
      if (status !== 'granted') {
        setPermissionDenied(true);
        setStarting(false);
        Alert.alert(
          'Location Permission Required',
          'Please enable location access in Settings to share your position.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
        return;
      }
      try {
        const stop = await locationService.startSharing(
          tripId,
          user!.id,
          userFamily?.id,
          profile?.full_name ?? 'Unknown',
          userFamily?.name
        );
        stopSharingRef.current = stop;
        setIsSharing(true);
      } catch (e: any) {
        Alert.alert('Location error', e?.message ?? 'Could not start sharing.');
      } finally {
        setStarting(false);
      }
    } else {
      stopSharingRef.current?.();
      stopSharingRef.current = null;
      setIsSharing(false);
    }
  }

  const otherLocations = Array.from(locations.values()).filter(
    (l) => l.userId !== user?.id
  );
  const myLocation = user ? locations.get(user.id) : undefined;

  if (starting) return <LoadingView message="Getting your location…" />;

  return (
    <View style={styles.container}>
      {/* Sharing toggle card */}
      <View style={styles.sharingCard}>
        <View style={styles.sharingLeft}>
          <Text style={styles.sharingTitle}>
            {isSharing ? '📍 Sharing your location' : '📍 Share your location'}
          </Text>
          <Text style={styles.sharingSubtitle}>
            {isSharing
              ? 'Your family can see where you are in real time.'
              : `Only ${currentTrip?.name ?? 'trip'} members can see your location.`}
          </Text>
        </View>
        <Switch
          value={isSharing}
          onValueChange={handleToggleSharing}
          trackColor={{ false: Colors.border, true: Colors.primary }}
          thumbColor={Colors.surface}
        />
      </View>

      {permissionDenied && (
        <View style={styles.permissionBanner}>
          <Text style={styles.permissionText}>
            Location permission denied. Tap to open Settings.
          </Text>
          <TouchableOpacity onPress={() => Linking.openSettings()}>
            <Text style={styles.permissionLink}>Open Settings</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* My location (when sharing) */}
      {myLocation && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your position</Text>
          <LocationCard location={myLocation} isSelf />
        </View>
      )}

      {/* Other members */}
      <Text style={styles.sectionTitle} >
        {otherLocations.length === 0
          ? 'No one else is sharing yet'
          : `${otherLocations.length} member${otherLocations.length !== 1 ? 's' : ''} sharing`}
      </Text>

      <FlatList
        data={otherLocations}
        keyExtractor={(item) => item.userId}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <LocationCard location={item} isSelf={false} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🗺️</Text>
            <Text style={styles.emptyText}>
              When trip members enable sharing, their positions will appear here.
            </Text>
          </View>
        }
      />
    </View>
  );
}

function LocationCard({ location, isSelf }: { location: LiveLocation; isSelf: boolean }) {
  const name = location.userName ?? 'Unknown';
  const family = location.familyName ?? '';
  const coords = `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`;
  const accuracy = location.accuracy ? `±${Math.round(location.accuracy)}m` : '';

  return (
    <View style={styles.card}>
      <View style={styles.cardLeft}>
        <FamilyAvatar name={family || name} size={44} />
        <View style={styles.cardInfo}>
          <View style={styles.cardNameRow}>
            <Text style={styles.cardName}>{isSelf ? 'You' : name}</Text>
            {location.isLive ? (
              <View style={styles.livePill}>
                <Text style={styles.livePillText}>LIVE</Text>
              </View>
            ) : (
              <View style={styles.offlinePill}>
                <Text style={styles.offlinePillText}>Last seen</Text>
              </View>
            )}
          </View>
          {family ? <Text style={styles.cardFamily}>{family}</Text> : null}
          <Text style={styles.cardCoords}>{coords} {accuracy}</Text>
          <Text style={styles.cardTime}>{formatTime(location.timestamp)}</Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.mapsBtn}
        onPress={() => openInMaps(location.latitude, location.longitude, name)}
        activeOpacity={0.7}
      >
        <Text style={styles.mapsBtnText}>Open in Maps</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  sharingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    margin: Spacing.md,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    ...Shadow.sm,
  },
  sharingLeft: { flex: 1, marginRight: Spacing.md },
  sharingTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semiBold,
    color: Colors.text,
    marginBottom: 2,
  },
  sharingSubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary },
  permissionBanner: {
    backgroundColor: Colors.warning + '20',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: Radius.md,
  },
  permissionText: { fontSize: FontSize.sm, color: Colors.warning, flex: 1 },
  permissionLink: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
    color: Colors.warning,
    marginLeft: Spacing.sm,
  },
  section: { marginHorizontal: Spacing.md, marginBottom: Spacing.sm },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    marginTop: Spacing.xs,
  },
  list: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xl },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadow.sm,
  },
  cardLeft: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.sm },
  cardInfo: { flex: 1, marginLeft: Spacing.sm },
  cardNameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: 2 },
  cardName: { fontSize: FontSize.md, fontWeight: FontWeight.semiBold, color: Colors.text },
  livePill: {
    backgroundColor: Colors.success,
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  livePillText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.surface },
  offlinePill: {
    backgroundColor: Colors.border,
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  offlinePillText: { fontSize: 10, color: Colors.textSecondary },
  cardFamily: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: 2 },
  cardCoords: { fontSize: FontSize.xs, color: Colors.textSecondary, fontVariant: ['tabular-nums'] },
  cardTime: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  mapsBtn: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  mapsBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold, color: Colors.primary },
  emptyState: { alignItems: 'center', paddingVertical: Spacing.xl },
  emptyIcon: { fontSize: 48, marginBottom: Spacing.md },
  emptyText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: Spacing.lg,
  },
});
