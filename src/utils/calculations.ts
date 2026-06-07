import {
  Family,
  FamilyBalance,
  FamilySplitShare,
  PersonBalance,
  PersonSettlementCalculation,
  SettlementCalculation,
  FairnessMetrics,
  SplitMethod,
  Expense,
  TripMember,
} from '../types';
import { isSelfOnlyExpense } from './expenseVisibility';

// ─── Split Calculation Options ────────────────────────────────────────────────

export interface SplitOptions {
  percentages?: Record<string, number>; // familyId -> percentage (0-100)
  amounts?: Record<string, number>;      // familyId -> fixed amount
  selectedFamilyIds?: string[];
}

const SETTLEMENT_EPSILON = 0.021;

// ─── calculateExpenseSplits ────────────────────────────────────────────────────

/**
 * Given an expense amount, a list of families, and a split method,
 * returns the per-family share breakdown.
 */
export function calculateExpenseSplits(
  amount: number,
  families: Family[],
  splitMethod: SplitMethod,
  options: SplitOptions = {}
): FamilySplitShare[] {
  if (!families.length) return [];

  switch (splitMethod) {
    case 'equal_by_family': {
      const share = round2(amount / families.length);
      const shares = families.map((f, i) => ({
        familyId: f.id,
        familyName: f.name,
        shareAmount: share,
      }));
      return adjustRounding(shares, amount);
    }

    case 'equal_by_person': {
      const totalPeople = families.reduce(
        (sum, f) => sum + f.adults_count + f.children_count,
        0
      );
      if (totalPeople === 0) return equalByFamily(amount, families);
      const perPerson = amount / totalPeople;
      const shares = families.map((f) => ({
        familyId: f.id,
        familyName: f.name,
        shareAmount: round2(perPerson * (f.adults_count + f.children_count)),
      }));
      return adjustRounding(shares, amount);
    }

    case 'adults_only': {
      const totalAdults = families.reduce((sum, f) => sum + f.adults_count, 0);
      if (totalAdults === 0) return equalByFamily(amount, families);
      const perAdult = amount / totalAdults;
      const shares = families.map((f) => ({
        familyId: f.id,
        familyName: f.name,
        shareAmount: round2(perAdult * f.adults_count),
      }));
      return adjustRounding(shares, amount);
    }

    case 'children_count_half': {
      // Adults weight = 1, children weight = 0.5
      const totalWeight = families.reduce(
        (sum, f) => sum + f.adults_count + f.children_count * 0.5,
        0
      );
      if (totalWeight === 0) return equalByFamily(amount, families);
      const perWeight = amount / totalWeight;
      const shares = families.map((f) => ({
        familyId: f.id,
        familyName: f.name,
        shareAmount: round2(
          perWeight * (f.adults_count + f.children_count * 0.5)
        ),
      }));
      return adjustRounding(shares, amount);
    }

    case 'custom_percentage': {
      const percentages = options.percentages ?? {};
      const shares = families.map((f) => ({
        familyId: f.id,
        familyName: f.name,
        shareAmount: round2(amount * ((percentages[f.id] ?? 0) / 100)),
        percentage: percentages[f.id] ?? 0,
      }));
      return adjustRounding(shares, amount);
    }

    case 'custom_family_amounts': {
      const amounts = options.amounts ?? {};
      return families.map((f) => ({
        familyId: f.id,
        familyName: f.name,
        shareAmount: round2(amounts[f.id] ?? 0),
      }));
    }

    case 'selected_families_only': {
      const selectedIds = options.selectedFamilyIds ?? [];
      const selected = families.filter((f) => selectedIds.includes(f.id));
      if (!selected.length) return equalByFamily(amount, families);
      const share = round2(amount / selected.length);
      const selectedShares = selected.map((f) => ({
        familyId: f.id,
        familyName: f.name,
        shareAmount: share,
      }));
      const adjusted = adjustRounding(selectedShares, amount);
      // Non-selected families get 0
      const excluded = families
        .filter((f) => !selectedIds.includes(f.id))
        .map((f) => ({ familyId: f.id, familyName: f.name, shareAmount: 0 }));
      return [...adjusted, ...excluded];
    }

    default:
      return equalByFamily(amount, families);
  }
}

// ─── calculateFamilyBalances ──────────────────────────────────────────────────

/**
 * Given all trip expenses (with their splits loaded), returns per-family
 * totals of what they paid vs. what they owed.
 */
export function calculateFamilyBalances(
  expenses: Expense[],
  families: Family[]
): FamilyBalance[] {
  const paid: Record<string, number> = {};
  const owed: Record<string, number> = {};

  for (const family of families) {
    paid[family.id] = 0;
    owed[family.id] = 0;
  }

  for (const expense of expenses) {
    if (isSelfOnlyExpense(expense)) continue;
    // What this family paid for the whole expense
    if (expense.paid_by_family_id && paid[expense.paid_by_family_id] !== undefined) {
      paid[expense.paid_by_family_id] += expense.amount;
    }
    // What each family owes based on splits
    for (const split of expense.expense_splits ?? []) {
      if (owed[split.family_id] !== undefined) {
        owed[split.family_id] += split.share_amount;
      }
    }
  }

  return families.map((f) => ({
    familyId: f.id,
    familyName: f.name,
    totalPaid: round2(paid[f.id] ?? 0),
    totalOwed: round2(owed[f.id] ?? 0),
    balance: normalizeSettlementBalance((paid[f.id] ?? 0) - (owed[f.id] ?? 0)),
  }));
}

// ─── calculateSettlements ────────────────────────────────────────────────────

/**
 * Minimum-transactions greedy algorithm.
 * Positive balance = family is owed money (creditor).
 * Negative balance = family owes money (debtor).
 */
export function calculateSettlements(
  balances: FamilyBalance[]
): SettlementCalculation[] {
  const settlements: SettlementCalculation[] = [];

  // Deep-clone to avoid mutating original array
  const creditors = balances
    .filter((b) => b.balance > 0.01)
    .map((b) => ({ ...b }))
    .sort((a, b) => b.balance - a.balance);

  const debtors = balances
    .filter((b) => b.balance < -0.01)
    .map((b) => ({ ...b }))
    .sort((a, b) => a.balance - b.balance);

  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const credit = creditors[ci];
    const debt = debtors[di];

    const payAmount = round2(Math.min(credit.balance, -debt.balance));

    if (payAmount > 0.01) {
      settlements.push({
        fromFamilyId: debt.familyId,
        fromFamilyName: debt.familyName,
        toFamilyId: credit.familyId,
        toFamilyName: credit.familyName,
        amount: payAmount,
      });
    }

    credit.balance = round2(credit.balance - payAmount);
    debt.balance = round2(debt.balance + payAmount);

    if (Math.abs(credit.balance) < 0.01) ci++;
    if (Math.abs(debt.balance) < 0.01) di++;
  }

  return settlements;
}

export function calculatePersonBalances(
  expenses: Expense[],
  members: TripMember[]
): PersonBalance[] {
  const paid: Record<string, number> = {};
  const owed: Record<string, number> = {};
  const names: Record<string, string> = {};

  for (const member of members) {
    paid[member.user_id] = 0;
    owed[member.user_id] = 0;
    names[member.user_id] = member.profile?.full_name ?? member.profile?.email ?? 'Member';
  }

  for (const expense of expenses) {
    if (expense.paid_by_family_id) continue;
    if (isSelfOnlyExpense(expense)) continue;
    if (paid[expense.paid_by_user_id] !== undefined) {
      paid[expense.paid_by_user_id] += expense.amount;
    }
    for (const split of expense.expense_person_splits ?? []) {
      if (owed[split.user_id] !== undefined) {
        owed[split.user_id] += split.share_amount;
      }
    }
  }

  return members.map((member) => ({
    userId: member.user_id,
    userName: names[member.user_id],
    totalPaid: round2(paid[member.user_id] ?? 0),
    totalOwed: round2(owed[member.user_id] ?? 0),
    balance: normalizeSettlementBalance((paid[member.user_id] ?? 0) - (owed[member.user_id] ?? 0)),
  }));
}

export function calculatePersonSettlements(
  balances: PersonBalance[]
): PersonSettlementCalculation[] {
  const settlements: PersonSettlementCalculation[] = [];
  const creditors = balances
    .filter((b) => b.balance > 0.01)
    .map((b) => ({ ...b }))
    .sort((a, b) => b.balance - a.balance);
  const debtors = balances
    .filter((b) => b.balance < -0.01)
    .map((b) => ({ ...b }))
    .sort((a, b) => a.balance - b.balance);

  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const credit = creditors[ci];
    const debt = debtors[di];
    const payAmount = round2(Math.min(credit.balance, -debt.balance));

    if (payAmount > 0.01) {
      settlements.push({
        fromUserId: debt.userId,
        fromUserName: debt.userName,
        toUserId: credit.userId,
        toUserName: credit.userName,
        amount: payAmount,
      });
    }

    credit.balance = round2(credit.balance - payAmount);
    debt.balance = round2(debt.balance + payAmount);
    if (Math.abs(credit.balance) < 0.01) ci++;
    if (Math.abs(debt.balance) < 0.01) di++;
  }

  return settlements;
}

// ─── calculateFairnessMetrics ─────────────────────────────────────────────────

export interface TripDataForFairness {
  expenses: Expense[];
  families: Family[];
}

export function calculateFairnessMetrics(
  tripData: TripDataForFairness
): FairnessMetrics {
  const { families } = tripData;
  const expenses = tripData.expenses.filter((expense) => !isSelfOnlyExpense(expense));
  const balances = calculateFamilyBalances(expenses, families);
  const totalPaid = balances.reduce((sum, b) => sum + b.totalPaid, 0);

  const paymentShareByFamily = balances.map((b) => ({
    familyId: b.familyId,
    familyName: b.familyName,
    paid: b.totalPaid,
    percentage: totalPaid > 0 ? round2((b.totalPaid / totalPaid) * 100) : 0,
  }));

  const insights: string[] = [];

  // Who paid the most overall
  const topPayer = [...paymentShareByFamily].sort((a, b) => b.paid - a.paid)[0];
  if (topPayer && topPayer.paid > 0) {
    insights.push(
      `${topPayer.familyName} covered the most expenses (${topPayer.percentage}% of the total).`
    );
  }

  // Who has the biggest balance to settle
  const biggestDebtor = [...balances].sort((a, b) => a.balance - b.balance)[0];
  if (biggestDebtor && biggestDebtor.balance < -0.01) {
    insights.push(
      `${biggestDebtor.familyName} has the largest outstanding balance of $${Math.abs(biggestDebtor.balance).toFixed(2)}.`
    );
  }

  // Total expenses
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);
  if (total > 0 && families.length > 0) {
    insights.push(
      `Average per-family spend: $${round2(total / families.length).toFixed(2)}`
    );
  }

  // Check if spending is balanced
  const expectedShare = total / families.length;
  const maxDeviation = Math.max(
    ...balances.map((b) => Math.abs(b.totalOwed - expectedShare))
  );
  if (maxDeviation < total * 0.05 && total > 0) {
    insights.push("Spending is well balanced across families!");
  }

  return { paymentShareByFamily, insights };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function normalizeSettlementBalance(n: number): number {
  const rounded = round2(n);
  return Math.abs(rounded) < SETTLEMENT_EPSILON ? 0 : rounded;
}

function equalByFamily(amount: number, families: Family[]): FamilySplitShare[] {
  const share = round2(amount / families.length);
  const shares = families.map((f) => ({
    familyId: f.id,
    familyName: f.name,
    shareAmount: share,
  }));
  return adjustRounding(shares, amount);
}

/** Distribute rounding cents to the first family to ensure total == amount */
function adjustRounding(shares: FamilySplitShare[], amount: number): FamilySplitShare[] {
  const total = shares.reduce((s, x) => s + x.shareAmount, 0);
  const diff = round2(amount - total);
  if (Math.abs(diff) > 0 && shares.length > 0) {
    shares[0] = {
      ...shares[0],
      shareAmount: round2(shares[0].shareAmount + diff),
    };
  }
  return shares;
}
