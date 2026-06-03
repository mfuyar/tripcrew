/**
 * Demo mode mock data — used when user taps "Try Demo" on the login screen.
 * Simulates a beach trip with 3 families, real expenses, settlements, chat, etc.
 */

import { Profile, Trip, Family, FamilyMember, Expense, Settlement, Message, ItineraryItem, GroceryItem, PackingItem, Car, Poll, Announcement } from '../types';

export const DEMO_USER_ID = 'demo-user-1';

export const demoProfile: Profile = {
  id: DEMO_USER_ID,
  email: 'demo@tripcrew.app',
  full_name: 'Alex Demo',
  avatar_url: undefined,
  created_at: '2024-06-01T10:00:00Z',
  updated_at: '2024-06-01T10:00:00Z',
};

export const demoRecipients: Profile[] = [
  {
    id: 'user-2',
    email: 'maya@tripcrew.app',
    full_name: 'Maya Yilmaz',
    avatar_url: undefined,
    created_at: '2024-06-01T10:05:00Z',
    updated_at: '2024-06-01T10:05:00Z',
  },
  {
    id: 'user-3',
    email: 'can@tripcrew.app',
    full_name: 'Can Demir',
    avatar_url: undefined,
    created_at: '2024-06-01T10:10:00Z',
    updated_at: '2024-06-01T10:10:00Z',
  },
];

export const demoTrip: Trip = {
  id: 'demo-trip-1',
  name: '🏖️ Beach Week 2024',
  destination: 'Outer Banks, NC',
  description: 'Annual beach trip with the three families!',
  start_date: '2024-07-06',
  end_date: '2024-07-13',
  currency: 'USD',
  created_by: DEMO_USER_ID,
  is_active: true,
  invite_code: 'BEACH24',
  created_at: '2024-05-01T10:00:00Z',
  updated_at: '2024-05-01T10:00:00Z',
};

export const demoFamilies: Family[] = [
  {
    id: 'fam-a',
    trip_id: 'demo-trip-1',
    name: 'Uyar Family',
    adults_count: 2,
    children_count: 1,
    color: '#4F7FFF',
    created_by: DEMO_USER_ID,
    created_at: '2024-05-01T10:00:00Z',
    updated_at: '2024-05-01T10:00:00Z',
  },
  {
    id: 'fam-b',
    trip_id: 'demo-trip-1',
    name: 'Yilmaz Family',
    adults_count: 2,
    children_count: 2,
    color: '#FF8C42',
    created_by: 'user-2',
    created_at: '2024-05-01T10:00:00Z',
    updated_at: '2024-05-01T10:00:00Z',
  },
  {
    id: 'fam-c',
    trip_id: 'demo-trip-1',
    name: 'Demir Family',
    adults_count: 2,
    children_count: 0,
    color: '#34C759',
    created_by: 'user-3',
    created_at: '2024-05-01T10:00:00Z',
    updated_at: '2024-05-01T10:00:00Z',
  },
];

export const demoExpenses: Expense[] = [
  {
    id: 'exp-1',
    trip_id: 'demo-trip-1',
    title: '🏠 Beach House Rental',
    amount: 2400,
    currency: 'USD',
    category: 'lodging',
    paid_by_family_id: 'fam-a',
    paid_by_user_id: DEMO_USER_ID,
    split_method: 'equal_by_family',
    date: '2024-07-06',
    created_at: '2024-07-06T14:00:00Z',
    updated_at: '2024-07-06T14:00:00Z',
    expense_splits: [
      { id: 's1', expense_id: 'exp-1', trip_id: 'demo-trip-1', family_id: 'fam-a', share_amount: 800, created_at: '2024-07-06T14:00:00Z' },
      { id: 's2', expense_id: 'exp-1', trip_id: 'demo-trip-1', family_id: 'fam-b', share_amount: 800, created_at: '2024-07-06T14:00:00Z' },
      { id: 's3', expense_id: 'exp-1', trip_id: 'demo-trip-1', family_id: 'fam-c', share_amount: 800, created_at: '2024-07-06T14:00:00Z' },
    ],
  },
  {
    id: 'exp-2',
    trip_id: 'demo-trip-1',
    title: '🛒 Grocery Run — Day 1',
    amount: 320,
    currency: 'USD',
    category: 'groceries',
    paid_by_family_id: 'fam-b',
    paid_by_user_id: 'user-2',
    split_method: 'equal_by_person',
    date: '2024-07-06',
    created_at: '2024-07-06T18:00:00Z',
    updated_at: '2024-07-06T18:00:00Z',
    expense_splits: [
      { id: 's4', expense_id: 'exp-2', trip_id: 'demo-trip-1', family_id: 'fam-a', share_amount: 96, created_at: '2024-07-06T18:00:00Z' },
      { id: 's5', expense_id: 'exp-2', trip_id: 'demo-trip-1', family_id: 'fam-b', share_amount: 128, created_at: '2024-07-06T18:00:00Z' },
      { id: 's6', expense_id: 'exp-2', trip_id: 'demo-trip-1', family_id: 'fam-c', share_amount: 96, created_at: '2024-07-06T18:00:00Z' },
    ],
  },
  {
    id: 'exp-3',
    trip_id: 'demo-trip-1',
    title: '⛵ Boat Rental',
    amount: 450,
    currency: 'USD',
    category: 'activity',
    paid_by_family_id: 'fam-c',
    paid_by_user_id: 'user-3',
    split_method: 'equal_by_family',
    date: '2024-07-08',
    created_at: '2024-07-08T10:00:00Z',
    updated_at: '2024-07-08T10:00:00Z',
    expense_splits: [
      { id: 's7', expense_id: 'exp-3', trip_id: 'demo-trip-1', family_id: 'fam-a', share_amount: 150, created_at: '2024-07-08T10:00:00Z' },
      { id: 's8', expense_id: 'exp-3', trip_id: 'demo-trip-1', family_id: 'fam-b', share_amount: 150, created_at: '2024-07-08T10:00:00Z' },
      { id: 's9', expense_id: 'exp-3', trip_id: 'demo-trip-1', family_id: 'fam-c', share_amount: 150, created_at: '2024-07-08T10:00:00Z' },
    ],
  },
  {
    id: 'exp-4',
    trip_id: 'demo-trip-1',
    title: '🍕 Pizza Night',
    amount: 185,
    currency: 'USD',
    category: 'restaurant',
    paid_by_family_id: 'fam-a',
    paid_by_user_id: DEMO_USER_ID,
    split_method: 'equal_by_person',
    date: '2024-07-09',
    created_at: '2024-07-09T20:00:00Z',
    updated_at: '2024-07-09T20:00:00Z',
    expense_splits: [
      { id: 's10', expense_id: 'exp-4', trip_id: 'demo-trip-1', family_id: 'fam-a', share_amount: 55.5, created_at: '2024-07-09T20:00:00Z' },
      { id: 's11', expense_id: 'exp-4', trip_id: 'demo-trip-1', family_id: 'fam-b', share_amount: 74, created_at: '2024-07-09T20:00:00Z' },
      { id: 's12', expense_id: 'exp-4', trip_id: 'demo-trip-1', family_id: 'fam-c', share_amount: 55.5, created_at: '2024-07-09T20:00:00Z' },
    ],
  },
  {
    id: 'exp-5',
    trip_id: 'demo-trip-1',
    title: '⛽ Gas Fill-up',
    amount: 95,
    currency: 'USD',
    category: 'gas',
    paid_by_family_id: 'fam-b',
    paid_by_user_id: 'user-2',
    split_method: 'equal_by_family',
    date: '2024-07-10',
    created_at: '2024-07-10T09:00:00Z',
    updated_at: '2024-07-10T09:00:00Z',
    expense_splits: [
      { id: 's13', expense_id: 'exp-5', trip_id: 'demo-trip-1', family_id: 'fam-a', share_amount: 31.67, created_at: '2024-07-10T09:00:00Z' },
      { id: 's14', expense_id: 'exp-5', trip_id: 'demo-trip-1', family_id: 'fam-b', share_amount: 31.67, created_at: '2024-07-10T09:00:00Z' },
      { id: 's15', expense_id: 'exp-5', trip_id: 'demo-trip-1', family_id: 'fam-c', share_amount: 31.66, created_at: '2024-07-10T09:00:00Z' },
    ],
  },
];

export const demoMessages: Message[] = [
  { id: 'msg-1', trip_id: 'demo-trip-1', user_id: 'user-2', family_id: 'fam-b', content: 'Just arrived! The house is amazing 🏖️', message_type: 'text', created_at: '2024-07-06T15:30:00Z' },
  { id: 'msg-2', trip_id: 'demo-trip-1', user_id: DEMO_USER_ID, family_id: 'fam-a', content: 'On our way, about 30 mins out!', message_type: 'text', created_at: '2024-07-06T15:45:00Z' },
  { id: 'msg-3', trip_id: 'demo-trip-1', user_id: 'user-3', family_id: 'fam-c', content: 'We brought extra towels and the kayak pump 🚣', message_type: 'text', created_at: '2024-07-06T16:00:00Z' },
  { id: 'msg-4', trip_id: 'demo-trip-1', user_id: 'user-2', family_id: 'fam-b', content: 'Beach walk at sunset tonight? 7pm?', message_type: 'text', created_at: '2024-07-06T17:00:00Z' },
  { id: 'msg-5', trip_id: 'demo-trip-1', user_id: DEMO_USER_ID, family_id: 'fam-a', content: '👍 Sounds perfect!', message_type: 'text', created_at: '2024-07-06T17:05:00Z' },
];

export const demoItinerary: ItineraryItem[] = [
  { id: 'itin-1', trip_id: 'demo-trip-1', title: '🏠 Check-in & Settle In', item_type: 'activity', start_datetime: '2024-07-06T15:00:00Z', location: 'Beach House, 123 Shore Dr', description: 'Arrive, unpack, explore the house', created_by: DEMO_USER_ID, created_at: '2024-05-01T10:00:00Z', updated_at: '2024-05-01T10:00:00Z' },
  { id: 'itin-2', trip_id: 'demo-trip-1', title: '🌅 Sunset Beach Walk', item_type: 'activity', start_datetime: '2024-07-06T19:00:00Z', end_datetime: '2024-07-06T20:30:00Z', location: 'Main Beach Access', description: 'Evening stroll on the beach', created_by: DEMO_USER_ID, created_at: '2024-05-01T10:00:00Z', updated_at: '2024-05-01T10:00:00Z' },
  { id: 'itin-3', trip_id: 'demo-trip-1', title: '⛵ Boat Tour', item_type: 'activity', start_datetime: '2024-07-08T09:00:00Z', end_datetime: '2024-07-08T13:00:00Z', location: 'Marina Dock B', description: 'Morning boat rental, bring sunscreen!', cost_estimate: 450, created_by: DEMO_USER_ID, created_at: '2024-05-01T10:00:00Z', updated_at: '2024-05-01T10:00:00Z' },
  { id: 'itin-4', trip_id: 'demo-trip-1', title: '🎣 Fishing Trip (Adults)', item_type: 'activity', start_datetime: '2024-07-09T06:00:00Z', end_datetime: '2024-07-09T10:00:00Z', location: 'Pier 7', description: 'Early morning fishing, adults only', created_by: 'user-3', created_at: '2024-05-01T10:00:00Z', updated_at: '2024-05-01T10:00:00Z' },
  { id: 'itin-5', trip_id: 'demo-trip-1', title: '🍕 Pizza & Movie Night', item_type: 'activity', start_datetime: '2024-07-09T19:00:00Z', location: 'Beach House Living Room', description: 'Order pizza, watch a movie together', created_by: 'user-2', created_at: '2024-05-01T10:00:00Z', updated_at: '2024-05-01T10:00:00Z' },
];

export const demoGroceries: GroceryItem[] = [
  { id: 'groc-1', trip_id: 'demo-trip-1', name: 'Sunscreen SPF 50', quantity: '4', assigned_family_id: 'fam-a', is_purchased: true, added_by: DEMO_USER_ID, created_at: '2024-06-01T10:00:00Z', updated_at: '2024-06-01T10:00:00Z' },
  { id: 'groc-2', trip_id: 'demo-trip-1', name: 'Water (24-pack)', quantity: '3', assigned_family_id: 'fam-b', is_purchased: true, added_by: 'user-2', created_at: '2024-06-01T10:00:00Z', updated_at: '2024-06-01T10:00:00Z' },
  { id: 'groc-3', trip_id: 'demo-trip-1', name: 'Charcoal & Lighter', quantity: '1', assigned_family_id: 'fam-c', is_purchased: false, added_by: 'user-3', created_at: '2024-06-01T10:00:00Z', updated_at: '2024-06-01T10:00:00Z' },
  { id: 'groc-4', trip_id: 'demo-trip-1', name: 'Chips & Snacks', quantity: '2', is_purchased: false, added_by: DEMO_USER_ID, created_at: '2024-06-01T10:00:00Z', updated_at: '2024-06-01T10:00:00Z' },
  { id: 'groc-5', trip_id: 'demo-trip-1', name: 'Breakfast items', quantity: '1', assigned_family_id: 'fam-a', is_purchased: false, added_by: DEMO_USER_ID, created_at: '2024-06-01T10:00:00Z', updated_at: '2024-06-01T10:00:00Z' },
];

export const demoPacking: PackingItem[] = [
  { id: 'pack-1', trip_id: 'demo-trip-1', name: 'Beach Chairs (x6)', assigned_family_id: 'fam-a', category: 'beach', quantity: 6, status: 'packed', is_essential: true, added_by: DEMO_USER_ID, created_at: '2024-06-01T10:00:00Z', updated_at: '2024-06-01T10:00:00Z' },
  { id: 'pack-2', trip_id: 'demo-trip-1', name: 'Beach Umbrella', assigned_family_id: 'fam-b', category: 'beach', quantity: 2, status: 'packed', is_essential: false, added_by: 'user-2', created_at: '2024-06-01T10:00:00Z', updated_at: '2024-06-01T10:00:00Z' },
  { id: 'pack-3', trip_id: 'demo-trip-1', name: 'First Aid Kit', assigned_family_id: 'fam-c', category: 'medicine', quantity: 1, status: 'packed', is_essential: true, added_by: 'user-3', created_at: '2024-06-01T10:00:00Z', updated_at: '2024-06-01T10:00:00Z' },
  { id: 'pack-4', trip_id: 'demo-trip-1', name: 'Board Games', assigned_family_id: 'fam-a', category: 'games', quantity: 3, status: 'packed', is_essential: false, added_by: DEMO_USER_ID, created_at: '2024-06-01T10:00:00Z', updated_at: '2024-06-01T10:00:00Z' },
  { id: 'pack-5', trip_id: 'demo-trip-1', name: 'Portable Speaker', assigned_family_id: 'fam-b', category: 'electronics', quantity: 1, status: 'unpacked', is_essential: false, added_by: DEMO_USER_ID, created_at: '2024-06-01T10:00:00Z', updated_at: '2024-06-01T10:00:00:00Z' },
];

export const demoCars: Car[] = [
  { id: 'car-1', trip_id: 'demo-trip-1', name: 'Blue SUV', driver_user_id: DEMO_USER_ID, driver_family_id: 'fam-a', total_seats: 7, created_by: DEMO_USER_ID, created_at: '2024-06-01T10:00:00Z', updated_at: '2024-06-01T10:00:00Z' },
  { id: 'car-2', trip_id: 'demo-trip-1', name: 'Silver Minivan', driver_user_id: 'user-2', driver_family_id: 'fam-b', total_seats: 8, created_by: 'user-2', created_at: '2024-06-01T10:00:00Z', updated_at: '2024-06-01T10:00:00Z' },
];

export const demoPolls: Poll[] = [
  {
    id: 'poll-1',
    trip_id: 'demo-trip-1',
    created_by: DEMO_USER_ID,
    question: 'Where should we eat dinner on Wednesday?',
    allow_multiple: false,
    status: 'active',
    created_at: '2024-07-07T12:00:00Z',
    updated_at: '2024-07-07T12:00:00Z',
    options: [
      { id: 'opt-1', poll_id: 'poll-1', trip_id: 'demo-trip-1', option_text: '🦞 Seafood restaurant', votes_count: 0, created_at: '2024-07-07T12:00:00Z' },
      { id: 'opt-2', poll_id: 'poll-1', trip_id: 'demo-trip-1', option_text: '🍔 Beachside burger bar', votes_count: 0, created_at: '2024-07-07T12:00:00Z' },
      { id: 'opt-3', poll_id: 'poll-1', trip_id: 'demo-trip-1', option_text: '🍕 Pizza delivery at the house', votes_count: 0, created_at: '2024-07-07T12:00:00Z' },
    ],
  },
];

export const demoAnnouncements: Announcement[] = [
  {
    id: 'ann-1',
    trip_id: 'demo-trip-1',
    created_by: DEMO_USER_ID,
    title: '🌊 Beach Rules',
    content: 'Beach access at the end of the street. No glass on the beach. Lifeguard on duty until 6pm.',
    priority: 'normal',
    is_archived: false,
    created_at: '2024-07-06T16:00:00Z',
    updated_at: '2024-07-06T16:00:00Z',
  },
  {
    id: 'ann-2',
    trip_id: 'demo-trip-1',
    created_by: DEMO_USER_ID,
    title: '⏰ Boat Trip Tomorrow',
    content: 'Boat leaves at 9am SHARP from Marina Dock B. Bring sunscreen, hats, and water shoes. No late arrivals!',
    priority: 'high',
    is_archived: false,
    created_at: '2024-07-07T20:00:00Z',
    updated_at: '2024-07-07T20:00:00Z',
  },
];
