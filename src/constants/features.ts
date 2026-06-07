import { MainStackParamList } from '../types';

export const TRIP_FEATURES = [
  { key: 'community_spots', label: 'Community Spots', description: 'Explore and post local spots.', screens: ['CommunitySpots', 'CreateCommunitySpot'] },
  { key: 'families', label: 'Families', description: 'Families, family joining, and family management.', screens: ['Families', 'JoinFamily', 'AddEditFamily', 'FamilyDetail'] },
  { key: 'expenses', label: 'Expenses', description: 'Expenses, balances, settlements, fairness, and payment tracking.', screens: ['Expenses', 'AddEditExpense', 'Balances', 'Settlements', 'PaymentTracking', 'ExpenseHistory', 'Fairness'] },
  { key: 'chat', label: 'Chat', description: 'Trip chat and push talk.', screens: ['Chat'] },
  { key: 'album', label: 'Album', description: 'Trip photo album and media details.', screens: ['Album', 'MediaDetail'] },
  { key: 'itinerary', label: 'Itinerary', description: 'Itinerary and daily plan.', screens: ['Itinerary', 'AddEditItineraryItem', 'DailyPlan'] },
  { key: 'grocery', label: 'Grocery List', description: 'Shared grocery list.', screens: ['GroceryList'] },
  { key: 'packing', label: 'Packing List', description: 'Shared packing list.', screens: ['PackingList'] },
  { key: 'cars', label: 'Car Planning', description: 'Car planning and passengers.', screens: ['CarPlanning', 'AddEditCar'] },
  { key: 'polls', label: 'Polls', description: 'Polls and voting.', screens: ['Polls', 'CreatePoll', 'PollDetail'] },
  { key: 'emergency', label: 'Emergency Info', description: 'Emergency contacts and medical info.', screens: ['EmergencyInfo'] },
  { key: 'announcements', label: 'Announcements', description: 'Trip announcements.', screens: ['Announcements'] },
  { key: 'live_location', label: 'Live Location', description: 'Live location sharing map.', screens: ['LiveLocation'] },
  { key: 'receipt_scan', label: 'Receipt Scan', description: 'AI receipt scanning.', screens: ['ReceiptScanner'] },
] as const;

export type TripFeatureKey = typeof TRIP_FEATURES[number]['key'];

export interface TripFeatureFlag {
  trip_id: string;
  feature_key: TripFeatureKey;
  enabled: boolean;
  updated_by?: string;
  updated_at: string;
}

export function featureForScreen(screen: keyof MainStackParamList): TripFeatureKey | null {
  const feature = TRIP_FEATURES.find((item) =>
    (item.screens as readonly string[]).includes(screen as string)
  );
  return feature?.key ?? null;
}

export function defaultFeatureMap(): Record<TripFeatureKey, boolean> {
  return TRIP_FEATURES.reduce((acc, feature) => {
    acc[feature.key] = true;
    return acc;
  }, {} as Record<TripFeatureKey, boolean>);
}
