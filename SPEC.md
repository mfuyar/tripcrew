# TripCrew — Feature Specification

> "Plan together. Pay fairly. Remember everything."

This document defines the exact expected behavior for every feature in TripCrew. Tests in `src/__tests__/` are derived directly from these specs.

---

## 1. Authentication

### 1.1 Sign Up
- **Input:** full_name, email, password (min 8 chars)
- **Output:** User created, session started, navigate to Trips List
- **Error cases:**
  - Email already in use → "Email already registered"
  - Weak password → "Password must be at least 8 characters"
  - Network error → "Connection failed, please try again"

### 1.2 Login
- **Input:** email, password
- **Output:** Session started, navigate to Trips List
- **Error cases:**
  - Wrong credentials → "Invalid email or password"
  - Unverified email → "Please verify your email first"

### 1.3 Logout
- Clears session, navigates to Login screen
- Clears local cache

---

## 2. Trips

### 2.1 Create Trip
- **Required fields:** name, destination, start_date, end_date, currency
- **Optional:** description, cover_image_url
- **Post-create:** Creator is automatically added as `trip_organizer`
- **Invite code:** Auto-generated UUID prefix (first 8 chars)

### 2.2 Join Trip
- User enters invite code
- System validates code, adds user as `member` role
- User must then join or create a family within the trip

### 2.3 Trip List
- Shows only trips user belongs to
- Sorted by start_date descending
- Shows: name, destination, dates, family count, member count

---

## 3. Families

### 3.1 Create Family
- **Required:** family_name, adults_count (≥ 1)
- **Optional:** children_count (default 0), notes
- A user can only belong to one family per trip
- Trip organizer can create families on behalf of others

### 3.2 Family Members
- Each family member has: name, age_group (adult/child)
- Linked to user_id if the person uses the app (nullable for guests)

---

## 4. Expense Splitting

### 4.1 Split Methods

| Method | Description | When to use |
|--------|-------------|-------------|
| `equal_by_family` | Divide equally regardless of size | Hotel rooms per family |
| `equal_by_person` | Divide by total headcount | Restaurant meals |
| `adults_only` | Only adults share the cost | Wine/alcohol |
| `children_count_half` | Adults=1 weight, children=0.5 | Theme park entry |
| `custom_percentage` | User sets % per family | Custom agreements |
| `custom_family_amounts` | User sets exact $ per family | Known pre-agreements |
| `selected_families_only` | Only chosen families split | Activity not everyone joined |

### 4.2 Rounding Rule
- All shares rounded to 2 decimal places
- Rounding difference (max ±$0.01) assigned to first family
- **Invariant:** Sum of all shares MUST equal original expense amount

### 4.3 Examples

**$300 restaurant bill, 3 families (2+1=3, 2, 4+2=6 people)**

| Method | Family A | Family B | Family C |
|--------|----------|----------|----------|
| equal_by_family | $100.00 | $100.00 | $100.00 |
| equal_by_person (11 ppl) | $81.82 | $54.55 | $163.64 |
| adults_only (8 adults) | $75.00 | $75.00 | $150.00 |
| children_count_half (9.5 weight) | $78.95 | $63.16 | $157.89 |

---

## 5. Balance Calculation

**Rule:** `balance = totalPaid - totalOwed`

- Positive balance → family is a **creditor** (should receive money)
- Negative balance → family is a **debtor** (owes money)
- Zero → settled

**Conservation law:** Sum of all family balances MUST equal zero.

---

## 6. Settlement Optimization

**Algorithm:** Minimum transactions greedy algorithm

**Input:** Array of FamilyBalance objects
**Output:** Minimum set of payment transactions

**Example:**
```
Input:
  Uyar Family:   +$259  (creditor)
  Yilmaz Family: -$185  (debtor)
  Demir Family:  -$74   (debtor)

Output:
  Yilmaz Family → Uyar Family: $185
  Demir Family  → Uyar Family: $74
```

**Rules:**
- Never generates negative payment amounts
- Total payments out == total payments in
- No family pays more than they owe
- No family receives more than owed to them

---

## 7. Payment Status Flow

```
pending → paid (payer action)
paid    → confirmed (receiver action)
paid    → disputed (receiver action)
disputed → paid (payer re-submits)
```

---

## 8. Real-time Chat

- Messages delivered via Supabase Realtime subscriptions
- Supports text, photo, and audio messages
- Push talk enabled users can receive audio notifications in chat flow
- Only trip members can read/send
- Messages persist in database
- New messages scroll to bottom automatically
- Sender sees own messages on right (blue), others on left (gray)

---

## 9. Shared Album

- Supports: photos, videos
- Tags: memories, receipts, tickets, food, activities
- Only uploader or organizer can delete
- Displayed in reverse-chronological grid
- Full-screen viewer with caption editing

---

## 10. Fairness Dashboard

**Insights generated when:**
- One family paid > 50% of total → warning shown
- A family has $0 paid → noted
- Sum of all expenses > $0

**Tone:** Always friendly, never accusatory.
✅ "Uyar Family covered the most expenses (68% of the total)."
❌ "Uyar Family paid too much."

---

## 11. Offline Support

**Cached offline:**
- Trip info, families, members
- Itinerary items
- Emergency info
- Expense list (read)
- Grocery and packing lists

**Queueable offline:**
- Add expense
- Add grocery item
- Add packing item

**Sync behavior:**
- Queue written to AsyncStorage
- On reconnect: process queue in order
- Failed items: marked `sync_failed`, user notified

---

## 12. Data Integrity Rules

- Expense amount must be > 0
- Expense splits must sum to expense amount (±$0.01 tolerance)
- A family cannot pay themselves in a settlement
- Poll votes: one per user per option (unless multiple_choice enabled)
- Itinerary items: end_datetime must be after start_datetime if provided
- Car seat_count must be ≥ 1
- Family adults_count must be ≥ 1

---

## Test Coverage Targets

| Spec | Module / File | Tests | Status |
|------|--------------|-------|--------|
| §1 Auth | spec-01-auth | 10 cases | ✅ Written |
| §1 Auth | authService | 9 cases | ✅ Written |
| §2 Trips | spec-02-trips | 11 cases | ✅ Written |
| §2 Trips | tripService | 8 cases | ✅ Written |
| §3 Families | familyService | 12 cases | ✅ Written |
| §4 Splits | calculateExpenseSplits | 15 cases | ✅ Written |
| §5 Balances | calculateFamilyBalances | 5 cases | ✅ Written |
| §6 Settlements | calculateSettlements | 7 cases | ✅ Written |
| §6 Settlements | expenseService | 5 cases | ✅ Written |
| §7 Payment Flow | spec-07-payment-flow | 10 cases | ✅ Written |
| §7 Payment Flow | settlementService | 4 cases | ✅ Written |
| §8 Chat | chatService | 13 cases | ✅ Written |
| §9 Album | mediaService | 9 cases | ✅ Written |
| §10 Fairness | spec-10-fairness | 7 cases | ✅ Written |
| §10 Fairness | calculateFairnessMetrics | 4 cases | ✅ Written |
| §11 Offline | offlineService | 14 cases | ✅ Written |
| §11 Offline | groceryService | 7 cases | ✅ Written |
| §12 Integrity | spec-12-integrity + validate.ts | 20 cases | ✅ Written |
