# TripCrew

**Plan together. Pay fairly. Remember everything.**

TripCrew is a vacation coordination app for multiple families traveling together. It handles shared expense tracking with smart split logic, real-time group chat, photo albums, itinerary planning, grocery/packing lists, car planning, polls, and emergency info — all in one app.

---

## Features

- **Smart Expense Splitting** — 7 split methods: equal by family, equal by person, adults only, children-count-half, custom percentages, custom amounts, selected families only
- **Balance & Settlement Calculation** — Minimum-transactions algorithm shows exactly who pays whom
- **Real-time Group Chat** — Powered by Supabase Realtime
- **Trip Album** — Shared photo/video gallery
- **Itinerary** — Day-by-day schedule grouped by date
- **Grocery & Packing Lists** — Assignable to families, checkable
- **Car Planning** — Coordinate who rides in which car
- **Polls** — Group decision making with live vote counts
- **Emergency Info** — Medical, contacts, insurance, documents
- **Announcements** — Trip-wide broadcast messages
- **Fairness Dashboard** — Visual breakdown of spending per family
- **Receipt Scanner** — Gemini-backed receipt OCR with manual review before saving
- **Offline Support** — Queue operations when offline
- **Invite Codes** — 8-character codes to join trips

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Expo (managed workflow) |
| UI | React Native |
| Language | TypeScript |
| Navigation | React Navigation v6 |
| Backend | Supabase (PostgreSQL + Auth + Realtime + Storage) |
| State | React Context |
| Local storage | AsyncStorage |
| Media | expo-image-picker, expo-camera |

---

## Installation

### Prerequisites

- Node.js 20+
- Expo CLI (`npm install -g expo`)
- Supabase account (free tier works)

### 1. Clone & Install

```bash
cd /Users/muhemmet/TripCrew
npm install
```

### 2. Supabase Setup

1. Go to [supabase.com](https://supabase.com) and create a new project
2. In the SQL Editor, run `supabase/schema.sql` (creates all tables, indexes, triggers)
3. Then run `supabase/rls.sql` (enables Row Level Security with all policies)
4. In Storage, create a bucket named `trip-media` (set to public)
5. Enable Realtime for the `messages` table: Database > Replication > toggle `messages`
6. Deploy the receipt scan Edge Function and set your Gemini secret:

```bash
supabase functions deploy scan-receipt
supabase secrets set GEMINI_API_KEY=your_gemini_api_key
```

You can optionally set `GEMINI_MODEL`; it defaults to `gemini-3.5-flash`.

### 3. Environment Variables

Copy the example env file:

```bash
cp .env.example .env
```

Fill in your Supabase credentials from your project settings:

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 4. Run the App

```bash
npx expo start
```

Scan the QR code with Expo Go (iOS/Android) or press `i` for iOS simulator / `a` for Android emulator.

---

## Project Structure

```
/TripCrew
├── App.tsx                    # Root: wraps AuthProvider + TripProvider
├── app.json                   # Expo config
├── .env.example               # Environment variables template
├── /src
│   ├── /components            # Reusable UI (AppButton, AppCard, etc.)
│   ├── /constants             # theme.ts (colors, spacing, fonts)
│   ├── /contexts              # AuthContext, TripContext
│   ├── /hooks                 # (future: useTrip, useExpenses, etc.)
│   ├── /lib                   # supabaseClient.ts
│   ├── /navigation            # AppNavigator (Auth + Main + Trip stacks)
│   ├── /screens               # All screens by feature
│   ├── /services              # All Supabase service files
│   ├── /types                 # index.ts with all TypeScript interfaces/enums
│   └── /utils                 # calculations.ts (split/balance/settlement)
└── /supabase
    ├── schema.sql             # All DDL (tables, indexes, triggers)
    └── rls.sql                # Row Level Security policies
```

---

## Expense Split Methods

| Method | Description |
|--------|-------------|
| `equal_by_family` | Divide equally among all families |
| `equal_by_person` | Divide by total headcount (adults + children) |
| `adults_only` | Divide by adult count only |
| `children_count_half` | Adults = 1 weight, children = 0.5 weight |
| `custom_percentage` | Specify % per family (must sum to 100) |
| `custom_family_amounts` | Specify fixed amount per family |
| `selected_families_only` | Only charge selected families equally |

### Testing Calculations

The calculation logic is pure TypeScript in `src/utils/calculations.ts`. You can test it directly:

```typescript
import { calculateExpenseSplits, calculateFamilyBalances, calculateSettlements } from './src/utils/calculations';

// Example: $120 split equally by family
const families = [
  { id: 'f1', name: 'Smith', adults_count: 2, children_count: 1, ... },
  { id: 'f2', name: 'Jones', adults_count: 2, children_count: 0, ... },
];
const splits = calculateExpenseSplits(120, families, 'equal_by_family');
// → [{ familyId: 'f1', shareAmount: 60 }, { familyId: 'f2', shareAmount: 60 }]

// Calculate balances
const balances = calculateFamilyBalances(expenses, families);
// → [{ familyId, totalPaid, totalOwed, balance }, ...]

// Minimum-transactions settlements
const settlements = calculateSettlements(balances);
// → [{ fromFamilyId, toFamilyId, amount }, ...]
```

---

## TODOs for Production

- [ ] **Receipt OCR Hardening** — Add confidence scoring, better item normalization, and receipt-to-expense attachment
- [ ] **Push Notifications** — Implement with Expo Notifications + Supabase Edge Functions
- [ ] **Weather Widget** — Add OpenWeatherMap API integration in DailyPlanScreen
- [ ] **Currency Conversion** — Add real-time exchange rates (e.g. fixer.io)
- [ ] **EAS Build** — Configure `eas.json` for production builds
- [ ] **Deep Links** — Add invite link deep linking support
- [ ] **Analytics** — Add Expo Analytics or Mixpanel
- [ ] **Offline Sync** — Wire `offlineService.processQueue()` to network state changes

---

## Supabase Storage

Create a `trip-media` bucket in your Supabase project with public access enabled. The app uploads photos and receipt images to this bucket.

```sql
-- Or via Supabase CLI:
supabase storage create trip-media --public
```

Add storage RLS policies to allow trip members to upload/view:

```sql
CREATE POLICY "Trip members can upload media"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'trip-media' AND auth.uid() IS NOT NULL);

CREATE POLICY "Anyone can view trip media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'trip-media');
```

---

## Testing

TripCrew uses **Jest + ts-jest** for unit and service tests.

### Install test dependencies

```bash
npm install --save-dev jest @types/jest ts-jest
```

### Run tests

```bash
# Run all tests
npm test

# Run with watch mode
npm run test:watch

# Run with coverage report
npm run test:coverage
```

### Test structure

```
src/__tests__/
  utils/
    calculations.test.ts   ← 31 test cases for core algorithms
  services/
    expenseService.test.ts    ← expense CRUD contract tests
    settlementService.test.ts ← payment status flow tests
```

### Algorithms verified

All core financial algorithms are verified against a Python reference implementation:

| Algorithm | Tests | Coverage |
|-----------|-------|----------|
| `calculateExpenseSplits` | 15 cases | All 7 split methods + rounding invariant |
| `calculateFamilyBalances` | 5 cases | Multi-payer, multi-expense scenarios |
| `calculateSettlements` | 7 cases | Min-transactions, edge cases, floating point |
| `calculateFairnessMetrics` | 4 cases | Percentage shares, insights |

### Feature Specification

See [`SPEC.md`](./SPEC.md) for the complete feature specification that tests are derived from.

---

## License

MIT
