# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Critical: Expo version

Always read https://docs.expo.dev/versions/v56.0.0/ before writing any Expo-specific code. APIs change between versions and the project is pinned to **Expo 56**.

## Commands

```bash
npx expo start          # start dev server (scan QR to run on device)
npx expo start --web    # run in browser (requires react-dom + react-native-web)
npx expo run:ios        # build and run on iOS simulator

npm test                # run full test suite (Jest + ts-jest, node env)
npm test -- --watch     # watch mode
npm test -- --testPathPattern=calculations   # run single file
npm test -- --coverage  # with coverage report
```

Tests live in `src/__tests__/` and must match `**/__tests__/**/*.test.ts(x)`. The test environment is `node` — React Native and Expo modules are stubbed via `src/__mocks__/`.

## Architecture

**Stack:** React Native 0.85 / React 19 / Expo 56 / TypeScript 6 / Supabase JS v2 / React Navigation v7

**Single type source of truth:** `src/types/index.ts` — all entities, enums, nav param lists. Read this first when touching any domain.

**Layer breakdown:**

| Layer | Location | Notes |
|---|---|---|
| Types | `src/types/index.ts` | All shared types live here |
| Pure logic | `src/utils/calculations.ts` | Split, balance, settlement, fairness — no side effects, fully unit-tested |
| DB access | `src/services/*.ts` | One file per domain, all return `ServiceResult<T>` = `{ data, error }` |
| Global state | `src/contexts/AuthContext.tsx`, `TripContext.tsx` | Auth state + current trip/families/members |
| Navigation | `src/navigation/AppNavigator.tsx` | Full tree: RootStack → AuthStack / MainStack → Tabs → TripTabs |
| Screens | `src/screens/<domain>/` | ~50 screens; fetch on `useFocusEffect` or `useEffect` |
| Mock data | `src/lib/mockData.ts` | Demo mode data — all demo IDs are non-UUID strings (fam-a, demo-trip-1, etc.) |

**Demo mode:** `AuthContext` exposes `isDemoMode`. Every screen that calls Supabase must guard with `if (isDemoMode)` and return mock data or update local context state. Forgetting this causes Postgres UUID errors at runtime.

**Service pattern:**
```ts
// All services follow this exact shape
async function doSomething(id: string): Promise<ServiceResult<Entity>> {
  const { data, error } = await supabase.from('table').select('*').eq('id', id).single();
  if (error) return { data: null, error: error.message };
  return { data: data as Entity, error: null };
}
```

**Test pattern (mock Supabase before imports):**
```ts
const mockSingle = jest.fn();
const mockFrom = jest.fn(() => ({ select: ..., eq: mockEq.mockReturnThis(), single: mockSingle }));
jest.mock('../../lib/supabaseClient', () => ({ supabase: { from: mockFrom } }));
import { someService } from '../../services/someService';
// terminal calls (.single(), .order()) use mockResolvedValueOnce per test
```

**Navigation structure:**
```
RootStack
├── Auth  →  Login / SignUp
└── Main
    ├── Tabs  →  TripsTab (TripsListScreen) / ProfileTab
    └── TripStack  →  TripTabs (Dashboard / Expenses / Chat / Album / More)
        └── Modal screens pushed onto MainStack (Families, AddEditExpense, Balances, ...)
```

**Supabase:** Project URL and anon key in `.env` (gitignored). Schema in `supabase/schema.sql`, RLS in `supabase/rls.sql` — apply both in Supabase SQL Editor when setting up a new project. Realtime enabled on `messages` and `notifications` tables.

**Expense split invariant:** Sum of all `FamilySplitShare.shareAmount` must equal the original expense amount (±$0.01). Rounding difference is assigned to the first family. This is tested in `calculations.test.ts` and enforced by `adjustRounding()` in `calculations.ts`.

**OCR (ReceiptScannerScreen):** Mocked in MVP. Wire up a real OCR API before shipping.
