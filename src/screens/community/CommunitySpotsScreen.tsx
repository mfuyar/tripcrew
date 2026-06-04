import React, { memo, useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Image,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ScrollView,
} from 'react-native';
import * as Location from 'expo-location';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { CommunitySpot, CommunitySpotCategory, ItineraryType, MainStackParamList } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useTripContext } from '../../contexts/TripContext';
import { communitySpotService } from '../../services/communitySpotService';
import { addressSearchService } from '../../services/addressSearchService';
import { tripService } from '../../services/tripService';
import { LoadingView } from '../../components/LoadingView';
import { AppButton } from '../../components/AppButton';
import { openAppleMapsDirections, openGoogleMapsDirections } from '../../utils/maps';
import { Colors, FontSize, FontWeight, Radius, Shadow, Spacing } from '../../constants/theme';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Props = NativeStackScreenProps<MainStackParamList, 'CommunitySpots'>;

type LookupLocation = {
  latitude: number;
  longitude: number;
  label: string;
  isFallback?: boolean;
};

const DEFAULT_RADIUS_MILES = 10;
const MIN_RADIUS_MILES = 1;
const MAX_RADIUS_MILES = 100;
const RADIUS_OPTIONS = [1, 2, 5, 10, 15, 20, 25, 30, 50, 75, 100];

function normalizeRadiusMiles(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return DEFAULT_RADIUS_MILES;
  return Math.min(MAX_RADIUS_MILES, Math.max(MIN_RADIUS_MILES, parsed));
}

function formatRadiusMiles(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

const CATEGORY_ICON: Record<CommunitySpotCategory, string> = {
  outdoor: '🌿',
  food: '🍽️',
  culture: '🏛️',
  hidden_gem: '✨',
  other: '📍',
};

const CATEGORY_LABEL: Record<CommunitySpotCategory, string> = {
  outdoor: 'Outdoor',
  food: 'Food',
  culture: 'Culture',
  hidden_gem: 'Hidden gem',
  other: 'Other',
};

const CATEGORY_TO_ITINERARY_TYPE: Record<CommunitySpotCategory, ItineraryType> = {
  outdoor: 'activity',
  food: 'meal',
  culture: 'activity',
  hidden_gem: 'activity',
  other: 'other',
};

function publicName(fullName?: string): string {
  const first = fullName?.trim().split(/\s+/)[0];
  return first || 'Anonymous';
}

type ExplorePlaceModalProps = {
  visible: boolean;
  initialQuery: string;
  tripDestination: string;
  lookingAround: boolean;
  radiusMiles: number;
  onRadiusChange: (radius: number) => void;
  onSearch: (query: string) => void;
  onClose: () => void;
};

const ExplorePlaceModal = memo(function ExplorePlaceModal({
  visible,
  initialQuery,
  tripDestination,
  lookingAround,
  radiusMiles,
  onRadiusChange,
  onSearch,
  onClose,
}: ExplorePlaceModalProps) {
  const [query, setQuery] = useState(initialQuery);

  useEffect(() => {
    if (visible) setQuery(initialQuery);
  }, [initialQuery, visible]);

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.modalBox}>
          <Text style={styles.modalTitle}>Explore a Place</Text>
          <Text style={styles.modalSubtitle}>Search before you arrive. Community posts and AI guide picks will use your selected radius.</Text>
          {tripDestination ? (
            <TouchableOpacity
              style={styles.tripSuggestionCard}
              onPress={() => setQuery(tripDestination)}
              disabled={lookingAround}
            >
              <Text style={styles.tripSuggestionLabel}>Suggested from trip</Text>
              <Text style={styles.tripSuggestionText} numberOfLines={2}>{tripDestination}</Text>
            </TouchableOpacity>
          ) : null}
          <TextInput
            style={styles.modalInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Rosemary Beach, FL or your hotel address"
            placeholderTextColor={Colors.textSecondary}
            autoFocus
            returnKeyType="search"
            onSubmitEditing={() => onSearch(query)}
          />
          <View style={styles.radiusBlock}>
            <Text style={styles.radiusLabel}>Radius</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.radiusWheel}
            >
              {RADIUS_OPTIONS.map((option) => {
                const selected = radiusMiles === option;
                return (
                  <TouchableOpacity
                    key={option}
                    style={[styles.radiusOption, selected && styles.radiusOptionSelected]}
                    onPress={() => onRadiusChange(normalizeRadiusMiles(String(option)))}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.radiusOptionText, selected && styles.radiusOptionTextSelected]}>
                      {option}
                    </Text>
                    <Text style={[styles.radiusOptionUnit, selected && styles.radiusOptionTextSelected]}>
                      mi
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
          <AppButton
            title={`Search ${formatRadiusMiles(radiusMiles)} Miles`}
            onPress={() => onSearch(query)}
            loading={lookingAround}
            fullWidth
          />
          <TouchableOpacity style={styles.modalCancel} onPress={onClose}>
            <Text style={styles.modalCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
});

export function CommunitySpotsScreen({ route }: Props) {
  const navigation = useNavigation<Nav>();
  const { tripId, startDate } = route.params ?? {};
  const { user, isGlobalAdmin } = useAuth();
  const { currentTrip, canManageTrip, isTripOrganizer } = useTripContext();
  const [spots, setSpots] = useState<CommunitySpot[]>([]);
  const [guideSummary, setGuideSummary] = useState('');
  const [showingGemini, setShowingGemini] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lookingAround, setLookingAround] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<LookupLocation | null>(null);
  const [manualLocationVisible, setManualLocationVisible] = useState(false);
  const [manualLocationInitialQuery, setManualLocationInitialQuery] = useState('');
  const [radiusMiles, setRadiusMiles] = useState(DEFAULT_RADIUS_MILES);
  const [tripDestinationOverride, setTripDestinationOverride] = useState('');
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [commenting, setCommenting] = useState<string | null>(null);
  // commentId → draft text while editing
  const [editingComment, setEditingComment] = useState<Record<string, string>>({});
  const [savingComment, setSavingComment] = useState<string | null>(null);
  // spotId → true when that spot is in edit mode
  const [editingSpot, setEditingSpot] = useState<string | null>(null);
  const [spotEditDraft, setSpotEditDraft] = useState<Partial<CommunitySpot>>({});
  const [savingSpot, setSavingSpot] = useState(false);
  const contextTripDestination =
    (!tripId || currentTrip?.id === tripId) ? currentTrip?.destination?.trim() : undefined;
  const tripDestination = contextTripDestination || tripDestinationOverride;

  const loadRecent = useCallback(async () => {
    const { data, error } = await communitySpotService.getRecent(user?.id);
    if (error) Alert.alert('Unable to load spots', error);
    setSpots(data ?? []);
    setGuideSummary('');
    setShowingGemini(false);
    setLoading(false);
    setRefreshing(false);
  }, [user?.id]);

  const loadTripDestination = useCallback(async () => {
    if (!tripId || contextTripDestination) {
      setTripDestinationOverride('');
      return;
    }
    const { data } = await tripService.getTripById(tripId);
    setTripDestinationOverride(data?.destination?.trim() ?? '');
  }, [tripId, contextTripDestination]);

  useFocusEffect(useCallback(() => {
    loadRecent();
    loadTripDestination();
  }, [loadRecent, loadTripDestination]));

  async function resolveTripDestination(): Promise<string | null> {
    if (tripDestination) return tripDestination;
    if (!tripId) return null;
    const { data } = await tripService.getTripById(tripId);
    const destination = data?.destination?.trim();
    if (destination) {
      setTripDestinationOverride(destination);
      return destination;
    }
    return null;
  }

  async function getTripDestinationFallback(): Promise<LookupLocation | null> {
    const destination = await resolveTripDestination();
    if (!destination) return null;

    const { data } = await addressSearchService.search(destination, 1);
    const match = data?.[0];
    if (!match) return null;

    return {
      latitude: match.latitude,
      longitude: match.longitude,
      label: match.label || destination,
    };
  }

  function openManualLocation(initialQuery = '') {
    setManualLocationInitialQuery(initialQuery);
    setManualLocationVisible(true);
  }

  async function getDeviceLocation(): Promise<LookupLocation | null> {
    const servicesEnabled = await Location.hasServicesEnabledAsync().catch(() => true);
    if (servicesEnabled) {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status === 'granted') {
        try {
          const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          return {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            label: 'your current location',
            isFallback: false,
          };
        } catch {
          const lastKnown = await Location.getLastKnownPositionAsync({
            maxAge: 15 * 60 * 1000,
            requiredAccuracy: 5000,
          }).catch(() => null);
          if (lastKnown) {
            return {
              latitude: lastKnown.coords.latitude,
              longitude: lastKnown.coords.longitude,
              label: 'your last known location',
              isFallback: true,
            };
          }
        }
      }
    }

    return null;
  }

  async function getLookAroundLocation(): Promise<LookupLocation | null> {
    const deviceLocation = await getDeviceLocation();
    if (deviceLocation) return deviceLocation;

    const fallback = await getTripDestinationFallback();
    if (!fallback) return null;
    return { ...fallback, isFallback: true };
  }

  async function runExplore(
    lookupLocation: LookupLocation,
    options: { includeCommunity: boolean; includeGemini: boolean }
  ) {
    setLookingAround(true);
    setSelectedLocation(lookupLocation);
    const { latitude, longitude } = lookupLocation;
    const searchRadius = radiusMiles;

    const [community, gemini] = await Promise.all([
      options.includeCommunity
        ? communitySpotService.getNearby(latitude, longitude, searchRadius, user?.id)
        : Promise.resolve({ data: [] as CommunitySpot[], error: null }),
      options.includeGemini
        ? communitySpotService.getGeminiFavorites(latitude, longitude, searchRadius, lookupLocation.label)
        : Promise.resolve({ data: [] as CommunitySpot[], error: null }),
    ]);

    if (community.error) {
      setLookingAround(false);
      Alert.alert('Unable to look around', community.error);
      return;
    }

    const communitySpots = community.data ?? [];
    const geminiSpots = gemini.data ?? [];
    const merged = [...communitySpots, ...geminiSpots];
    const geminiError = options.includeGemini ? gemini.error : null;
    const radiusLabel = formatRadiusMiles(searchRadius);
    const summaryLines = [
      lookupLocation.isFallback ? `Using ${lookupLocation.label} because live location was unavailable.` : null,
      options.includeCommunity ? `${communitySpots.length} community spot${communitySpots.length === 1 ? '' : 's'} within ${radiusLabel} miles.` : null,
      options.includeGemini
        ? geminiSpots.length > 0
          ? `${geminiSpots.length} AI travel-guide pick${geminiSpots.length === 1 ? '' : 's'} within about ${radiusLabel} miles.`
          : `AI travel-guide picks could not load${geminiError ? `: ${geminiError}` : '.'}`
        : null,
      communitySpotService.summarizeNearbySpots(merged),
    ].filter(Boolean);

    setLookingAround(false);
    setSpots(merged);
    setShowingGemini(geminiSpots.length > 0);
    setGuideSummary(`Around ${lookupLocation.label}\n${summaryLines.join('\n')}`);
  }

  async function handleLookAround() {
    const lookupLocation = await getLookAroundLocation();
    if (!lookupLocation) {
      Alert.alert(
        'Location unavailable',
        'Turn on Location Services, set a Simulator location, choose a place, or add a trip destination so Travel Crew can search around that area.'
      );
      return;
    }
    await runExplore(lookupLocation, { includeCommunity: true, includeGemini: true });
  }

  async function handleTravelLocation() {
    const lookupLocation = await getTripDestinationFallback();
    if (!lookupLocation) {
      const destination = await resolveTripDestination();
      if (destination) {
        openManualLocation(destination);
        Alert.alert(
          'Trip address needs search',
          'I put the trip destination in the search box. Edit it if needed, choose the radius, then search.'
        );
      } else {
        openManualLocation();
        Alert.alert('Trip location needed', 'Add a trip destination or choose a place to explore before you arrive.');
      }
      return;
    }
    await runExplore(lookupLocation, { includeCommunity: true, includeGemini: true });
  }

  async function handleGeminiPicks() {
    const lookupLocation = selectedLocation ?? await getTripDestinationFallback() ?? await getLookAroundLocation();
    if (!lookupLocation) {
      openManualLocation();
      return;
    }
    await runExplore(lookupLocation, { includeCommunity: false, includeGemini: true });
  }

  async function handleManualLocationSearch(searchText: string) {
    const query = searchText.trim();
    if (query.length < 3) {
      Alert.alert('Choose Location', 'Type a city, beach, attraction, hotel, or address.');
      return;
    }
    setLookingAround(true);
    const { data, error } = await addressSearchService.search(query, 1);
    setLookingAround(false);
    if (error) {
      Alert.alert('Location search failed', error);
      return;
    }
    const match = data?.[0];
    if (!match) {
      const deviceLocation = await getDeviceLocation();
      if (!deviceLocation) {
        Alert.alert(
          'That does not look like a location',
          'Type a real city, landmark, hotel, or address. Location access is unavailable, so I could not show spots around you.'
        );
        return;
      }
      setManualLocationVisible(false);
      Alert.alert('That does not look like a location', 'Showing spots around your current location instead.');
      await runExplore(deviceLocation, { includeCommunity: true, includeGemini: true });
      return;
    }
    setManualLocationVisible(false);
    await runExplore(
      { latitude: match.latitude, longitude: match.longitude, label: match.label || query },
      { includeCommunity: true, includeGemini: true }
    );
  }

  async function handleToggleUpvote(spot: CommunitySpot) {
    if (!user) return;
    if (spot.source === 'gemini') {
      Alert.alert('Suggested place', 'Gemini suggestions cannot be upvoted yet. Post it as a community spot if you want others to vote on it.');
      return;
    }
    const { data, error } = await communitySpotService.toggleUpvote(spot.id, user.id);
    if (error) {
      Alert.alert('Unable to vote', error);
      return;
    }
    setSpots((prev) => prev.map((item) => (
      item.id === spot.id
        ? { ...item, ...data, viewer_has_upvoted: !(spot.viewer_has_upvoted ?? false) }
        : item
    )));
  }

  async function handleAddComment(spot: CommunitySpot) {
    if (!user) return;
    if (spot.source === 'gemini') {
      Alert.alert('Suggested place', 'Comments are for community posts. Post this place as a spot first.');
      return;
    }
    const content = commentText[spot.id]?.trim();
    if (!content) return;

    setCommenting(spot.id);
    const { data, error } = await communitySpotService.addComment(spot.id, user.id, content);
    setCommenting(null);
    if (error) {
      Alert.alert('Unable to comment', error);
      return;
    }
    setCommentText((prev) => ({ ...prev, [spot.id]: '' }));
    setSpots((prev) => prev.map((item) => (
      item.id === spot.id
        ? {
            ...item,
            comments_count: item.comments_count + 1,
            comments: [data!, ...(item.comments ?? [])],
          }
        : item
    )));
  }

  async function handleSaveEditComment(spotId: string, commentId: string) {
    const draft = editingComment[commentId]?.trim();
    if (!draft) return;
    setSavingComment(commentId);
    const { data, error } = await communitySpotService.updateComment(commentId, draft);
    setSavingComment(null);
    if (error) { Alert.alert('Unable to update comment', error); return; }
    setEditingComment((prev) => { const next = { ...prev }; delete next[commentId]; return next; });
    setSpots((prev) => prev.map((item) =>
      item.id !== spotId ? item : {
        ...item,
        comments: (item.comments ?? []).map((c) => c.id === commentId ? data! : c),
      }
    ));
  }

  async function handleDeleteSpot(spotId: string) {
    Alert.alert('Delete Spot', 'Remove this community spot permanently?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await communitySpotService.deleteSpot(spotId);
          if (error) { Alert.alert('Error', error); return; }
          setSpots((prev) => prev.filter((s) => s.id !== spotId));
        },
      },
    ]);
  }

  async function handleSaveSpotEdit(spotId: string) {
    const draft = spotEditDraft;
    if (!draft.name?.trim() || !draft.description?.trim()) {
      Alert.alert('Required', 'Name and description are required.');
      return;
    }
    setSavingSpot(true);
    const { data, error } = await communitySpotService.updateSpot(spotId, {
      name: draft.name.trim(),
      category: (draft.category ?? 'other') as CommunitySpot['category'],
      description: draft.description.trim(),
      address: draft.address?.trim(),
    });
    setSavingSpot(false);
    if (error) { Alert.alert('Error', error); return; }
    setEditingSpot(null);
    setSpots((prev) => prev.map((s) => s.id === spotId ? { ...s, ...data } : s));
  }

  function handleAddToItinerary(spot: CommunitySpot) {
    if (!tripId) return;
    const location = spot.address || `${spot.latitude.toFixed(5)}, ${spot.longitude.toFixed(5)}`;
    navigation.navigate('AddEditItineraryItem', {
      tripId,
      prefill: {
        title: spot.name,
        itemType: CATEGORY_TO_ITINERARY_TYPE[spot.category],
        location,
        startDate,
        notes: spot.source === 'gemini'
          ? `${spot.description}\n\nSuggested by Gemini local guide.`
          : spot.description,
      },
    });
  }

  if (loading) return <LoadingView />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={96}>
    <View style={styles.container}>
      <View style={styles.actions}>
        <AppButton
          title="Current Location"
          onPress={handleLookAround}
          loading={lookingAround}
          style={styles.actionButton}
        />
        <AppButton
          title="Post Spot"
          onPress={() => navigation.navigate('CreateCommunitySpot', { tripId })}
          variant="outline"
          style={styles.actionButton}
        />
      </View>
      <View style={styles.secondaryActions}>
        {tripDestination ? (
          <TouchableOpacity style={[styles.secondaryButton, styles.tripSuggestionButton]} onPress={handleTravelLocation} disabled={lookingAround}>
            <Text style={styles.secondaryButtonText} numberOfLines={1}>Trip: {tripDestination}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.secondaryButton} onPress={handleTravelLocation} disabled={lookingAround}>
            <Text style={styles.secondaryButtonText}>Trip Location</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.secondaryButton} onPress={() => openManualLocation()} disabled={lookingAround}>
          <Text style={styles.secondaryButtonText}>Choose Place</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.secondaryButton, styles.aiButton]} onPress={handleGeminiPicks} disabled={lookingAround}>
          <Text style={[styles.secondaryButtonText, styles.aiButtonText]}>AI Guide Picks</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={spots}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadRecent(); }} tintColor={Colors.primary} />
        }
        contentContainerStyle={styles.content}
        ListHeaderComponent={guideSummary ? (
          <View style={styles.guideBox}>
            <Text style={styles.guideTitle}>{showingGemini ? 'Gemini local guide' : 'Local guide'}</Text>
            <Text style={styles.guideText}>{guideSummary}</Text>
          </View>
        ) : null}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📍</Text>
            <Text style={styles.emptyTitle}>No community spots yet</Text>
            <Text style={styles.emptySubtitle}>
              Find nearby favorites with Gemini or share the first local spot for other travelers.
            </Text>
            <View style={styles.emptyActions}>
              <AppButton
                title="Find around trip/current location"
                onPress={handleLookAround}
                loading={lookingAround}
                style={styles.emptyButton}
              />
              <AppButton
                title="Choose another place"
                onPress={() => openManualLocation()}
                variant="outline"
                style={styles.emptyButton}
              />
              <AppButton
                title="Post Spot"
                onPress={() => navigation.navigate('CreateCommunitySpot', { tripId })}
                variant="outline"
                style={styles.emptyButton}
              />
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            {item.photo_url ? <Image source={{ uri: item.photo_url }} style={styles.photo} /> : null}
            <View style={styles.cardBody}>
              <View style={styles.spotHeader}>
                <View style={styles.spotTitleWrap}>
                  <Text style={styles.spotName}>{item.name}</Text>
                  <Text style={styles.category}>
                    {CATEGORY_ICON[item.category]} {CATEGORY_LABEL[item.category]}
                    {item.distance_miles != null ? ` • ${item.distance_miles.toFixed(1)} mi` : ''}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.voteButton, item.viewer_has_upvoted && styles.voteButtonActive]}
                  onPress={() => handleToggleUpvote(item)}
                >
                  <Text style={[styles.voteText, item.viewer_has_upvoted && styles.voteTextActive]}>
                    ▲ {item.upvotes_count}
                  </Text>
                </TouchableOpacity>
              </View>
              {(item.address || (item.latitude && item.longitude)) ? (
                <View style={styles.directionsRow}>
                  <Text style={styles.address} numberOfLines={1}>
                    📍 {item.address || `${item.latitude?.toFixed(4)}, ${item.longitude?.toFixed(4)}`}
                  </Text>
                  <TouchableOpacity
                    style={styles.dirBtn}
                    onPress={() => openAppleMapsDirections(item.address || `${item.latitude},${item.longitude}`)}
                  >
                    <Text style={styles.dirBtnText}>Maps</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.dirBtn, styles.dirBtnGoogle]}
                    onPress={() => openGoogleMapsDirections(item.address || `${item.latitude},${item.longitude}`)}
                  >
                    <Text style={styles.dirBtnText}>Google</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              <Text style={styles.description}>{item.description}</Text>
              <Text style={styles.meta}>
                {item.source === 'gemini'
                  ? 'Suggested by Gemini'
                  : `By ${publicName(item.author?.full_name)} • ${item.comments_count} comment${item.comments_count === 1 ? '' : 's'}`}
              </Text>

              {/* Spot owner / organizer / global admin actions */}
              {item.source !== 'gemini' && (item.user_id === user?.id || isTripOrganizer || isGlobalAdmin) && (
                editingSpot === item.id ? (
                  <View style={styles.spotEditBox}>
                    <TextInput
                      style={styles.spotEditInput}
                      value={spotEditDraft.name ?? ''}
                      onChangeText={(v) => setSpotEditDraft((d) => ({ ...d, name: v }))}
                      placeholder="Name"
                      placeholderTextColor={Colors.textSecondary}
                    />
                    <TextInput
                      style={[styles.spotEditInput, { minHeight: 64, textAlignVertical: 'top' }]}
                      value={spotEditDraft.description ?? ''}
                      onChangeText={(v) => setSpotEditDraft((d) => ({ ...d, description: v }))}
                      placeholder="Description"
                      placeholderTextColor={Colors.textSecondary}
                      multiline
                    />
                    <TextInput
                      style={styles.spotEditInput}
                      value={spotEditDraft.address ?? ''}
                      onChangeText={(v) => setSpotEditDraft((d) => ({ ...d, address: v }))}
                      placeholder="Address (optional)"
                      placeholderTextColor={Colors.textSecondary}
                    />
                    <View style={styles.spotEditActions}>
                      <TouchableOpacity
                        style={[styles.spotSaveBtn, savingSpot && styles.commentButtonDisabled]}
                        onPress={() => handleSaveSpotEdit(item.id)}
                        disabled={savingSpot}
                      >
                        <Text style={styles.spotSaveBtnText}>{savingSpot ? 'Saving…' : 'Save'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.commentCancelBtn}
                        onPress={() => setEditingSpot(null)}
                      >
                        <Text style={styles.commentCancelText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={styles.spotOwnerActions}>
                    {/* Poster or global admin can edit */}
                    {(item.user_id === user?.id || isGlobalAdmin) && (
                      <TouchableOpacity
                        hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
                        onPress={() => {
                          setSpotEditDraft({ name: item.name, description: item.description, category: item.category, address: item.address });
                          setEditingSpot(item.id);
                        }}
                      >
                        <Text style={styles.commentEditLink}>Edit</Text>
                      </TouchableOpacity>
                    )}
                    {/* Poster OR organizer can delete */}
                    <TouchableOpacity
                      hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
                      onPress={() => handleDeleteSpot(item.id)}
                    >
                      <Text style={styles.spotDeleteLink}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                )
              )}

              {tripId ? (
                <AppButton
                  title="Add to Itinerary"
                  onPress={() => handleAddToItinerary(item)}
                  variant="outline"
                  style={styles.itineraryButton}
                />
              ) : null}

              {item.source !== 'gemini' && (item.comments ?? []).slice(0, 2).map((comment) => {
                const isEditing = comment.id in editingComment;
                const canEdit = comment.user_id === user?.id || canManageTrip || isGlobalAdmin;
                return (
                  <View key={comment.id} style={styles.comment}>
                    <View style={styles.commentHeader}>
                      <Text style={styles.commentAuthor}>{publicName(comment.author?.full_name)}</Text>
                      {canEdit && !isEditing && (
                        <TouchableOpacity
                          hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
                          onPress={() => setEditingComment((prev) => ({ ...prev, [comment.id]: comment.content }))}
                        >
                          <Text style={styles.commentEditLink}>Edit</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    {isEditing ? (
                      <View style={styles.commentRow}>
                        <TextInput
                          style={[styles.commentInput, { flex: 1 }]}
                          value={editingComment[comment.id]}
                          onChangeText={(v) => setEditingComment((prev) => ({ ...prev, [comment.id]: v }))}
                          autoFocus
                          multiline
                        />
                        <TouchableOpacity
                          style={[styles.commentButton, savingComment === comment.id && styles.commentButtonDisabled]}
                          onPress={() => handleSaveEditComment(item.id, comment.id)}
                          disabled={savingComment === comment.id}
                        >
                          <Text style={styles.commentButtonText}>{savingComment === comment.id ? '...' : 'Save'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.commentCancelBtn}
                          onPress={() => setEditingComment((prev) => { const n = { ...prev }; delete n[comment.id]; return n; })}
                        >
                          <Text style={styles.commentCancelText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <Text style={styles.commentText}>{comment.content}</Text>
                    )}
                  </View>
                );
              })}

              {item.source !== 'gemini' ? (
                <View style={styles.commentRow}>
                  <TextInput
                    style={styles.commentInput}
                    value={commentText[item.id] ?? ''}
                    onChangeText={(value) => setCommentText((prev) => ({ ...prev, [item.id]: value }))}
                    placeholder="Add a local note..."
                    placeholderTextColor={Colors.textSecondary}
                  />
                  <TouchableOpacity
                    style={[styles.commentButton, commenting === item.id && styles.commentButtonDisabled]}
                    onPress={() => handleAddComment(item)}
                    disabled={commenting === item.id}
                  >
                    <Text style={styles.commentButtonText}>{commenting === item.id ? '...' : 'Post'}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          </View>
        )}
      />
      <ExplorePlaceModal
        visible={manualLocationVisible}
        initialQuery={manualLocationInitialQuery}
        tripDestination={tripDestination}
        lookingAround={lookingAround}
        radiusMiles={radiusMiles}
        onRadiusChange={setRadiusMiles}
        onSearch={handleManualLocationSearch}
        onClose={() => setManualLocationVisible(false)}
      />
    </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.md,
    paddingBottom: Spacing.sm,
    backgroundColor: Colors.surface,
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  actionButton: { flex: 1 },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  secondaryButtonText: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: FontWeight.semiBold,
    textAlign: 'center',
  },
  aiButton: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  aiButtonText: { color: Colors.primary },
  tripSuggestionButton: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  content: { padding: Spacing.md, flexGrow: 1 },
  guideBox: {
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
  },
  guideTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, marginBottom: Spacing.xs },
  guideText: { fontSize: FontSize.sm, color: Colors.text, lineHeight: 20 },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: Spacing.md,
  },
  emptyTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  emptySubtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  emptyActions: {
    width: '100%',
    gap: Spacing.sm,
  },
  emptyButton: {
    width: '100%',
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  photo: { width: '100%', height: 190, backgroundColor: Colors.border },
  cardBody: { padding: Spacing.md },
  spotHeader: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  spotTitleWrap: { flex: 1 },
  spotName: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text },
  category: { fontSize: FontSize.sm, color: Colors.primary, marginTop: 2 },
  voteButton: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  voteButtonActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  voteText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.semiBold },
  voteTextActive: { color: Colors.primary },
  address: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: Spacing.sm },
  description: { fontSize: FontSize.sm, color: Colors.text, lineHeight: 20, marginTop: Spacing.sm },
  meta: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: Spacing.sm },
  itineraryButton: { marginTop: Spacing.md },
  comment: {
    backgroundColor: Colors.background,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    marginTop: Spacing.sm,
  },
  commentAuthor: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.semiBold },
  commentText: { fontSize: FontSize.sm, color: Colors.text, marginTop: 2 },
  commentRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.text,
    fontSize: FontSize.sm,
  },
  commentButton: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentButtonDisabled: { opacity: 0.5 },
  commentButtonText: { color: Colors.surface, fontSize: FontSize.sm, fontWeight: FontWeight.semiBold },
  directionsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xs, flexWrap: 'wrap' },
  dirBtn: {
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.primary,
  },
  dirBtnGoogle: { borderColor: Colors.success },
  dirBtnText: { fontSize: 11, color: Colors.primary, fontWeight: FontWeight.semiBold },
  spotOwnerActions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm },
  spotDeleteLink: { fontSize: FontSize.xs, color: Colors.danger, fontWeight: FontWeight.semiBold },
  spotEditBox: { marginTop: Spacing.sm, gap: Spacing.sm },
  spotEditInput: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    padding: Spacing.sm, fontSize: FontSize.sm, color: Colors.text, backgroundColor: Colors.surface,
  },
  spotEditActions: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  spotSaveBtn: {
    flex: 1, backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: Spacing.sm, alignItems: 'center',
  },
  spotSaveBtnText: { color: Colors.surface, fontSize: FontSize.sm, fontWeight: FontWeight.semiBold },
  commentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  commentEditLink: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semiBold },
  commentCancelBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  commentCancelText: { fontSize: 12, color: Colors.textSecondary, fontWeight: FontWeight.semiBold },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.xl,
  },
  modalTitle: { fontSize: FontSize.xl, color: Colors.text, fontWeight: FontWeight.bold, marginBottom: Spacing.xs },
  modalSubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20, marginBottom: Spacing.md },
  tripSuggestionCard: {
    borderWidth: 1,
    borderColor: Colors.primary + '55',
    borderRadius: Radius.md,
    padding: Spacing.md,
    backgroundColor: Colors.primaryLight,
    marginBottom: Spacing.md,
  },
  tripSuggestionLabel: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: FontWeight.semiBold,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  tripSuggestionText: { fontSize: FontSize.md, color: Colors.text, fontWeight: FontWeight.semiBold },
  modalInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  radiusBlock: { marginBottom: Spacing.md },
  radiusLabel: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: FontWeight.semiBold,
    marginBottom: Spacing.xs,
  },
  radiusWheel: {
    gap: Spacing.sm,
    paddingVertical: 2,
    paddingRight: Spacing.md,
  },
  radiusOption: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    minWidth: 64,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  radiusOptionSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  radiusOptionText: {
    fontSize: FontSize.lg,
    color: Colors.text,
    fontWeight: FontWeight.bold,
  },
  radiusOptionUnit: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semiBold,
    marginTop: -2,
  },
  radiusOptionTextSelected: { color: Colors.primary },
  modalCancel: { alignItems: 'center', paddingTop: Spacing.md },
  modalCancelText: { color: Colors.textSecondary, fontSize: FontSize.md, fontWeight: FontWeight.semiBold },
});
