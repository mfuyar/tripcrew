import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, SectionList, TouchableOpacity, RefreshControl,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MainStackParamList, ItineraryItem } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { itineraryService } from '../../services/itineraryService';
import { demoItinerary } from '../../lib/mockData';
import { LoadingView } from '../../components/LoadingView';
import { EmptyState } from '../../components/EmptyState';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../constants/theme';

type Nav = NativeStackNavigationProp<MainStackParamList>;

const TYPE_ICONS: Record<string, string> = {
  activity: '🎯', meal: '🍽️', transport: '🚗', accommodation: '🏨',
  free_time: '☀️', other: '📌',
};

export function ItineraryScreen({ route }: { route: { params: { tripId: string } } }) {
  const navigation = useNavigation<Nav>();
  const { tripId } = route.params;
  const { isDemoMode } = useAuth();
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (isDemoMode) { setItems(demoItinerary); setLoading(false); setRefreshing(false); return; }
    const { data } = await itineraryService.getItems(tripId);
    setItems(data ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [tripId, isDemoMode]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <LoadingView />;

  // Group by date
  const grouped: Record<string, ItineraryItem[]> = {};
  for (const item of items) {
    const date = item.start_datetime.split('T')[0];
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(item);
  }
  const sections = Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({
      title: new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric',
      }),
      data,
    }));

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.dayHeader}>{section.title}</Text>
        )}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('AddEditItineraryItem', { tripId, itemId: item.id })}
          >
            <Text style={styles.typeIcon}>{TYPE_ICONS[item.item_type] ?? '📌'}</Text>
            <View style={styles.info}>
              <Text style={styles.title}>{item.title}</Text>
              {item.location ? <Text style={styles.location}>📍 {item.location}</Text> : null}
              <Text style={styles.time}>
                {new Date(item.start_datetime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                {item.end_datetime ? ` – ${new Date(item.end_datetime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}` : ''}
              </Text>
            </View>
            {item.cost_estimate ? (
              <Text style={styles.cost}>${item.cost_estimate.toFixed(0)}</Text>
            ) : null}
          </TouchableOpacity>
        )}
        ListHeaderComponent={
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => navigation.navigate('AddEditItineraryItem', { tripId })}
          >
            <Text style={styles.addBtnText}>+ Add Item</Text>
          </TouchableOpacity>
        }
        ListEmptyComponent={
          <EmptyState
            icon="🗓️"
            title="No itinerary yet"
            subtitle="Plan your days by adding activities, meals, and more."
            actionLabel="Add Item"
            onAction={() => navigation.navigate('AddEditItineraryItem', { tripId })}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, flexGrow: 1 },
  addBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  addBtnText: { color: Colors.surface, fontWeight: FontWeight.semiBold, fontSize: FontSize.md },
  dayHeader: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    marginTop: Spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadow.sm,
  },
  typeIcon: { fontSize: 24, marginRight: Spacing.md, marginTop: 2 },
  info: { flex: 1 },
  title: { fontSize: FontSize.md, fontWeight: FontWeight.medium, color: Colors.text },
  location: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  time: { fontSize: FontSize.xs, color: Colors.primary, marginTop: 2 },
  cost: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold, color: Colors.success },
});
