import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, Alert, Image, TextInput, ScrollView,
  Linking, ActivityIndicator, Platform,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { CommunitySpot, CommunitySpotCategory, ItineraryType, MainStackParamList, SpotPreference } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useTripContext } from '../../contexts/TripContext';
import { communitySpotService } from '../../services/communitySpotService';
import {
  fetchNearbyPlaces, mergeAndRankSpots,
  CATEGORY_META, PREFERENCE_META, RADIUS_OPTIONS_MILES,
  haversineKm, kmToMiles, milesToKm,
} from '../../services/placesService';
import { addressSearchService } from '../../services/addressSearchService';
import { LoadingView } from '../../components/LoadingView';
import { AppButton } from '../../components/AppButton';
import { openAppleMapsDirections, openGoogleMapsDirections } from '../../utils/maps';
import { Colors, FontSize, FontWeight, Radius, Shadow, Spacing } from '../../constants/theme';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Props = NativeStackScreenProps<MainStackParamList, 'CommunitySpots'>;

type FilterTab = 'all' | 'api' | 'member' | 'saved' | 'voted' | 'family' | 'free' | 'indoor' | 'hidden';
type ViewMode = 'list' | 'map';
type SortMode = 'recommended' | 'closest' | 'voted' | 'saved';
type DistanceUnit = 'miles' | 'km';

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: 'all',    label: 'All' },
  { id: 'api',    label: 'Nearby' },
  { id: 'member', label: 'By Members' },
  { id: 'saved',  label: 'Saved' },
  { id: 'voted',  label: 'Top Voted' },
  { id: 'family', label: 'Family' },
  { id: 'free',   label: 'Free' },
  { id: 'indoor', label: 'Indoor' },
  { id: 'hidden', label: 'Hidden Gems' },
];

function publicName(name?: string): string {
  return name?.trim().split(/\s+/)[0] || 'Member';
}

// ─── Source badge ─────────────────────────────────────────────────────────────

function SourceBadge({ sourceName, sourceType }: { sourceName?: string; sourceType?: string }) {
  const label = sourceName ?? (sourceType === 'api' ? 'OpenStreetMap' : 'Member');
  const color = sourceType === 'api' ? Colors.success : Colors.primary;
  return (
    <View style={[styles.sourceBadge, { borderColor: color + '60', backgroundColor: color + '15' }]}>
      <Text style={[styles.sourceBadgeText, { color }]}>{label}</Text>
    </View>
  );
}

// ─── Spot Card ────────────────────────────────────────────────────────────────

interface SpotCardProps {
  spot: CommunitySpot;
  user: any;
  canManageTrip: boolean;
  distanceUnit: DistanceUnit;
  currentTripId?: string;   // the trip the user is currently browsing
  onVote: (spot: CommunitySpot) => void;
  onLike: (spot: CommunitySpot) => void;
  onSave: (spot: CommunitySpot) => void;
  onComment: (spot: CommunitySpot) => void;
  onAddToItinerary: (spot: CommunitySpot) => void;
  onEdit?: (spot: CommunitySpot) => void;
  onDelete?: (spot: CommunitySpot) => void;
  tripId?: string;
}

function SpotCard({
  spot, user, canManageTrip, distanceUnit, currentTripId,
  onVote, onLike, onSave, onComment, onAddToItinerary, onEdit, onDelete, tripId,
}: SpotCardProps) {
  const [expanded, setExpanded] = useState(false);
  const cat = CATEGORY_META[spot.category] ?? CATEGORY_META.other;
  const distVal = distanceUnit === 'km'
    ? (spot.distance_km ?? 0).toFixed(1)
    : (spot.distance_miles ?? kmToMiles(spot.distance_km ?? 0)).toFixed(1);

  const canEdit = spot.user_id === user?.id || canManageTrip;

  // Member spots from OTHER trips show name + category only — no details
  const isOtherTripMemberSpot =
    spot.source_type === 'member' &&
    spot.trip_id &&
    currentTripId &&
    spot.trip_id !== currentTripId;

  // API spots (OpenStreetMap, OpenTripMap) are public data — always show full details


  // For other-trip member spots: show full details but anonymise the submitter name to initials
  const displaySubmitter = isOtherTripMemberSpot && spot.submitted_by_name
    ? spot.submitted_by_name.trim().split(/\s+/).map(w => w[0]?.toUpperCase()).join('')
    : spot.submitted_by_name;

  return (
    <View style={styles.card}>
      {spot.photo_url ? (
        <Image source={{ uri: spot.photo_url }} style={styles.cardImage} resizeMode="cover" />
      ) : (
        <View style={[styles.cardImagePlaceholder, { backgroundColor: Colors.primaryLight }]}>
          <Text style={styles.cardImageEmoji}>{cat.icon}</Text>
        </View>
      )}
      <View style={styles.cardBody}>
        {/* Header */}
        <View style={styles.cardHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardName} numberOfLines={2}>{spot.name}</Text>
            <View style={styles.cardMetaRow}>
              <Text style={styles.catLabel}>{cat.icon} {cat.label}</Text>
              <Text style={styles.distLabel}>· {distVal} {distanceUnit}</Text>
            </View>
          </View>
          <SourceBadge sourceName={spot.source_name} sourceType={spot.source_type} />
        </View>

        {/* Address */}
        {spot.address ? <Text style={styles.address} numberOfLines={1}>📍 {spot.address}</Text> : null}

        {/* Description */}
        {spot.description ? (
          <Text style={styles.description} numberOfLines={expanded ? undefined : 2}>
            {spot.description}
          </Text>
        ) : null}

        {/* Why recommended */}
        {spot.why_recommended ? (
          <Text style={styles.whyText} numberOfLines={expanded ? undefined : 2}>
            💡 {spot.why_recommended}
          </Text>
        ) : null}

        {/* Expand toggle */}
        {(spot.description?.length ?? 0) > 100 || (spot.why_recommended?.length ?? 0) > 80 ? (
          <TouchableOpacity onPress={() => setExpanded(e => !e)}>
            <Text style={styles.expandLink}>{expanded ? 'Show less' : 'Show more'}</Text>
          </TouchableOpacity>
        ) : null}

        {/* Extra details (expanded) */}
        {expanded && (
          <View style={styles.extraDetails}>
            {spot.website ? (
              <TouchableOpacity onPress={() => Linking.openURL(spot.website!)}>
                <Text style={styles.websiteLink}>🌐 {spot.website}</Text>
              </TouchableOpacity>
            ) : null}
            {spot.opening_hours ? (
              <Text style={styles.detailRow}>🕐 {spot.opening_hours}</Text>
            ) : null}
            {spot.source_type === 'member' && (
              <>
                {displaySubmitter && (
                  <Text style={styles.detailRow}>
                    👤 Added by {displaySubmitter}
                    {spot.created_at ? ` · ${new Date(spot.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                  </Text>
                )}
                <Text style={styles.memberClaim}>
                  ⚠️ Member-submitted. Claims are not independently verified.
                </Text>
              </>
            )}
            {/* Matched preferences */}
            {(spot.matched_preferences?.length ?? 0) > 0 && (
              <View style={styles.prefChips}>
                {spot.matched_preferences!.map(p => (
                  <View key={p} style={styles.prefChip}>
                    <Text style={styles.prefChipText}>{p}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Engagement row — vote / like / comment / save */}
        <View style={styles.engagementRow}>
          <TouchableOpacity style={styles.engBtn} onPress={() => onVote(spot)}>
            <Text style={[styles.engBtnText, spot.viewer_has_upvoted && styles.engBtnActive]}>▲ {spot.upvotes_count}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.engBtn} onPress={() => onLike(spot)}>
            <Text style={[styles.engBtnText, spot.viewer_has_liked && styles.engBtnActive]}>♥ {spot.likes_count ?? 0}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.engBtn} onPress={() => onComment(spot)}>
            <Text style={styles.engBtnText}>💬 {spot.comments_count}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.engBtn, styles.engBtnSave]} onPress={() => onSave(spot)}>
            <Text style={[styles.engBtnText, spot.viewer_has_saved && styles.engBtnActive]}>
              {spot.viewer_has_saved ? '🔖 Saved' : '🔖 Save'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Navigate row */}
        <View style={styles.navRow}>
          <TouchableOpacity style={styles.navBtn} onPress={() => openAppleMapsDirections(spot.address || `${spot.latitude},${spot.longitude}`)}>
            <Text style={styles.navBtnText}>🗺 Maps</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => openGoogleMapsDirections(spot.address || `${spot.latitude},${spot.longitude}`)}>
            <Text style={styles.navBtnText}>📍 Google</Text>
          </TouchableOpacity>
          {tripId ? (
            <TouchableOpacity style={[styles.navBtn, styles.navBtnPrimary]} onPress={() => onAddToItinerary(spot)}>
              <Text style={styles.navBtnPrimaryText}>＋ Itinerary</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Owner actions row */}
        {(canEdit || (canManageTrip || spot.user_id === user?.id)) ? (
          <View style={styles.ownerRow}>
            {canEdit && onEdit ? (
              <TouchableOpacity style={styles.ownerBtn} onPress={() => onEdit(spot)}>
                <Text style={styles.ownerBtnText}>✏️ Edit</Text>
              </TouchableOpacity>
            ) : null}
            {(canManageTrip || spot.user_id === user?.id) && onDelete ? (
              <TouchableOpacity style={[styles.ownerBtn, styles.ownerBtnDanger]} onPress={() => onDelete(spot)}>
                <Text style={styles.ownerBtnDangerText}>🗑 Delete</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function CommunitySpotsScreen({ route }: Props) {
  const navigation = useNavigation<Nav>();
  const { tripId, startDate } = route.params ?? {};
  const { user } = useAuth();
  const { currentTrip, canManageTrip } = useTripContext();

  // Spots state
  const [spots, setSpots] = useState<CommunitySpot[]>([]);
  const [memberSpots, setMemberSpots] = useState<CommunitySpot[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // UI state
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [sortMode, setSortMode] = useState<SortMode>('recommended');
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>('miles');

  // Search config
  const [radius, setRadius] = useState(10);
  const [preferences, setPreferences] = useState<SpotPreference[]>([]);
  const [searchLocation, setSearchLocation] = useState<{ lat: number; lon: number; label: string } | null>(null);
  const [destinationInput, setDestinationInput] = useState('');
  const [geocoding, setGeocoding] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [showRadiusPicker, setShowRadiusPicker] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  // Comment state
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [commenting, setCommenting] = useState<string | null>(null);

  // Map state
  const mapRef = useRef<MapView>(null);

  // ─── Load member spots ──────────────────────────────────────────────────────

  const loadMemberSpots = useCallback(async () => {
    const { data } = await communitySpotService.getRecent(user?.id);
    const spots = (data ?? []).map(s => ({
      ...s,
      source_type: (s.source === 'gemini' ? 'gemini' : 'member') as any,
      source_name: s.source === 'gemini' ? 'Gemini' : 'Member Suggested',
      distance_km: searchLocation
        ? haversineKm(searchLocation.lat, searchLocation.lon, s.latitude, s.longitude)
        : undefined,
    }));
    setMemberSpots(spots);
    return spots;
  }, [user?.id, searchLocation]);

  useFocusEffect(useCallback(() => {
    loadMemberSpots().finally(() => setLoading(false));
  }, [loadMemberSpots]));

  // ─── Resolve location ───────────────────────────────────────────────────────

  async function resolveLocation(): Promise<{ lat: number; lon: number; label: string } | null> {
    // 1. Try current GPS
    const enabled = await Location.hasServicesEnabledAsync().catch(() => false);
    if (enabled) {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status === 'granted') {
        try {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          return { lat: pos.coords.latitude, lon: pos.coords.longitude, label: 'your location' };
        } catch {}
      }
    }
    // 2. Trip destination fallback
    const dest = currentTrip?.destination?.trim();
    if (dest) {
      const { data } = await addressSearchService.search(dest, 1);
      const match = data?.[0];
      if (match) return { lat: match.latitude, lon: match.longitude, label: dest };
    }
    return null;
  }

  async function handleSearchByDestination() {
    const text = destinationInput.trim();
    if (!text) return;
    setGeocoding(true);
    const { data } = await addressSearchService.search(text, 1);
    setGeocoding(false);
    const match = data?.[0];
    if (!match) { Alert.alert('Not found', `Could not find "${text}". Try a city name or address.`); return; }
    const loc = { lat: match.latitude, lon: match.longitude, label: text };
    setSearchLocation(loc);
    handleSearch(true, loc);
  }

  // ─── Search nearby ──────────────────────────────────────────────────────────

  async function handleSearch(forceRefresh = false, overrideLoc?: { lat: number; lon: number; label: string }) {
    setSearching(true);
    setLastError(null);

    const loc = overrideLoc ?? searchLocation ?? await resolveLocation();
    if (!loc) {
      setSearching(false);
      Alert.alert('Location unavailable', 'Enter a destination above or enable location services.');
      return;
    }
    setSearchLocation(loc);

    const { spots: apiSpots, error } = await fetchNearbyPlaces({
      lat: loc.lat, lon: loc.lon, radiusMiles: radius,
      preferences, distanceUnit, forceRefresh,
    });

    if (error) setLastError(error);

    const members = await loadMemberSpots();
    // Attach distance to member spots
    const membersWithDist = members.map(s => ({
      ...s,
      distance_km: haversineKm(loc.lat, loc.lon, s.latitude, s.longitude),
      distance_miles: kmToMiles(haversineKm(loc.lat, loc.lon, s.latitude, s.longitude)),
    }));

    const merged = mergeAndRankSpots(apiSpots, membersWithDist, preferences, distanceUnit);
    setSpots(merged);
    setSearching(false);

    // Pan map to location
    if (viewMode === 'map') {
      mapRef.current?.animateToRegion({
        latitude: loc.lat, longitude: loc.lon,
        latitudeDelta: 0.05, longitudeDelta: 0.05,
      });
    }
  }

  // ─── Filtering & sorting ────────────────────────────────────────────────────

  function applyFilter(s: CommunitySpot): boolean {
    switch (activeFilter) {
      case 'api':     return s.source_type === 'api';
      case 'member':  return s.source_type === 'member';
      case 'saved':   return s.viewer_has_saved === true;
      case 'voted':   return (s.upvotes_count ?? 0) > 0;
      case 'family':  return ['park', 'family', 'attraction', 'museum'].includes(s.category);
      case 'free':    return ['park', 'religious', 'outdoor', 'hidden_gem', 'free'].includes(s.category);
      case 'indoor':  return ['museum', 'shopping', 'indoor', 'food'].includes(s.category);
      case 'hidden':  return s.category === 'hidden_gem';
      default:        return true;
    }
  }

  function applySort(a: CommunitySpot, b: CommunitySpot): number {
    switch (sortMode) {
      case 'closest': return (a.distance_km ?? 99) - (b.distance_km ?? 99);
      case 'voted':   return (b.upvotes_count ?? 0) - (a.upvotes_count ?? 0);
      case 'saved':   return (b.saves_count ?? 0) - (a.saves_count ?? 0);
      default:        return (b.priority_score ?? 0) - (a.priority_score ?? 0);
    }
  }

  const displaySpots = spots.length > 0
    ? spots.filter(applyFilter).sort(applySort)
    : memberSpots.filter(applyFilter).sort(applySort);

  // ─── Actions ────────────────────────────────────────────────────────────────

  async function handleVote(spot: CommunitySpot) {
    if (!user || spot.source_type === 'api') {
      if (spot.source_type === 'api') Alert.alert('Suggested place', 'Save this spot first to vote on it.');
      return;
    }
    const { data, error } = await communitySpotService.toggleUpvote(spot.id, user.id);
    if (error) { Alert.alert('Error', error); return; }
    updateSpot(spot.id, { upvotes_count: data?.upvotes_count ?? spot.upvotes_count, viewer_has_upvoted: !spot.viewer_has_upvoted });
  }

  async function handleLike(spot: CommunitySpot) {
    if (!user || spot.source_type === 'api') return;
    updateSpot(spot.id, { viewer_has_liked: !spot.viewer_has_liked, likes_count: (spot.likes_count ?? 0) + (spot.viewer_has_liked ? -1 : 1) });
    // DB like toggle would go here
  }

  async function handleSave(spot: CommunitySpot) {
    if (!user) return;
    updateSpot(spot.id, { viewer_has_saved: !spot.viewer_has_saved, saves_count: (spot.saves_count ?? 0) + (spot.viewer_has_saved ? -1 : 1) });
  }

  async function handleComment(spot: CommunitySpot) {
    if (!user || spot.source_type === 'api') {
      if (spot.source_type === 'api') Alert.alert('Suggested place', 'Post this spot to comment on it.');
      return;
    }
    const content = commentText[spot.id]?.trim();
    if (!content) return;
    setCommenting(spot.id);
    const { data, error } = await communitySpotService.addComment(spot.id, user.id, content);
    setCommenting(null);
    if (error) { Alert.alert('Error', error); return; }
    setCommentText(prev => ({ ...prev, [spot.id]: '' }));
    updateSpot(spot.id, { comments_count: spot.comments_count + 1, comments: [data!, ...(spot.comments ?? [])] });
  }

  async function handleAddToItinerary(spot: CommunitySpot) {
    if (!tripId) return;
    navigation.navigate('AddEditItineraryItem', {
      tripId,
      prefill: {
        title: spot.name,
        location: spot.address || `${spot.latitude},${spot.longitude}`,
        notes: spot.description,
        itemType: spot.category === 'food' ? 'meal' : 'activity',
        startDate: startDate,
      },
    });
  }

  async function handleDeleteSpot(spot: CommunitySpot) {
    Alert.alert('Delete Spot', `Remove "${spot.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const { error } = await communitySpotService.deleteSpot(spot.id);
          if (error) Alert.alert('Error', error);
          else setSpots(prev => prev.filter(s => s.id !== spot.id));
        },
      },
    ]);
  }

  function updateSpot(id: string, updates: Partial<CommunitySpot>) {
    setSpots(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    setMemberSpots(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }

  function togglePreference(pref: SpotPreference) {
    setPreferences(prev =>
      prev.includes(pref) ? prev.filter(p => p !== pref) : [...prev, pref]
    );
  }

  // ─── Map region ─────────────────────────────────────────────────────────────

  const mapRegion: Region | undefined = searchLocation ? {
    latitude: searchLocation.lat,
    longitude: searchLocation.lon,
    latitudeDelta: milesToKm(radius) / 55,
    longitudeDelta: milesToKm(radius) / 55,
  } : undefined;

  // ─── Category color for map pins ─────────────────────────────────────────────

  const CAT_COLORS: Record<string, string> = {
    attraction: '#FF6B35', park: '#4CAF50', museum: '#9C27B0',
    food: '#FF9800', shopping: '#2196F3', religious: '#795548',
    family: '#E91E63', free: '#00BCD4', indoor: '#607D8B',
    hidden_gem: '#FFD700', outdoor: '#8BC34A', culture: '#673AB7', other: '#9E9E9E',
  };

  if (loading) return <LoadingView />;

  return (
    <View style={styles.container}>
      {/* ── Top controls ── */}
      <View style={styles.controls}>
        {/* Destination input */}
        <View style={styles.destinationRow}>
          <TextInput
            style={styles.destinationInput}
            value={destinationInput}
            onChangeText={setDestinationInput}
            placeholder="Search a destination (city, address…)"
            placeholderTextColor={Colors.textSecondary}
            returnKeyType="search"
            onSubmitEditing={handleSearchByDestination}
            clearButtonMode="while-editing"
          />
          <TouchableOpacity
            style={[styles.destinationBtn, geocoding && { opacity: 0.5 }]}
            onPress={handleSearchByDestination}
            disabled={geocoding || !destinationInput.trim()}
          >
            <Text style={styles.destinationBtnText}>{geocoding ? '⏳' : '→'}</Text>
          </TouchableOpacity>
        </View>

        {/* Divider */}
        <View style={styles.orRow}>
          <View style={styles.orLine} />
          <Text style={styles.orText}>or</Text>
          <View style={styles.orLine} />
        </View>

        {/* Row 1: current location + radius + unit */}
        <View style={styles.controlRow}>
          <TouchableOpacity style={styles.searchBtn} onPress={() => handleSearch()}>
            <Text style={styles.searchBtnText}>
              {searching ? '⏳ Searching...' : '📍 Use My Location'}
            </Text>
            {searchLocation && <Text style={styles.searchBtnSub} numberOfLines={1}>{searchLocation.label}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.radiusBtn} onPress={() => setShowRadiusPicker(v => !v)}>
            <Text style={styles.radiusBtnText}>{radius} mi</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.unitBtn} onPress={() => setDistanceUnit(u => u === 'miles' ? 'km' : 'miles')}>
            <Text style={styles.unitBtnText}>{distanceUnit}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.viewToggle, viewMode === 'map' && styles.viewToggleActive]} onPress={() => setViewMode(v => v === 'list' ? 'map' : 'list')}>
            <Text style={styles.viewToggleText}>{viewMode === 'list' ? '🗺️' : '📋'}</Text>
          </TouchableOpacity>
        </View>

        {/* Radius picker */}
        {showRadiusPicker && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.radiusPicker}>
            {RADIUS_OPTIONS_MILES.map(r => (
              <TouchableOpacity key={r} style={[styles.radiusChip, radius === r && styles.radiusChipActive]} onPress={() => { setRadius(r); setShowRadiusPicker(false); }}>
                <Text style={[styles.radiusChipText, radius === r && styles.radiusChipTextActive]}>{r} mi</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Preference chips */}
        <TouchableOpacity style={styles.prefToggle} onPress={() => setShowPrefs(v => !v)}>
          <Text style={styles.prefToggleText}>
            {showPrefs ? '▲' : '▾'} Preferences{preferences.length > 0 ? ` (${preferences.length})` : ''}
          </Text>
        </TouchableOpacity>
        {showPrefs && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.prefRow}>
            {PREFERENCE_META.map(p => (
              <TouchableOpacity
                key={p.id}
                style={[styles.prefChipLarge, preferences.includes(p.id) && styles.prefChipLargeActive]}
                onPress={() => togglePreference(p.id)}
              >
                <Text style={[styles.prefChipLargeText, preferences.includes(p.id) && styles.prefChipLargeTextActive]}>
                  {p.icon} {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Filter tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterTabs}>
          {FILTER_TABS.map(tab => (
            <TouchableOpacity key={tab.id} style={[styles.filterTab, activeFilter === tab.id && styles.filterTabActive]} onPress={() => setActiveFilter(tab.id)}>
              <Text style={[styles.filterTabText, activeFilter === tab.id && styles.filterTabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Sort row */}
        <View style={styles.sortRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {(['recommended', 'closest', 'voted', 'saved'] as SortMode[]).map(s => (
              <TouchableOpacity key={s} style={[styles.sortChip, sortMode === s && styles.sortChipActive]} onPress={() => setSortMode(s)}>
                <Text style={[styles.sortChipText, sortMode === s && styles.sortChipTextActive]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Post Spot — full-width so it never overlaps */}
        <View style={styles.postRow}>
          <TouchableOpacity style={styles.postBtn} onPress={() => navigation.navigate('CreateCommunitySpot', { tripId })}>
            <Text style={styles.postBtnText}>+ Post a Spot</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Error */}
      {lastError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>⚠️ {lastError}</Text>
          <TouchableOpacity onPress={() => setLastError(null)}><Text style={styles.errorDismiss}>✕</Text></TouchableOpacity>
        </View>
      )}

      {/* ── Map view ── */}
      {viewMode === 'map' && mapRegion ? (
        <MapView ref={mapRef} style={styles.map} region={mapRegion} showsUserLocation>
          {displaySpots.map(spot => (
            <Marker
              key={spot.id}
              coordinate={{ latitude: spot.latitude, longitude: spot.longitude }}
              title={spot.name}
              description={spot.address || spot.category}
              pinColor={CAT_COLORS[spot.category] ?? '#9E9E9E'}
            />
          ))}
        </MapView>
      ) : (
        /* ── List view ── */
        <FlatList
          data={displaySpots}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); handleSearch(true).finally(() => setRefreshing(false)); }} tintColor={Colors.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🗺️</Text>
              <Text style={styles.emptyTitle}>
                {searching ? 'Searching for nearby places...' : 'No spots found'}
              </Text>
              <Text style={styles.emptySub}>
                {searching
                  ? 'Fetching real places from OpenStreetMap...'
                  : spots.length === 0
                    ? 'Tap "Look Around Me" to discover nearby attractions, parks, museums, restaurants and more.'
                    : 'Try a different filter or increase the radius.'}
              </Text>
              {!searching && spots.length === 0 && (
                <AppButton title="Search Nearby" onPress={() => handleSearch()} style={styles.emptyBtn} />
              )}
            </View>
          }
          renderItem={({ item }) => (
            <View>
              <SpotCard
                spot={item}
                user={user}
                canManageTrip={canManageTrip}
                distanceUnit={distanceUnit}
                currentTripId={tripId}
                onVote={handleVote}
                onLike={handleLike}
                onSave={handleSave}
                onComment={handleComment}
                onAddToItinerary={handleAddToItinerary}
                onEdit={item.source_type !== 'api' && (item.user_id === user?.id || canManageTrip) ? (s) => navigation.navigate('CreateCommunitySpot', { tripId, editSpot: s }) : undefined}
                onDelete={item.source_type !== 'api' ? handleDeleteSpot : undefined}
                tripId={tripId}
              />
              {/* Inline comment input for member spots */}
              {item.source_type !== 'api' && (
                <View style={styles.commentRow}>
                  <TextInput
                    style={styles.commentInput}
                    value={commentText[item.id] ?? ''}
                    onChangeText={v => setCommentText(prev => ({ ...prev, [item.id]: v }))}
                    placeholder="Add a note..."
                    placeholderTextColor={Colors.textSecondary}
                  />
                  <TouchableOpacity
                    style={[styles.commentBtn, commenting === item.id && styles.commentBtnDisabled]}
                    onPress={() => handleComment(item)}
                    disabled={commenting === item.id}
                  >
                    <Text style={styles.commentBtnText}>{commenting === item.id ? '...' : 'Post'}</Text>
                  </TouchableOpacity>
                </View>
              )}
              {/* Show existing comments */}
              {(item.comments ?? []).slice(0, 2).map(c => (
                <View key={c.id} style={styles.comment}>
                  <Text style={styles.commentAuthor}>{publicName(c.author?.full_name)}</Text>
                  <Text style={styles.commentContent}>{c.content}</Text>
                </View>
              ))}
            </View>
          )}
        />
      )}

      {/* Searching overlay */}
      {searching && (
        <View style={styles.searchingOverlay}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.searchingText}>Fetching real places from OpenStreetMap...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  controls: { backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingBottom: Spacing.sm },
  destinationRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.sm, paddingTop: Spacing.sm, gap: Spacing.xs },
  destinationInput: {
    flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    fontSize: FontSize.sm, color: Colors.text, backgroundColor: Colors.background,
  },
  destinationBtn: {
    width: 38, height: 38, borderRadius: Radius.md, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  destinationBtnText: { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.bold },
  orRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: 4 },
  orLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  orText: { marginHorizontal: Spacing.sm, fontSize: FontSize.xs, color: Colors.textSecondary },
  controlRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.sm, gap: Spacing.xs },
  searchBtn: { flex: 1, backgroundColor: Colors.primary, borderRadius: Radius.md, padding: Spacing.sm },
  searchBtnText: { color: '#fff', fontWeight: FontWeight.semiBold, fontSize: FontSize.sm },
  searchBtnSub: { color: '#ffffff99', fontSize: FontSize.xs },
  radiusBtn: { borderWidth: 1, borderColor: Colors.primary, borderRadius: Radius.md, paddingHorizontal: Spacing.sm, paddingVertical: 6 },
  radiusBtnText: { color: Colors.primary, fontWeight: FontWeight.semiBold, fontSize: FontSize.xs },
  unitBtn: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing.sm, paddingVertical: 6 },
  unitBtnText: { color: Colors.textSecondary, fontSize: FontSize.xs },
  viewToggle: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: 6 },
  viewToggleActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  viewToggleText: { fontSize: 16 },
  radiusPicker: { paddingHorizontal: Spacing.sm, paddingBottom: Spacing.xs },
  radiusChip: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 4, marginRight: Spacing.xs, backgroundColor: Colors.surface },
  radiusChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  radiusChipText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  radiusChipTextActive: { color: Colors.primary, fontWeight: FontWeight.semiBold },
  prefToggle: { paddingHorizontal: Spacing.md, paddingVertical: 4 },
  prefToggleText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semiBold },
  prefRow: { paddingHorizontal: Spacing.sm, paddingBottom: Spacing.xs },
  prefChipLarge: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 5, marginRight: Spacing.xs, backgroundColor: Colors.surface },
  prefChipLargeActive: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  prefChipLargeText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  prefChipLargeTextActive: { color: '#fff', fontWeight: FontWeight.semiBold },
  filterTabs: { paddingHorizontal: Spacing.sm },
  filterTab: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full, marginRight: Spacing.xs, backgroundColor: Colors.background },
  filterTabActive: { backgroundColor: Colors.primary },
  filterTabText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  filterTabTextActive: { color: '#fff', fontWeight: FontWeight.semiBold },
  sortRow: { paddingHorizontal: Spacing.sm, paddingTop: Spacing.xs },
  postRow: { paddingHorizontal: Spacing.sm, paddingTop: Spacing.xs },
  sortChip: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 4, marginRight: Spacing.xs },
  sortChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  sortChipText: { fontSize: FontSize.xs, color: Colors.textSecondary, textTransform: 'capitalize' },
  sortChipTextActive: { color: Colors.primary, fontWeight: FontWeight.semiBold },
  postBtn: { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 10, alignItems: 'center' },
  postBtnText: { color: '#fff', fontWeight: FontWeight.semiBold, fontSize: FontSize.sm },
  errorBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.warning + '20', padding: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.warning + '40' },
  errorText: { flex: 1, fontSize: FontSize.xs, color: Colors.warning },
  errorDismiss: { color: Colors.warning, fontWeight: FontWeight.bold, paddingLeft: Spacing.sm },
  list: { padding: Spacing.md, flexGrow: 1 },
  map: { flex: 1 },
  // Card
  card: { backgroundColor: Colors.surface, borderRadius: Radius.lg, marginBottom: Spacing.md, overflow: 'hidden', ...Shadow.sm },
  cardImage: { width: '100%', height: 160 },
  cardImagePlaceholder: { width: '100%', height: 80, alignItems: 'center', justifyContent: 'center' },
  cardImageEmoji: { fontSize: 36 },
  cardBody: { padding: Spacing.md },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: Spacing.xs },
  cardName: { fontSize: FontSize.md, fontWeight: FontWeight.semiBold, color: Colors.text },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2, flexWrap: 'wrap' },
  catLabel: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.medium },
  distLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, marginLeft: 4 },
  sourceBadge: { borderWidth: 1, borderRadius: Radius.sm, paddingHorizontal: 6, paddingVertical: 2, flexShrink: 0 },
  sourceBadgeText: { fontSize: 10, fontWeight: FontWeight.semiBold },
  address: { fontSize: FontSize.xs, color: Colors.textSecondary, marginBottom: Spacing.xs },
  description: { fontSize: FontSize.sm, color: Colors.text, lineHeight: 18, marginBottom: Spacing.xs },
  whyText: { fontSize: FontSize.xs, color: Colors.primary, fontStyle: 'italic', marginBottom: Spacing.xs },
  expandLink: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semiBold, marginBottom: Spacing.xs },
  extraDetails: { marginTop: Spacing.xs, gap: 4 },
  websiteLink: { fontSize: FontSize.xs, color: Colors.primary, textDecorationLine: 'underline' },
  detailRow: { fontSize: FontSize.xs, color: Colors.textSecondary },
  memberClaim: { fontSize: FontSize.xs, color: Colors.warning, fontStyle: 'italic' },
  prefChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  prefChip: { backgroundColor: Colors.primaryLight, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2 },
  prefChipText: { fontSize: 10, color: Colors.primary, fontWeight: FontWeight.medium },
  // Engagement
  engagementRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: Colors.border, marginTop: Spacing.sm },
  engBtn: { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm },
  engBtnSave: { flex: 1.4 },
  engBtnText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  engBtnActive: { color: Colors.primary },
  // Navigate
  navRow: { flexDirection: 'row', gap: Spacing.xs, marginTop: Spacing.sm },
  navBtn: { flex: 1, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingVertical: 7 },
  navBtnText: { fontSize: FontSize.xs, color: Colors.text, fontWeight: FontWeight.medium },
  navBtnPrimary: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  navBtnPrimaryText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semiBold },
  // Owner actions
  ownerRow: { flexDirection: 'row', gap: Spacing.xs, marginTop: Spacing.xs },
  ownerBtn: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: Spacing.md, paddingVertical: 5 },
  ownerBtnText: { fontSize: FontSize.xs, color: Colors.text, fontWeight: FontWeight.medium },
  ownerBtnDanger: { borderColor: Colors.danger + '60' },
  ownerBtnDangerText: { fontSize: FontSize.xs, color: Colors.danger },
  commentRow: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm, backgroundColor: Colors.surface },
  commentInput: { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing.sm, fontSize: FontSize.sm, color: Colors.text, backgroundColor: Colors.background },
  commentBtn: { borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, backgroundColor: Colors.primary },
  commentBtnDisabled: { opacity: 0.5 },
  commentBtnText: { color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.semiBold },
  comment: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xs, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border },
  commentAuthor: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.semiBold },
  commentContent: { fontSize: FontSize.sm, color: Colors.text },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  emptyIcon: { fontSize: 48, marginBottom: Spacing.md },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semiBold, color: Colors.text, textAlign: 'center', marginBottom: Spacing.sm },
  emptySub: { fontSize: FontSize.md, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: Spacing.lg },
  emptyBtn: { marginTop: Spacing.sm },
  searchingOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  searchingText: { fontSize: FontSize.md, color: Colors.textSecondary, textAlign: 'center' },
});
