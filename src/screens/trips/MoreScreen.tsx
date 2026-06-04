import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MainStackParamList } from '../../types';
import { useTripContext } from '../../contexts/TripContext';
import { useAuth } from '../../contexts/AuthContext';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../constants/theme';

type Nav = NativeStackNavigationProp<MainStackParamList>;

interface FeatureItem {
  emoji: string;
  title: string;
  subtitle: string;
  screen: keyof MainStackParamList;
  adminOnly?: boolean;
}

const FEATURES: FeatureItem[] = [
  { emoji: '🧭', title: 'Community Spots', subtitle: 'Discover & share local finds', screen: 'CommunitySpots' },
  { emoji: '👨‍👩‍👧‍👦', title: 'Families', subtitle: 'Manage families & members', screen: 'Families' },
  { emoji: '🤝', title: 'Join a Family', subtitle: 'Select which family you belong to', screen: 'JoinFamily' },
  { emoji: '⚖️', title: 'Balances', subtitle: 'See who owes what', screen: 'Balances', adminOnly: true },
  { emoji: '💸', title: 'Settlements', subtitle: 'Settle up easily', screen: 'Settlements', adminOnly: true },
  { emoji: '📊', title: 'Fairness', subtitle: 'Expense fairness metrics', screen: 'Fairness' },
  { emoji: '🗓️', title: 'Itinerary', subtitle: 'Day-by-day plan', screen: 'Itinerary' },
  { emoji: '🛒', title: 'Grocery List', subtitle: 'Shared shopping list', screen: 'GroceryList' },
  { emoji: '🎒', title: 'Packing List', subtitle: 'Don\'t forget anything', screen: 'PackingList' },
  { emoji: '🚗', title: 'Car Planning', subtitle: 'Coordinate who rides where', screen: 'CarPlanning' },
  { emoji: '🗳️', title: 'Polls', subtitle: 'Group decision making', screen: 'Polls' },
  { emoji: '🚨', title: 'Emergency Info', subtitle: 'Medical & contacts', screen: 'EmergencyInfo' },
  { emoji: '📢', title: 'Announcements', subtitle: 'Trip-wide messages', screen: 'Announcements' },
  { emoji: '🛡️', title: 'Spot Review', subtitle: 'Approve flagged community spots', screen: 'CommunitySpotReview' },
  { emoji: '📷', title: 'Scan Receipt', subtitle: 'AI receipt parsing', screen: 'ReceiptScanner', adminOnly: true },
  { emoji: '📍', title: 'Live Location', subtitle: 'See where everyone is', screen: 'LiveLocation' },
  { emoji: '⚙️', title: 'Trip Settings', subtitle: 'Invite code, members, danger zone', screen: 'TripSettings' },
];

export function MoreScreen({ route }: { route: { params: { tripId: string } } }) {
  const navigation = useNavigation<Nav>();
  const { tripId } = route.params;
  const { canManageTrip } = useTripContext();
  const { isGlobalAdmin } = useAuth();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.header}>All Features</Text>
      {FEATURES.filter((f) => !f.adminOnly || canManageTrip || isGlobalAdmin).map((item) => (
        <TouchableOpacity
          key={item.title}
          style={styles.row}
          onPress={() => (navigation as any).navigate(item.screen, { tripId })}
          activeOpacity={0.7}
        >
          <View style={styles.iconBox}>
            <Text style={styles.emoji}>{item.emoji}</Text>
          </View>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>{item.title}</Text>
            <Text style={styles.rowSubtitle}>{item.subtitle}</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: Spacing.xl },
  header: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadow.sm,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: Radius.sm,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  emoji: { fontSize: 22 },
  rowText: { flex: 1 },
  rowTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semiBold,
    color: Colors.text,
    marginBottom: 2,
  },
  rowSubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary },
  chevron: { fontSize: 20, color: Colors.textSecondary },
});
