import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, Linking, Switch, Platform,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

export function LiveLocationScreen({ route, navigation }: Props) {
  const { tripId } = route.params;
  const { user, profile, isDemoMode } = useAuth();
  const { userFamily, currentTrip } = useTripContext();
  const insets = useSafeAreaInsets();

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
    if (user?.id) {
      locationService.isSharingPersisted(tripId, user.id).then((sharing) => {
        if (sharing) {
          setIsSharing(true);
          stopSharingRef.current = () => locationService.stopSharing(tripId, user.id);
        }
      });
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
      if (currentTrip?.status === 'closed' || currentTrip?.status === 'archived' || currentTrip?.is_active === false) {
        Alert.alert('Trip closed', 'Live location sharing is only available while this trip is active.');
        return;
      }
      setStarting(true);
      const canUseBackgroundSharing = await locationService.canUseBackgroundSharing();
      if (!canUseBackgroundSharing) {
        setStarting(false);
        Alert.alert(
          'New build required',
          'Background live location needs a development build that includes Expo TaskManager. Rebuild the app, then try again.'
        );
        return;
      }
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
      const backgroundStatus = await locationService.requestBackgroundPermission();
      if (backgroundStatus !== 'granted') {
        setStarting(false);
        Alert.alert(
          'Always Location Required',
          'To keep sharing until the trip ends, enable Always location access for TripCrew.',
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

  useEffect(() => {
    if (!user?.id || !isSharing) return;
    const tripOff = currentTrip?.status === 'closed'
      || currentTrip?.status === 'archived'
      || currentTrip?.is_active === false;
    if (tripOff) {
      locationService.stopSharing(tripId, user.id);
      stopSharingRef.current = null;
      setIsSharing(false);
    }
  }, [currentTrip?.status, currentTrip?.is_active, isSharing, tripId, user?.id]);

  const otherLocations = Array.from(locations.values()).filter(
    (l) => l.userId !== user?.id
  );
  const myLocation = user ? locations.get(user.id) : undefined;
  const isActivelySharing = isSharing;
  const sharedLocations = useMemo(() => Array.from(locations.values()), [locations]);
  const mapRegion = useMemo(() => getMapRegion(sharedLocations), [sharedLocations]);
  const listLocations = useMemo(() => {
    if (!myLocation) return otherLocations;
    return [myLocation, ...otherLocations];
  }, [myLocation, otherLocations]);

  if (starting) return <LoadingView message="Getting your location…" />;

  return (
    <View style={styles.container}>
      <TripLocationMap locations={sharedLocations} region={mapRegion} userId={user?.id} />

      <View style={[styles.topOverlay, { top: insets.top + Spacing.sm }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backButtonText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.sharingCard}>
          <View style={styles.sharingLeft}>
            <Text style={styles.sharingTitle}>
              {isSharing ? 'Sharing your location' : 'Share your location'}
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
      </View>

      <View style={[styles.bottomSheet, { bottom: insets.bottom + Spacing.sm }]}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>
            {listLocations.length === 0
              ? 'No live pins'
              : `${listLocations.length} live pin${listLocations.length !== 1 ? 's' : ''}`}
          </Text>
          <Text style={styles.sheetSubtitle}>
            {otherLocations.length === 0
              ? 'Waiting for trip members'
              : `${otherLocations.length} other member${otherLocations.length !== 1 ? 's' : ''}`}
          </Text>
        </View>
        <FlatList
          data={listLocations}
          keyExtractor={(item) => item.userId}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <LocationCard location={item} isSelf={item.userId === user?.id} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                When trip members enable sharing, their positions will appear here.
              </Text>
            </View>
          }
        />
      </View>
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
  const mapRef = useRef<MapView | null>(null);

  useEffect(() => {
    mapRef.current?.animateToRegion(region, 350);
  }, [region]);

  return (
    <View style={styles.mapFrame}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={region}
        showsUserLocation={false}
        showsCompass
        showsScale
        mapPadding={{ top: 150, right: 24, bottom: 230, left: 24 }}
      >
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
        <View style={styles.mapEmptyOverlay} pointerEvents="none">
          <View style={styles.mapEmptyPanel}>
            <Text style={styles.mapEmptyTitle}>No one is sharing yet</Text>
            <Text style={styles.mapEmptyText}>Live pins will appear as trip members turn sharing on.</Text>
          </View>
        </View>
      ) : null}
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
  topOverlay: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
    ...Shadow.md,
  },
  backButtonText: {
    color: Colors.primary,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: FontWeight.regular,
  },
  sharingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    ...Shadow.md,
  },
  sharingLeft: { flex: 1, marginRight: Spacing.md },
  sharingTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semiBold,
    color: Colors.text,
    marginBottom: 2,
  },
  sharingSubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary },
  mapFrame: {
    flex: 1,
    backgroundColor: Colors.border,
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
    paddingHorizontal: Spacing.lg,
  },
  mapEmptyPanel: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    maxWidth: 280,
    ...Shadow.md,
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
    marginTop: Spacing.sm,
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
  bottomSheet: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    maxHeight: '42%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    paddingTop: Spacing.xs,
    ...Shadow.lg,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  sheetTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semiBold,
    color: Colors.text,
  },
  sheetSubtitle: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  list: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md },
  card: {
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
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
  emptyState: { alignItems: 'center', paddingVertical: Spacing.lg },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: Spacing.md,
  },
});
