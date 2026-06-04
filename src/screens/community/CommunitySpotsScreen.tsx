import React, { useCallback, useState } from 'react';
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
} from 'react-native';
import * as Location from 'expo-location';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CommunitySpot, CommunitySpotCategory, MainStackParamList } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { communitySpotService } from '../../services/communitySpotService';
import { LoadingView } from '../../components/LoadingView';
import { EmptyState } from '../../components/EmptyState';
import { AppButton } from '../../components/AppButton';
import { Colors, FontSize, FontWeight, Radius, Shadow, Spacing } from '../../constants/theme';

type Nav = NativeStackNavigationProp<MainStackParamList>;

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

export function CommunitySpotsScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const [spots, setSpots] = useState<CommunitySpot[]>([]);
  const [guideSummary, setGuideSummary] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lookingAround, setLookingAround] = useState(false);
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [commenting, setCommenting] = useState<string | null>(null);

  const loadRecent = useCallback(async () => {
    const { data, error } = await communitySpotService.getRecent(user?.id);
    if (error) Alert.alert('Unable to load spots', error);
    setSpots(data ?? []);
    setGuideSummary('');
    setLoading(false);
    setRefreshing(false);
  }, [user?.id]);

  useFocusEffect(useCallback(() => { loadRecent(); }, [loadRecent]));

  async function handleLookAround() {
    setLookingAround(true);
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      setLookingAround(false);
      Alert.alert('Location needed', 'Allow location access to find community spots around you.');
      return;
    }

    const position = await Location.getCurrentPositionAsync({});
    const { latitude, longitude } = position.coords;
    const { data, error } = await communitySpotService.getNearby(latitude, longitude, 10, user?.id);
    setLookingAround(false);
    if (error) {
      Alert.alert('Unable to look around', error);
      return;
    }
    const nearby = data ?? [];
    setSpots(nearby);
    setGuideSummary(communitySpotService.summarizeNearbySpots(nearby));
  }

  async function handleToggleUpvote(spot: CommunitySpot) {
    if (!user) return;
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

  if (loading) return <LoadingView />;

  return (
    <View style={styles.container}>
      <View style={styles.actions}>
        <AppButton
          title="Look Around Me"
          onPress={handleLookAround}
          loading={lookingAround}
          style={styles.actionButton}
        />
        <AppButton
          title="Post Spot"
          onPress={() => navigation.navigate('CreateCommunitySpot', {})}
          variant="outline"
          style={styles.actionButton}
        />
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
            <Text style={styles.guideTitle}>Local guide</Text>
            <Text style={styles.guideText}>{guideSummary}</Text>
          </View>
        ) : null}
        ListEmptyComponent={
          <EmptyState
            icon="📍"
            title="No community spots yet"
            subtitle="Share a local favorite, hidden gem, food stop, or viewpoint for other travelers."
            actionLabel="Post Spot"
            onAction={() => navigation.navigate('CreateCommunitySpot', {})}
          />
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
              {item.address ? <Text style={styles.address}>{item.address}</Text> : null}
              <Text style={styles.description}>{item.description}</Text>
              <Text style={styles.meta}>
                By {item.author?.full_name || 'Traveler'} • {item.comments_count} comment{item.comments_count === 1 ? '' : 's'}
              </Text>

              {(item.comments ?? []).slice(0, 2).map((comment) => (
                <View key={comment.id} style={styles.comment}>
                  <Text style={styles.commentAuthor}>{comment.author?.full_name || 'Traveler'}</Text>
                  <Text style={styles.commentText}>{comment.content}</Text>
                </View>
              ))}

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
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  actionButton: { flex: 1 },
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
});
