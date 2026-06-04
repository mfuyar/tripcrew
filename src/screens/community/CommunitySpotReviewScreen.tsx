import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { CommunitySpot } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { communitySpotService } from '../../services/communitySpotService';
import { AppButton } from '../../components/AppButton';
import { EmptyState } from '../../components/EmptyState';
import { LoadingView } from '../../components/LoadingView';
import { Colors, FontSize, FontWeight, Radius, Shadow, Spacing } from '../../constants/theme';

function publicName(fullName?: string): string {
  const first = fullName?.trim().split(/\s+/)[0];
  return first || 'Anonymous';
}

export function CommunitySpotReviewScreen() {
  const { user } = useAuth();
  const [spots, setSpots] = useState<CommunitySpot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await communitySpotService.getPendingReview();
    if (error) Alert.alert('Unable to load review queue', error);
    setSpots(data ?? []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleReview(spot: CommunitySpot, status: 'approved' | 'rejected') {
    if (!user) return;
    setReviewingId(spot.id);
    const { error } = await communitySpotService.reviewSpot(spot.id, user.id, status);
    setReviewingId(null);
    if (error) {
      Alert.alert('Review failed', error);
      return;
    }
    setSpots((prev) => prev.filter((item) => item.id !== spot.id));
  }

  if (loading) return <LoadingView />;

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={spots}
      keyExtractor={(item) => item.id}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />
      }
      ListEmptyComponent={
        <EmptyState
          icon="✅"
          title="No spots waiting"
          subtitle="Flagged language and +18 photo submissions will appear here for approval."
        />
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          {item.photo_url ? <Image source={{ uri: item.photo_url }} style={styles.photo} /> : null}
          <View style={styles.body}>
            <Text style={styles.title}>{item.name}</Text>
            <Text style={styles.meta}>By {publicName(item.author?.full_name)}</Text>
            <Text style={styles.reason}>{item.moderation_reason || 'Needs moderator review.'}</Text>
            {item.address ? <Text style={styles.address}>{item.address}</Text> : null}
            <Text style={styles.description}>{item.description}</Text>
            <View style={styles.actions}>
              <AppButton
                title="Reject"
                variant="danger"
                onPress={() => handleReview(item, 'rejected')}
                loading={reviewingId === item.id}
                style={styles.action}
              />
              <AppButton
                title="Approve"
                onPress={() => handleReview(item, 'approved')}
                loading={reviewingId === item.id}
                style={styles.action}
              />
            </View>
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, flexGrow: 1 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  photo: { width: '100%', height: 190, backgroundColor: Colors.border },
  body: { padding: Spacing.md },
  title: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text },
  meta: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  reason: {
    fontSize: FontSize.sm,
    color: Colors.danger,
    fontWeight: FontWeight.semiBold,
    marginTop: Spacing.sm,
  },
  address: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: Spacing.sm },
  description: { fontSize: FontSize.sm, color: Colors.text, lineHeight: 20, marginTop: Spacing.sm },
  actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  action: { flex: 1 },
});
