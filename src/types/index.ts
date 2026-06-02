// ─── Enums ──────────────────────────────────────────────────────────────────

export type SplitMethod =
  | 'equal_by_family'
  | 'equal_by_person'
  | 'adults_only'
  | 'children_count_half'
  | 'custom_percentage'
  | 'custom_family_amounts'
  | 'selected_families_only';

export type ExpenseCategory =
  | 'lodging'
  | 'groceries'
  | 'gas'
  | 'restaurant'
  | 'activity'
  | 'tickets'
  | 'parking'
  | 'tolls'
  | 'supplies'
  | 'other';

export type TripRole = 'trip_organizer' | 'family_admin' | 'member' | 'viewer';

export type PaymentStatus = 'pending' | 'paid' | 'confirmed' | 'disputed';

export type MediaType = 'photo' | 'video' | 'document' | 'audio';

export type PollStatus = 'active' | 'closed';

export type AnnouncementPriority = 'low' | 'normal' | 'high' | 'urgent';

export type PackingStatus = 'unpacked' | 'packed' | 'left_behind';

export type ItineraryType = 'activity' | 'meal' | 'transport' | 'accommodation' | 'free_time' | 'other';

// ─── Core Entities ───────────────────────────────────────────────────────────

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  phone?: string;
  created_at: string;
  updated_at: string;
}

export interface Trip {
  id: string;
  name: string;
  destination: string;
  description?: string;
  start_date: string;
  end_date: string;
  currency: string;
  cover_image_url?: string;
  created_by: string;
  is_active: boolean;
  invite_code: string;
  created_at: string;
  updated_at: string;
}

export interface TripMember {
  id: string;
  trip_id: string;
  user_id: string;
  family_id?: string;
  role: TripRole;
  joined_at: string;
  // Joined data
  profile?: Profile;
  family?: Family;
}

export interface Family {
  id: string;
  trip_id: string;
  name: string;
  adults_count: number;
  children_count: number;
  notes?: string;
  color?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface FamilyMember {
  id: string;
  family_id: string;
  trip_id: string;
  user_id: string;
  is_admin: boolean;
  push_talk_enabled: boolean;
  created_at: string;
  // Joined data
  profile?: Profile;
}

// ─── Expenses ────────────────────────────────────────────────────────────────

export interface Expense {
  id: string;
  trip_id: string;
  title: string;
  amount: number;
  currency: string;
  category: ExpenseCategory;
  paid_by_family_id: string;
  paid_by_user_id: string;
  split_method: SplitMethod;
  date: string;
  notes?: string;
  receipt_url?: string;
  created_at: string;
  updated_at: string;
  // Joined data
  paid_by_family?: Family;
  expense_splits?: ExpenseSplit[];
}

export interface ExpenseSplit {
  id: string;
  expense_id: string;
  trip_id: string;
  family_id: string;
  share_amount: number;
  percentage?: number;
  created_at: string;
  // Joined data
  family?: Family;
}

export interface Settlement {
  id: string;
  trip_id: string;
  from_family_id: string;
  to_family_id: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  notes?: string;
  confirmed_at?: string;
  created_at: string;
  updated_at: string;
  // Joined data
  from_family?: Family;
  to_family?: Family;
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export interface Message {
  id: string;
  trip_id: string;
  user_id: string;
  family_id?: string;
  content: string;
  message_type: 'text' | 'image' | 'audio' | 'system';
  media_url?: string;
  mime_type?: string;
  duration_seconds?: number;
  is_push_talk?: boolean;
  created_at: string;
  // Joined data
  profile?: Profile;
  family?: Family;
}

// ─── Media ────────────────────────────────────────────────────────────────────

export interface TripMedia {
  id: string;
  trip_id: string;
  uploaded_by: string;
  family_id?: string;
  media_type: MediaType;
  url: string;
  thumbnail_url?: string;
  caption?: string;
  file_size?: number;
  mime_type?: string;
  taken_at?: string;
  created_at: string;
  updated_at: string;
  // Joined data
  uploader?: Profile;
  family?: Family;
}

// ─── Itinerary ────────────────────────────────────────────────────────────────

export interface ItineraryItem {
  id: string;
  trip_id: string;
  title: string;
  description?: string;
  location?: string;
  item_type: ItineraryType;
  start_datetime: string;
  end_datetime?: string;
  cost_estimate?: number;
  booking_reference?: string;
  notes?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Joined data
  attendance?: ItineraryAttendance[];
}

export interface ItineraryAttendance {
  id: string;
  itinerary_item_id: string;
  trip_id: string;
  family_id: string;
  is_attending: boolean;
  notes?: string;
  created_at: string;
  // Joined data
  family?: Family;
}

// ─── Lists ────────────────────────────────────────────────────────────────────

export interface GroceryItem {
  id: string;
  trip_id: string;
  name: string;
  quantity?: string;
  category?: string;
  assigned_family_id?: string;
  is_purchased: boolean;
  purchased_by?: string;
  purchased_at?: string;
  notes?: string;
  added_by: string;
  created_at: string;
  updated_at: string;
  // Joined data
  assigned_family?: Family;
}

export interface PackingItem {
  id: string;
  trip_id: string;
  name: string;
  category?: string;
  quantity?: number;
  assigned_family_id?: string;
  status: PackingStatus;
  notes?: string;
  is_essential: boolean;
  added_by: string;
  created_at: string;
  updated_at: string;
  // Joined data
  assigned_family?: Family;
}

// ─── Cars ─────────────────────────────────────────────────────────────────────

export interface Car {
  id: string;
  trip_id: string;
  name: string;
  driver_family_id: string;
  driver_user_id?: string;
  total_seats: number;
  notes?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Joined data
  driver_family?: Family;
  passengers?: CarPassenger[];
}

export interface CarPassenger {
  id: string;
  car_id: string;
  trip_id: string;
  family_id: string;
  user_id?: string;
  passenger_name: string;
  created_at: string;
  // Joined data
  family?: Family;
}

// ─── Polls ────────────────────────────────────────────────────────────────────

export interface Poll {
  id: string;
  trip_id: string;
  question: string;
  description?: string;
  status: PollStatus;
  deadline?: string;
  allow_multiple: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Joined data
  options?: PollOption[];
  creator?: Profile;
}

export interface PollOption {
  id: string;
  poll_id: string;
  trip_id: string;
  option_text: string;
  votes_count: number;
  created_at: string;
  // Joined data
  votes?: PollVote[];
}

export interface PollVote {
  id: string;
  poll_id: string;
  poll_option_id: string;
  trip_id: string;
  user_id: string;
  family_id?: string;
  created_at: string;
  // Joined data
  voter?: Profile;
}

// ─── Receipt ─────────────────────────────────────────────────────────────────

export interface ReceiptScan {
  id: string;
  trip_id: string;
  scanned_by: string;
  image_url: string;
  raw_text?: string;
  parsed_amount?: number;
  parsed_merchant?: string;
  parsed_date?: string;
  parsed_items?: ReceiptLineItem[];
  expense_id?: string;
  created_at: string;
}

export interface ReceiptLineItem {
  description: string;
  amount: number;
  quantity?: number;
}

// ─── Emergency ────────────────────────────────────────────────────────────────

export interface EmergencyInfo {
  id: string;
  trip_id: string;
  family_id?: string;
  type: 'medical' | 'contact' | 'insurance' | 'document' | 'other';
  title: string;
  content: string;
  is_shared: boolean;
  added_by: string;
  created_at: string;
  updated_at: string;
  // Joined data
  family?: Family;
}

// ─── Announcements ────────────────────────────────────────────────────────────

export interface Announcement {
  id: string;
  trip_id: string;
  title: string;
  content: string;
  priority: AnnouncementPriority;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Joined data
  creator?: Profile;
  reads?: AnnouncementRead[];
}

export interface AnnouncementRead {
  id: string;
  announcement_id: string;
  user_id: string;
  read_at: string;
}

// ─── Notifications ────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  user_id: string;
  trip_id?: string;
  type: 'expense_added' | 'settlement_request' | 'payment_confirmed' | 'message' | 'announcement' | 'poll' | 'push_talk' | 'other';
  title: string;
  body: string;
  data?: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

// ─── Offline ──────────────────────────────────────────────────────────────────

export interface OfflineQueueItem {
  id: string;
  operation: 'create' | 'update' | 'delete';
  table: string;
  payload: Record<string, unknown>;
  created_at: string;
  retries: number;
}

// ─── Calculation Helpers ──────────────────────────────────────────────────────

export interface FamilySplitShare {
  familyId: string;
  familyName: string;
  shareAmount: number;
  percentage?: number;
}

export interface FamilyBalance {
  familyId: string;
  familyName: string;
  totalPaid: number;
  totalOwed: number;
  balance: number; // positive = owed money, negative = owes money
}

export interface SettlementCalculation {
  fromFamilyId: string;
  fromFamilyName: string;
  toFamilyId: string;
  toFamilyName: string;
  amount: number;
}

export interface FairnessMetrics {
  paymentShareByFamily: Array<{
    familyId: string;
    familyName: string;
    paid: number;
    percentage: number;
  }>;
  insights: string[];
}

// ─── Live Location ────────────────────────────────────────────────────────────

export interface LiveLocation {
  userId: string;
  familyId?: string;
  familyName?: string;
  userName?: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  heading?: number;
  timestamp: string;
  isLive: boolean; // true = currently broadcasting
}

// ─── Service Return Type ──────────────────────────────────────────────────────

export interface ServiceResult<T> {
  data: T | null;
  error: string | null;
}

// ─── Navigation Params ────────────────────────────────────────────────────────

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  SignUp: undefined;
};

export type MainStackParamList = {
  Tabs: undefined;
  TripStack: { tripId: string };
  Families: { tripId: string };
  JoinFamily: { tripId: string };
  AddEditFamily: { tripId: string; familyId?: string };
  FamilyDetail: { tripId: string; familyId: string };
  AddEditExpense: { tripId: string; expenseId?: string };
  Balances: { tripId: string };
  Settlements: { tripId: string };
  PaymentTracking: { tripId: string };
  ReceiptScanner: { tripId: string };
  MediaDetail: { tripId: string; mediaId: string };
  Itinerary: { tripId: string };
  AddEditItineraryItem: { tripId: string; itemId?: string };
  DailyPlan: { tripId: string; date: string };
  GroceryList: { tripId: string };
  PackingList: { tripId: string };
  CarPlanning: { tripId: string };
  AddEditCar: { tripId: string; carId?: string };
  Polls: { tripId: string };
  CreatePoll: { tripId: string };
  PollDetail: { tripId: string; pollId: string };
  EmergencyInfo: { tripId: string };
  Fairness: { tripId: string };
  Announcements: { tripId: string };
  TripSettings: { tripId: string };
  LiveLocation: { tripId: string };
  CreateTrip: undefined;
  Notifications: undefined;
};

export type TabParamList = {
  TripsTab: undefined;
  ProfileTab: undefined;
};

export type TripTabParamList = {
  Dashboard: { tripId: string };
  Expenses: { tripId: string };
  Chat: { tripId: string };
  Album: { tripId: string };
  More: { tripId: string };
};
