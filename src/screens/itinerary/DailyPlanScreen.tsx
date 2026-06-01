import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainStackParamList, ItineraryItem, Announcement } from '../../types';
import { itineraryService } from '../../services/itineraryService';
import { announcementService } from '../../services/announcementService';
import { LoadingView } from '../../components/LoadingView';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../constants/theme';

type Props = NativeStackScreenProps<MainStackParamList, 'DailyPlan'>;

export function DailyPlanScreen({ route }: Props) {
  const { tripId, date } = route.params;
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      itineraryService.getItems(tripId),
      announcementService.getAll(tripId),
    ]).then(([itin, ann]) => {
      const todayItems = (itin.data ?? []).filter((i) =>
        i.start_datetime.startsWith(date)
      );
      setItems(todayItems);
      setAnnouncements(ann.data?.slice(0, 3) ?? []);
      setLoading(false);
    });
  }, [tripId, date]);

  if (loading) return <LoadingView />;

  const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.dateLabel}>{dateLabel}</Text>

      {announcements.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📢 Announcements</Text>
          {announcements.map((ann) => (
            <View key={ann.id} style={[styles.card, styles.annCard]}>
              <Text style={styles.annTitle}>{ann.title}</Text>
              <Text style={styles.annContent} numberOfLines={2}>{ann.content}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🗓️ Schedule</Text>
        {items.length === 0 ? (
          <Text style={styles.emptyText}>No events scheduled for today.</Text>
        ) : (
          items.map((item) => (
            <View key={item.id} style={styles.card}>
              <Text style={styles.itemTime}>
                {new Date(item.start_datetime).toLocaleTimeString('en-US', {
                  hour: '2-digit', minute: '2-digit',
                })}
              </Text>
              <Text style={styles.itemTitle}>{item.title}</Text>
              {item.location ? <Text style={styles.itemLocation}>📍 {item.location}</Text> : null}
              {item.cost_estimate ? <Text style={styles.itemCost}>${item.cost_estimate.toFixed(2)}</Text> : null}
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md },
  dateLabel: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.text, marginBottom: Spacing.lg },
  section: { marginBottom: Spacing.lg },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semiBold, color: Colors.text, marginBottom: Spacing.md },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadow.sm,
  },
  annCard: { borderLeftWidth: 4, borderLeftColor: Colors.primary },
  annTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semiBold, color: Colors.text, marginBottom: 2 },
  annContent: { fontSize: FontSize.sm, color: Colors.textSecondary },
  itemTime: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, marginBottom: 2 },
  itemTitle: { fontSize: FontSize.md, fontWeight: FontWeight.medium, color: Colors.text },
  itemLocation: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  itemCost: { fontSize: FontSize.sm, color: Colors.success, marginTop: 2 },
  emptyText: { fontSize: FontSize.md, color: Colors.textSecondary, textAlign: 'center', padding: Spacing.lg },
});
