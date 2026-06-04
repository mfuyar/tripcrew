import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, Linking, Switch, Platform,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
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

function openInGoogleMaps(lat: number, lng: number, label: string) {
  const encoded = encodeURIComponent(label);
  const appUrl = Platform.OS === 'ios'
    ? `comgooglemaps://?q=${lat},${lng}(${encoded})&center=${lat},${lng}`
    : `google.navigation:q=${lat},${lng}`;
  const webUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

  Linking.openURL(appUrl).catch(() => Linking.openURL(webUrl));
}

function getMapRegion(locations: LiveLocation[]): Region {
  if (locations.length === 0) {
    return {
      latitude: 39.8283,
      longitude: -98.5795,
      latitudeDelta: 45,
      longitudeDelta: 45,
    };
  }

  const latitudes = locations.map((location) => location.latitude);
  const longitudes = locations.map((location) => location.longitude);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.8, 0.01),
    longitudeDelta: Math.max((maxLng - minLng) * 1.8, 0.01),
  };
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

  const handleMyLocationUpdate = useCallback((location: LiveLocation) => {
    setLocations((prev) => {
      const next = new Map(prev);
      next.set(location.userId, location);
      return next;
    });
  }, []);

  // Tick to refresh "X ago" timestamps
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15000);
    return () => clearInterval(id);
  }, []);

  // Subscribe to other members' locations
  useEffect(() => {
    if (isDemoMode) return;
    let removeSharingListener: (() => void) | undefined;
    locationService.getLiveLocations(tripId).then((initialLocations) => {
      setLocations(new Map(initialLocations.map((location) => [location.userId, location])));
    });
    if (user?.id && locationService.isSharing(tripId, user.id)) {
      setIsSharing(true);
      stopSharingRef.current = () => locationService.stopSharing(tripId, user.id);
      removeSharingListener = locationService.registerSharingListener(
        tripId,
        user.id,
        handleMyLocationUpdate
      );
    }
    unsubscribeRef.current = locationService.subscribeToLocations(
      tripId,
      (updated) => setLocations((prev) => {
        const next = new Map(prev);
        updated.forEach((location, userId) => next.set(userId, location));
        return next;
      })
    );
    return () => {
      unsubscribeRef.current?.();
      removeSharingListener?.();
      if (user?.id) {
        locationService.unregisterSharingListener(tripId, user.id, handleMyLocationUpdate);
      }
    };
  }, [tripId, isDemoMode, user?.id, handleMyLocationUpdate]);

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
          userFamily?.name,
          handleMyLocationUpdate
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
      if (user?.id) {
        setLocations((prev) => {
          const next = new Map(prev);
          next.delete(user.id);
          return next;
        });
      }
    }
  }

  const otherLocations = Array.from(locations.values()).filter(
    (l) => l.userId !== user?.id
  );
  const myLocation = user ? locations.get(user.id) : undefined;
  const isActivelySharing = isSharing;
  const sharedLocations = useMemo(() => Array.from(locations.values()), [locations]);
  const mapRegion = useMemo(() => getMapRegion(sharedLocations), [sharedLocations]);

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
            {isActivelySharing
              ? `${currentTrip?.name ?? 'Trip'} members can see where you are in real time.`
              : `Only ${currentTrip?.name ?? 'trip'} members can see your location.`}
          </Text>
        </View>
        <Switch
          value={isActivelySharing}
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

      <TripLocationMap locations={sharedLocations} region={mapRegion} userId={user?.id} />

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

function TripLocationMap({
  locations,
  region,
  userId,
}: {
  locations: LiveLocation[];
  region: Region;
  userId?: string;
}) {
  return (
    <View style={styles.mapSection}>
      <View style={styles.mapHeader}>
        <Text style={styles.sectionTitleNoMargin}>Trip map</Text>
        <Text style={styles.mapCount}>
          {locations.length === 0
            ? 'No live pins'
            : `${locations.length} live pin${locations.length !== 1 ? 's' : ''}`}
        </Text>
      </View>
      <View style={styles.mapFrame}>
        <MapView style={styles.map} region={region} showsUserLocation={false}>
          {locations.map((location) => {
            const isSelf = location.userId === userId;
            return (
              <Marker
                key={location.userId}
                coordinate={{ latitude: location.latitude, longitude: location.longitude }}
                title={isSelf ? 'You' : location.userName ?? 'Trip member'}
                description={location.familyName ?? undefined}
                pinColor={isSelf ? Colors.primary : Colors.secondary}
              />
            );
          })}
        </MapView>
        {locations.length === 0 ? (
          <View style={styles.mapEmptyOverlay}>
            <Text style={styles.mapEmptyTitle}>No one is sharing yet</Text>
            <Text style={styles.mapEmptyText}>Live pins will appear here as trip members turn sharing on.</Text>
          </View>
        ) : null}
      </View>
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
      <View style={styles.mapActions}>
        <TouchableOpacity
          style={styles.mapsBtn}
          onPress={() => openInMaps(location.latitude, location.longitude, name)}
          activeOpacity={0.7}
        >
          <Text style={styles.mapsBtnText}>Maps</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.mapsBtn, styles.googleMapsBtn]}
          onPress={() => openInGoogleMaps(location.latitude, location.longitude, name)}
          activeOpacity={0.7}
        >
          <Text style={[styles.mapsBtnText, styles.googleMapsBtnText]}>Google Maps</Text>
        </TouchableOpacity>
      </View>
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
  mapSection: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  mapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  sectionTitleNoMargin: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  mapCount: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  mapFrame: {
    height: 220,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.border,
    ...Shadow.sm,
  },
  map: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  mapEmptyOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
    backgroundColor: 'rgba(248,249,254,0.82)',
  },
  mapEmptyTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semiBold,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  mapEmptyText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
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
  mapActions: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  mapsBtn: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  mapsBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold, color: Colors.primary },
  googleMapsBtn: {
    backgroundColor: '#EAF7EF',
  },
  googleMapsBtnText: {
    color: '#188038',
  },
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
