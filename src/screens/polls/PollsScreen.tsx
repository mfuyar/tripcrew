import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MainStackParamList, Poll } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useTripContext } from '../../contexts/TripContext';
import { pollService } from '../../services/pollService';
import { demoPolls } from '../../lib/mockData';
import { LoadingView } from '../../components/LoadingView';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../constants/theme';

type Nav = NativeStackNavigationProp<MainStackParamList>;

export function PollsScreen({ route }: { route: { params: { tripId: string } } }) {
  const navigation = useNavigation<Nav>();
  const { tripId } = route.params;
  const { isDemoMode } = useAuth();
  const { canManageTrip } = useTripContext();
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (isDemoMode) { setPolls(demoPolls); setLoading(false); setRefreshing(false); return; }
    const { data } = await pollService.getPolls(tripId);
    setPolls(data ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [tripId, isDemoMode]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <LoadingView />;

  return (
    <FlatList
      data={polls}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />
      }
      ListHeaderComponent={canManageTrip ? (
        <TouchableOpacity style={styles.createBtn} onPress={() => navigation.navigate('CreatePoll', { tripId })}>
          <Text style={styles.createBtnText}>+ Create Poll</Text>
        </TouchableOpacity>
      ) : null}
      ListEmptyComponent={
        <EmptyState
          icon="🗳️"
          title="No polls yet"
          subtitle={canManageTrip ? 'Create a poll to help your group decide.' : 'Polls created by admins will appear here.'}
          actionLabel={canManageTrip ? 'Create Poll' : undefined}
          onAction={canManageTrip ? () => navigation.navigate('CreatePoll', { tripId }) : undefined}
        />
      }
      renderItem={({ item }) => {
        const totalVotes = item.options?.reduce((s, o) => s + o.votes_count, 0) ?? 0;
        return (
          <TouchableOpacity
            style={styles.pollCard}
            onPress={() => navigation.navigate('PollDetail', { tripId, pollId: item.id })}
          >
            <View style={styles.pollHeader}>
              <Text style={styles.question} numberOfLines={2}>{item.question}</Text>
              <StatusBadge status={item.status} />
            </View>
            <Text style={styles.meta}>
              {item.options?.length ?? 0} options • {totalVotes} vote{totalVotes !== 1 ? 's' : ''}
            </Text>
            {item.deadline && (
              <Text style={styles.deadline}>
                Deadline: {new Date(item.deadline).toLocaleDateString()}
              </Text>
            )}
          </TouchableOpacity>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.md, flexGrow: 1, backgroundColor: Colors.background },
  createBtn: { backgroundColor: Colors.primary, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', marginBottom: Spacing.md },
  createBtnText: { color: Colors.surface, fontWeight: FontWeight.semiBold, fontSize: FontSize.md },
  pollCard: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.md, ...Shadow.sm },
  pollHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.sm, marginBottom: Spacing.sm },
  question: { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.semiBold, color: Colors.text },
  meta: { fontSize: FontSize.sm, color: Colors.textSecondary },
  deadline: { fontSize: FontSize.xs, color: Colors.warning, marginTop: 2 },
});
