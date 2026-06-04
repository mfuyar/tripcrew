import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, SectionList, TouchableOpacity, RefreshControl, ScrollView,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MainStackParamList, ItineraryItem } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useTripContext } from '../../contexts/TripContext';
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

const ALL_DATES = 'all';

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function makeDateAtNoon(dateKey: string) {
  return new Date(`${dateKey}T12:00:00`);
}

function buildDateRange(startDate?: string, endDate?: string) {
  if (!startDate || !endDate) return [];
  const start = makeDateAtNoon(startDate);
  const end = makeDateAtNoon(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];

  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(formatDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

export function ItineraryScreen({ route }: { route: { params: { tripId: string } } }) {
  const navigation = useNavigation<Nav>();
  const { tripId } = route.params;
  const { isDemoMode } = useAuth();
  const { currentTrip } = useTripContext();
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(ALL_DATES);

  const load = useCallback(async () => {
    if (isDemoMode) { setItems(demoItinerary); setLoading(false); setRefreshing(false); return; }
    const { data } = await itineraryService.getItems(tripId);
    setItems(data ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [tripId, isDemoMode]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const itemDates = [...new Set(items.map((item) => item.start_datetime.split('T')[0]))].sort();
  const tripDates = currentTrip?.id === tripId
    ? buildDateRange(currentTrip.start_date, currentTrip.end_date)
    : [];
  const calendarDates = tripDates.length > 0
    ? tripDates
    : itemDates;
  const defaultStartDate = selectedDate !== ALL_DATES
    ? selectedDate
    : calendarDates[0];

  const grouped = useMemo(() => {
    const next: Record<string, ItineraryItem[]> = {};
    for (const item of items) {
      const date = item.start_datetime.split('T')[0];
      if (selectedDate !== ALL_DATES && date !== selectedDate) continue;
      if (!next[date]) next[date] = [];
      next[date].push(item);
    }
    return next;
  }, [items, selectedDate]);

  const sections = Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({
      title: makeDateAtNoon(date).toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric',
      }),
      data,
    }));

  function addItemForDate() {
    navigation.navigate('AddEditItineraryItem', {
      tripId,
      prefill: defaultStartDate ? { startDate: defaultStartDate } : undefined,
    });
  }

  function findPlacesForDate() {
    navigation.navigate('CommunitySpots', { tripId, startDate: defaultStartDate });
  }

  if (loading) return <LoadingView />;

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
          <View style={styles.header}>
            {calendarDates.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.calendar}
              >
                <TouchableOpacity
                  style={[styles.dateChip, selectedDate === ALL_DATES && styles.dateChipActive]}
                  onPress={() => setSelectedDate(ALL_DATES)}
                >
                  <Text style={[styles.dateWeekday, selectedDate === ALL_DATES && styles.dateTextActive]}>All</Text>
                  <Text style={[styles.dateDay, selectedDate === ALL_DATES && styles.dateTextActive]}>{calendarDates.length}</Text>
                  <Text style={[styles.dateMonth, selectedDate === ALL_DATES && styles.dateTextActive]}>days</Text>
                </TouchableOpacity>
                {calendarDates.map((date) => {
                  const dateObj = makeDateAtNoon(date);
                  const isActive = selectedDate === date;
                  const hasItems = itemDates.includes(date);
                  return (
                    <TouchableOpacity
                      key={date}
                      style={[styles.dateChip, isActive && styles.dateChipActive]}
                      onPress={() => setSelectedDate(date)}
                    >
                      <Text style={[styles.dateWeekday, isActive && styles.dateTextActive]}>
                        {dateObj.toLocaleDateString('en-US', { weekday: 'short' })}
                      </Text>
                      <Text style={[styles.dateDay, isActive && styles.dateTextActive]}>
                        {dateObj.toLocaleDateString('en-US', { day: 'numeric' })}
                      </Text>
                      <Text style={[styles.dateMonth, isActive && styles.dateTextActive]}>
                        {dateObj.toLocaleDateString('en-US', { month: 'short' })}
                      </Text>
                      {hasItems ? <View style={[styles.dateDot, isActive && styles.dateDotActive]} /> : null}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : null}
            <View style={styles.headerActions}>
              <TouchableOpacity style={styles.findBtn} onPress={findPlacesForDate}>
                <Text style={styles.findBtnText}>Find Places</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addBtn} onPress={addItemForDate}>
                <Text style={styles.addBtnText}>+ Add Item</Text>
              </TouchableOpacity>
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="🗓️"
            title={selectedDate === ALL_DATES ? 'No itinerary yet' : 'No plans on this date'}
            subtitle="Add a plan or find nearby places to bring into the itinerary."
            actionLabel="Add Item"
            onAction={addItemForDate}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, flexGrow: 1 },
  header: { marginBottom: Spacing.md },
  calendar: { gap: Spacing.sm, paddingBottom: Spacing.md },
  dateChip: {
    width: 72,
    minHeight: 88,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    ...Shadow.sm,
  },
  dateChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  dateWeekday: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.semiBold },
  dateDay: { fontSize: FontSize.xl, color: Colors.text, fontWeight: FontWeight.bold, marginTop: 2 },
  dateMonth: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  dateTextActive: { color: Colors.surface },
  dateDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
    marginTop: Spacing.xs,
  },
  dateDotActive: { backgroundColor: Colors.surface },
  headerActions: { flexDirection: 'row', gap: Spacing.sm },
  addBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  addBtnText: { color: Colors.surface, fontWeight: FontWeight.semiBold, fontSize: FontSize.md },
  findBtn: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  findBtnText: { color: Colors.primary, fontWeight: FontWeight.semiBold, fontSize: FontSize.md },
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
