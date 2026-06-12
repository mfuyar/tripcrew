/**
 * SPEC: Core Financial Calculation Algorithms
 *
 * These tests define the exact expected behavior for:
 *  1. calculateExpenseSplits  — how to divide an expense among families
 *  2. calculateFamilyBalances — per-family paid vs. owed totals
 *  3. calculateSettlements    — minimum transactions to settle all debts
 *  4. calculateFairnessMetrics — fairness insights for the dashboard
 */

import {
  calculateExpenseSplits,
  calculateFamilyBalances,
  calculateSettlements,
  calculateFairnessMetrics,
  calculatePersonBalances,
  applySettlementsToPersonBalances,
} from '../../utils/calculations';
import { Family, Expense, FamilyBalance, PersonBalance, Settlement } from '../../types';

// ─── Test Fixtures ──────────────────────────────────────────────────────────

function makeFamily(
  id: string,
  name: string,
  adults: number,
  children: number
): Family {
  return {
    id,
    trip_id: 'trip-1',
    name,
    adults_count: adults,
    children_count: children,
    created_by: 'user-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

const familyA = makeFamily('a', 'Uyar Family', 2, 1);   // 3 people
const familyB = makeFamily('b', 'Yilmaz Family', 2, 0); // 2 people
const familyC = makeFamily('c', 'Demir Family', 4, 2);  // 6 people
const families = [familyA, familyB, familyC];

function makeExpense(
  id: string,
  amount: number,
  paidByFamilyId: string,
  splits: Array<{ family_id: string; share_amount: number }>
): Expense {
  return {
    id,
    trip_id: 'trip-1',
    title: `Expense ${id}`,
    amount,
    currency: 'USD',
    paid_by_family_id: paidByFamilyId,
    paid_by_user_id: 'user-1',
    date: new Date().toISOString(),
    category: 'other',
    split_method: 'equal_by_family',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    expense_splits: splits.map((s, i) => ({
      id: `split-${id}-${i}`,
      expense_id: id,
      trip_id: 'trip-1',
      family_id: s.family_id,
      share_amount: s.share_amount,
      created_at: new Date().toISOString(),
    })),
  };
}

// ─── calculateExpenseSplits ─────────────────────────────────────────────────

describe('calculateExpenseSplits', () => {
  const amount = 300;

  // SPEC: equal_by_family divides equally regardless of family size
  describe('equal_by_family', () => {
    it('splits equally among 3 families', () => {
      const result = calculateExpenseSplits(amount, families, 'equal_by_family');
      expect(result).toHaveLength(3);
      result.forEach((r) => expect(r.shareAmount).toBe(100));
      expect(total(result)).toBeCloseTo(amount, 2);
    });

    it('handles $100 split among 3 families with rounding correction', () => {
      const result = calculateExpenseSplits(100, families, 'equal_by_family');
      expect(total(result)).toBeCloseTo(100, 2);
    });

    it('returns empty array for empty families list', () => {
      expect(calculateExpenseSplits(300, [], 'equal_by_family')).toEqual([]);
    });
  });

  // SPEC: equal_by_person divides by total headcount
  describe('equal_by_person', () => {
    it('splits proportionally by person count (2+1=3, 2, 4+2=6 → total 11)', () => {
      // familyA=3, familyB=2, familyC=6 → total=11
      const result = calculateExpenseSplits(110, families, 'equal_by_person');
      const perPerson = 110 / 11; // $10 per person
      expect(find(result, 'a').shareAmount).toBeCloseTo(3 * perPerson, 2);
      expect(find(result, 'b').shareAmount).toBeCloseTo(2 * perPerson, 2);
      expect(find(result, 'c').shareAmount).toBeCloseTo(6 * perPerson, 2);
      expect(total(result)).toBeCloseTo(110, 2);
    });

    it('falls back to equal_by_family if all families have 0 people', () => {
      const empty = [
        makeFamily('x', 'X', 0, 0),
        makeFamily('y', 'Y', 0, 0),
      ];
      const result = calculateExpenseSplits(100, empty, 'equal_by_person');
      expect(total(result)).toBeCloseTo(100, 2);
    });
  });

  // SPEC: adults_only ignores children entirely
  describe('adults_only', () => {
    it('divides only by adult count (2, 2, 4 → total 8 adults)', () => {
      const result = calculateExpenseSplits(80, families, 'adults_only');
      const perAdult = 80 / 8;
      expect(find(result, 'a').shareAmount).toBeCloseTo(2 * perAdult, 2);
      expect(find(result, 'b').shareAmount).toBeCloseTo(2 * perAdult, 2);
      expect(find(result, 'c').shareAmount).toBeCloseTo(4 * perAdult, 2);
      expect(total(result)).toBeCloseTo(80, 2);
    });
  });

  // SPEC: children count as 0.5 weight vs adult 1.0
  describe('children_count_half', () => {
    it('weights adults=1 and children=0.5', () => {
      // familyA: 2 + 1*0.5 = 2.5
      // familyB: 2 + 0*0.5 = 2.0
      // familyC: 4 + 2*0.5 = 5.0  → total weight = 9.5
      const result = calculateExpenseSplits(95, families, 'children_count_half');
      const perWeight = 95 / 9.5;
      expect(find(result, 'a').shareAmount).toBeCloseTo(2.5 * perWeight, 2);
      expect(find(result, 'b').shareAmount).toBeCloseTo(2.0 * perWeight, 2);
      expect(find(result, 'c').shareAmount).toBeCloseTo(5.0 * perWeight, 2);
      expect(total(result)).toBeCloseTo(95, 2);
    });
  });

  // SPEC: custom_percentage uses provided percentages
  describe('custom_percentage', () => {
    it('splits by provided percentages', () => {
      const result = calculateExpenseSplits(200, families, 'custom_percentage', {
        percentages: { a: 50, b: 30, c: 20 },
      });
      expect(find(result, 'a').shareAmount).toBeCloseTo(100, 2);
      expect(find(result, 'b').shareAmount).toBeCloseTo(60, 2);
      expect(find(result, 'c').shareAmount).toBeCloseTo(40, 2);
      expect(total(result)).toBeCloseTo(200, 2);
    });

    it('assigns 0 to families with no percentage specified', () => {
      const result = calculateExpenseSplits(100, families, 'custom_percentage', {
        percentages: { a: 100 },
      });
      expect(find(result, 'a').shareAmount).toBeCloseTo(100, 2);
      expect(find(result, 'b').shareAmount).toBe(0);
      expect(find(result, 'c').shareAmount).toBe(0);
    });
  });

  // SPEC: custom_family_amounts uses exact provided amounts
  describe('custom_family_amounts', () => {
    it('assigns exact amounts per family', () => {
      const result = calculateExpenseSplits(300, families, 'custom_family_amounts', {
        amounts: { a: 120, b: 80, c: 100 },
      });
      expect(find(result, 'a').shareAmount).toBe(120);
      expect(find(result, 'b').shareAmount).toBe(80);
      expect(find(result, 'c').shareAmount).toBe(100);
    });

    it('absorbs rounding drift into the first family when amounts do not sum exactly', () => {
      // Provided amounts sum to 299.98, but the expense is $300 — the
      // 2-cent gap must be assigned to the first family to satisfy the
      // sum invariant (SPEC §12.2).
      const result = calculateExpenseSplits(300, families, 'custom_family_amounts', {
        amounts: { a: 119.99, b: 80, c: 99.99 },
      });
      expect(total(result)).toBeCloseTo(300, 2);
      expect(find(result, 'a').shareAmount).toBeCloseTo(120.01, 2);
      expect(find(result, 'b').shareAmount).toBe(80);
      expect(find(result, 'c').shareAmount).toBe(99.99);
    });
  });

  // SPEC: selected_families_only splits only among selected families
  describe('selected_families_only', () => {
    it('splits only among selected families, others get 0', () => {
      const result = calculateExpenseSplits(100, families, 'selected_families_only', {
        selectedFamilyIds: ['a', 'c'],
      });
      expect(find(result, 'b').shareAmount).toBe(0);
      expect(find(result, 'a').shareAmount + find(result, 'c').shareAmount)
        .toBeCloseTo(100, 2);
    });

    it('falls back to equal_by_family if selectedFamilyIds is empty', () => {
      const result = calculateExpenseSplits(90, families, 'selected_families_only', {
        selectedFamilyIds: [],
      });
      expect(total(result)).toBeCloseTo(90, 2);
    });
  });

  // SPEC: totals always sum to original amount (rounding correction)
  describe('rounding invariant', () => {
    const amounts = [1, 7, 10, 33.33, 99.99, 100, 1000, 12345.67];
    amounts.forEach((amt) => {
      it(`total always equals $${amt} for equal_by_family`, () => {
        const result = calculateExpenseSplits(amt, families, 'equal_by_family');
        expect(total(result)).toBeCloseTo(amt, 2);
      });
    });
  });
});

// ─── calculateFamilyBalances ────────────────────────────────────────────────

describe('calculateFamilyBalances', () => {
  // SPEC: positive balance = family should receive money
  // SPEC: negative balance = family owes money
  // SPEC: zero = settled

  it('correctly calculates who paid, who owes, and net balance', () => {
    // familyA paid $300. Split: A=$100, B=$100, C=$100
    const expenses = [
      makeExpense('e1', 300, 'a', [
        { family_id: 'a', share_amount: 100 },
        { family_id: 'b', share_amount: 100 },
        { family_id: 'c', share_amount: 100 },
      ]),
    ];
    const balances = calculateFamilyBalances(expenses, families);
    const a = find(balances, 'a');
    const b = find(balances, 'b');
    const c = find(balances, 'c');

    expect(a.totalPaid).toBe(300);
    expect(a.totalOwed).toBe(100);
    expect(a.balance).toBe(200); // owed $200 from others

    expect(b.totalPaid).toBe(0);
    expect(b.totalOwed).toBe(100);
    expect(b.balance).toBe(-100); // owes $100

    expect(c.totalPaid).toBe(0);
    expect(c.totalOwed).toBe(100);
    expect(c.balance).toBe(-100); // owes $100
  });

  it('handles multiple expenses paid by different families', () => {
    const expenses = [
      makeExpense('e1', 300, 'a', [
        { family_id: 'a', share_amount: 100 },
        { family_id: 'b', share_amount: 100 },
        { family_id: 'c', share_amount: 100 },
      ]),
      makeExpense('e2', 150, 'b', [
        { family_id: 'a', share_amount: 50 },
        { family_id: 'b', share_amount: 50 },
        { family_id: 'c', share_amount: 50 },
      ]),
    ];
    const balances = calculateFamilyBalances(expenses, families);
    const a = find(balances, 'a');
    const b = find(balances, 'b');

    // A paid 300, owed 150 → balance +150
    expect(a.totalPaid).toBe(300);
    expect(a.totalOwed).toBe(150);
    expect(a.balance).toBe(150);

    // B paid 150, owed 150 → balance 0
    expect(b.totalPaid).toBe(150);
    expect(b.totalOwed).toBe(150);
    expect(b.balance).toBe(0);
  });

  it('returns zero balances if no expenses', () => {
    const balances = calculateFamilyBalances([], families);
    balances.forEach((b) => {
      expect(b.totalPaid).toBe(0);
      expect(b.totalOwed).toBe(0);
      expect(b.balance).toBe(0);
    });
  });

  it('all balances sum to zero (conservation law)', () => {
    const expenses = [
      makeExpense('e1', 240, 'a', [
        { family_id: 'a', share_amount: 80 },
        { family_id: 'b', share_amount: 80 },
        { family_id: 'c', share_amount: 80 },
      ]),
      makeExpense('e2', 90, 'b', [
        { family_id: 'a', share_amount: 30 },
        { family_id: 'b', share_amount: 30 },
        { family_id: 'c', share_amount: 30 },
      ]),
    ];
    const balances = calculateFamilyBalances(expenses, families);
    const sum = balances.reduce((s, b) => s + b.balance, 0);
    expect(sum).toBeCloseTo(0, 2);
  });

  it('treats one-cent split drift as settled when each family paid the same amount', () => {
    const expenses = [
      makeExpense('e1', 20, 'a', [
        { family_id: 'a', share_amount: 6.66 },
        { family_id: 'b', share_amount: 6.67 },
        { family_id: 'c', share_amount: 6.67 },
      ]),
      makeExpense('e2', 20, 'b', [
        { family_id: 'a', share_amount: 6.66 },
        { family_id: 'b', share_amount: 6.67 },
        { family_id: 'c', share_amount: 6.67 },
      ]),
      makeExpense('e3', 20, 'c', [
        { family_id: 'a', share_amount: 6.66 },
        { family_id: 'b', share_amount: 6.67 },
        { family_id: 'c', share_amount: 6.67 },
      ]),
    ];

    const balances = calculateFamilyBalances(expenses, families);

    expect(find(balances, 'a').balance).toBe(0);
    expect(find(balances, 'b').balance).toBe(0);
    expect(find(balances, 'c').balance).toBe(0);
  });
});

// ─── calculateSettlements ───────────────────────────────────────────────────

describe('calculateSettlements', () => {
  // SPEC: minimum number of transactions to zero out all balances

  it('handles the spec example: A=+259, B=-185, C=-74', () => {
    const balances = makeBalances([
      { id: 'a', name: 'Uyar Family', balance: 259 },
      { id: 'b', name: 'Yilmaz Family', balance: -185 },
      { id: 'c', name: 'Demir Family', balance: -74 },
    ]);
    const settlements = calculateSettlements(balances);
    expect(settlements).toHaveLength(2);

    const bToA = settlements.find((s) => s.fromFamilyId === 'b' && s.toFamilyId === 'a');
    const cToA = settlements.find((s) => s.fromFamilyId === 'c' && s.toFamilyId === 'a');
    expect(bToA?.amount).toBeCloseTo(185, 2);
    expect(cToA?.amount).toBeCloseTo(74, 2);
  });

  it('returns empty array when all balances are zero', () => {
    const balances = makeBalances([
      { id: 'a', name: 'A', balance: 0 },
      { id: 'b', name: 'B', balance: 0 },
    ]);
    expect(calculateSettlements(balances)).toEqual([]);
  });

  it('handles single creditor and single debtor', () => {
    const balances = makeBalances([
      { id: 'a', name: 'A', balance: 100 },
      { id: 'b', name: 'B', balance: -100 },
    ]);
    const settlements = calculateSettlements(balances);
    expect(settlements).toHaveLength(1);
    expect(settlements[0].fromFamilyId).toBe('b');
    expect(settlements[0].toFamilyId).toBe('a');
    expect(settlements[0].amount).toBe(100);
  });

  it('handles multiple debtors paying one creditor', () => {
    const balances = makeBalances([
      { id: 'a', name: 'A', balance: 300 },
      { id: 'b', name: 'B', balance: -100 },
      { id: 'c', name: 'C', balance: -100 },
      { id: 'd', name: 'D', balance: -100 },
    ]);
    const settlements = calculateSettlements(balances);
    expect(settlements).toHaveLength(3);
    const totalPaid = settlements.reduce((s, t) => s + t.amount, 0);
    expect(totalPaid).toBeCloseTo(300, 2);
  });

  it('handles one debtor paying multiple creditors', () => {
    const balances = makeBalances([
      { id: 'a', name: 'A', balance: 100 },
      { id: 'b', name: 'B', balance: 200 },
      { id: 'c', name: 'C', balance: -300 },
    ]);
    const settlements = calculateSettlements(balances);
    const totalPaid = settlements.reduce((s, t) => s + t.amount, 0);
    expect(totalPaid).toBeCloseTo(300, 2);
    // All debts settled
    const cPayments = settlements.filter((s) => s.fromFamilyId === 'c');
    expect(cPayments.reduce((s, t) => s + t.amount, 0)).toBeCloseTo(300, 2);
  });

  it('settlement transactions are always positive amounts', () => {
    const balances = makeBalances([
      { id: 'a', name: 'A', balance: 50 },
      { id: 'b', name: 'B', balance: -50 },
    ]);
    const settlements = calculateSettlements(balances);
    settlements.forEach((s) => expect(s.amount).toBeGreaterThan(0));
  });

  it('total outgoing equals total incoming', () => {
    const balances = makeBalances([
      { id: 'a', name: 'A', balance: 150 },
      { id: 'b', name: 'B', balance: 50 },
      { id: 'c', name: 'C', balance: -120 },
      { id: 'd', name: 'D', balance: -80 },
    ]);
    const settlements = calculateSettlements(balances);
    const totalOut = settlements.reduce((s, t) => s + t.amount, 0);
    expect(totalOut).toBeCloseTo(200, 2);
  });

  // SPEC: rounding — floating point must not cause issues
  it('handles floating point amounts without errors', () => {
    const balances = makeBalances([
      { id: 'a', name: 'A', balance: 33.33 },
      { id: 'b', name: 'B', balance: 33.34 },
      { id: 'c', name: 'C', balance: -66.67 },
    ]);
    const settlements = calculateSettlements(balances);
    const totalPaid = settlements.reduce((s, t) => s + t.amount, 0);
    expect(totalPaid).toBeCloseTo(66.67, 2);
  });
});

// ─── calculateFairnessMetrics ───────────────────────────────────────────────

describe('calculateFairnessMetrics', () => {
  it('returns payment share percentages for each family', () => {
    const expenses = [
      makeExpense('e1', 300, 'a', [
        { family_id: 'a', share_amount: 100 },
        { family_id: 'b', share_amount: 100 },
        { family_id: 'c', share_amount: 100 },
      ]),
      makeExpense('e2', 100, 'b', [
        { family_id: 'a', share_amount: 33.33 },
        { family_id: 'b', share_amount: 33.33 },
        { family_id: 'c', share_amount: 33.34 },
      ]),
    ];
    const metrics = calculateFairnessMetrics({ expenses, families });
    const totalPaid = 400;
    const aShare = metrics.paymentShareByFamily.find((p) => p.familyId === 'a');
    const bShare = metrics.paymentShareByFamily.find((p) => p.familyId === 'b');

    expect(aShare?.paid).toBe(300);
    expect(aShare?.percentage).toBeCloseTo((300 / totalPaid) * 100, 1);
    expect(bShare?.paid).toBe(100);
    expect(bShare?.percentage).toBeCloseTo((100 / totalPaid) * 100, 1);
  });

  it('returns friendly insights array', () => {
    const expenses = [
      makeExpense('e1', 300, 'a', [
        { family_id: 'a', share_amount: 100 },
        { family_id: 'b', share_amount: 100 },
        { family_id: 'c', share_amount: 100 },
      ]),
    ];
    const metrics = calculateFairnessMetrics({ expenses, families });
    expect(Array.isArray(metrics.insights)).toBe(true);
    expect(metrics.insights.length).toBeGreaterThan(0);
    // Insights should be non-empty strings
    metrics.insights.forEach((i) => {
      expect(typeof i).toBe('string');
      expect(i.length).toBeGreaterThan(0);
    });
  });

  it('handles empty expenses', () => {
    const metrics = calculateFairnessMetrics({ expenses: [], families });
    expect(metrics.paymentShareByFamily).toHaveLength(3);
    metrics.paymentShareByFamily.forEach((p) => {
      expect(p.paid).toBe(0);
      expect(p.percentage).toBe(0);
    });
  });

  it('all payment percentages sum to ~100', () => {
    const expenses = [
      makeExpense('e1', 300, 'a', [
        { family_id: 'a', share_amount: 150 },
        { family_id: 'b', share_amount: 100 },
        { family_id: 'c', share_amount: 50 },
      ]),
    ];
    const metrics = calculateFairnessMetrics({ expenses, families });
    const sum = metrics.paymentShareByFamily.reduce((s, p) => s + p.percentage, 0);
    expect(sum).toBeCloseTo(100, 1);
  });

  it('does not crash or report false "well balanced" insight for trips with no families', () => {
    // Person-only trips have an empty families array. With families.length === 0,
    // total / families.length is Infinity/NaN and Math.max(...[]) is -Infinity —
    // both of which previously made the "well balanced" check pass spuriously.
    const personExpense: Expense = {
      id: 'p1',
      trip_id: 'trip-1',
      title: 'Snacks',
      amount: 50,
      currency: 'USD',
      paid_by_family_id: null,
      paid_by_user_id: 'user-1',
      date: new Date().toISOString(),
      category: 'other',
      split_method: 'equal_by_person',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      expense_person_splits: [
        { id: 'eps-1', expense_id: 'p1', trip_id: 'trip-1', user_id: 'user-1', share_amount: 25, created_at: '' },
        { id: 'eps-2', expense_id: 'p1', trip_id: 'trip-1', user_id: 'user-2', share_amount: 25, created_at: '' },
      ],
    };

    const metrics = calculateFairnessMetrics({ expenses: [personExpense], families: [] });
    expect(metrics.paymentShareByFamily).toEqual([]);
    expect(metrics.insights).not.toContain('Spending is well balanced across families!');
  });
});

// ─── applySettlementsToPersonBalances ───────────────────────────────────────

describe('applySettlementsToPersonBalances', () => {
  function makePersonBalances(
    items: Array<{ id: string; name: string; balance: number }>
  ): PersonBalance[] {
    return items.map((item) => ({
      userId: item.id,
      userName: item.name,
      totalPaid: item.balance > 0 ? item.balance : 0,
      totalOwed: item.balance < 0 ? -item.balance : 0,
      balance: item.balance,
    }));
  }

  function makeSettlement(overrides: Partial<Settlement>): Settlement {
    return {
      id: 's1',
      trip_id: 'trip-1',
      settlement_type: 'person',
      amount: 0,
      currency: 'USD',
      status: 'completed',
      created_at: '',
      updated_at: '',
      ...overrides,
    };
  }

  it('nets a completed person settlement out of both balances', () => {
    const balances = makePersonBalances([
      { id: 'u1', name: 'Alice', balance: -50 },
      { id: 'u2', name: 'Bob', balance: 50 },
    ]);
    const settlements = [
      makeSettlement({ from_user_id: 'u1', to_user_id: 'u2', amount: 50, status: 'completed' }),
    ];

    const result = applySettlementsToPersonBalances(balances, settlements);
    const alice = result.find((b) => b.userId === 'u1')!;
    const bob = result.find((b) => b.userId === 'u2')!;

    expect(alice.balance).toBe(0);
    expect(bob.balance).toBe(0);
  });

  it('ignores settlements that are not completed', () => {
    const balances = makePersonBalances([
      { id: 'u1', name: 'Alice', balance: -50 },
      { id: 'u2', name: 'Bob', balance: 50 },
    ]);
    const settlements = [
      makeSettlement({ from_user_id: 'u1', to_user_id: 'u2', amount: 50, status: 'confirmed' }),
    ];

    const result = applySettlementsToPersonBalances(balances, settlements);
    expect(result.find((b) => b.userId === 'u1')!.balance).toBe(-50);
    expect(result.find((b) => b.userId === 'u2')!.balance).toBe(50);
  });

  it('ignores soft-deleted settlements', () => {
    const balances = makePersonBalances([
      { id: 'u1', name: 'Alice', balance: -50 },
      { id: 'u2', name: 'Bob', balance: 50 },
    ]);
    const settlements = [
      makeSettlement({ from_user_id: 'u1', to_user_id: 'u2', amount: 50, status: 'completed', deleted_at: new Date().toISOString() }),
    ];

    const result = applySettlementsToPersonBalances(balances, settlements);
    expect(result.find((b) => b.userId === 'u1')!.balance).toBe(-50);
    expect(result.find((b) => b.userId === 'u2')!.balance).toBe(50);
  });

  it('ignores family-type settlements', () => {
    const balances = makePersonBalances([
      { id: 'u1', name: 'Alice', balance: -50 },
      { id: 'u2', name: 'Bob', balance: 50 },
    ]);
    const settlements = [
      makeSettlement({ settlement_type: 'family', from_family_id: 'f1', to_family_id: 'f2', amount: 50, status: 'completed' }),
    ];

    const result = applySettlementsToPersonBalances(balances, settlements);
    expect(result.find((b) => b.userId === 'u1')!.balance).toBe(-50);
    expect(result.find((b) => b.userId === 'u2')!.balance).toBe(50);
  });

  it('leaves a residual balance if a second debt arises after settling the first', () => {
    // u1 already settled a $50 debt to u2. A new $20 debt has since accrued.
    const balances = makePersonBalances([
      { id: 'u1', name: 'Alice', balance: -20 },
      { id: 'u2', name: 'Bob', balance: 20 },
    ]);
    const settlements = [
      makeSettlement({ from_user_id: 'u1', to_user_id: 'u2', amount: 50, status: 'completed' }),
    ];

    const result = applySettlementsToPersonBalances(balances, settlements);
    // u1 now appears to have OVERPAID by $30 (a credit), since the $50
    // settlement fully covers the new $20 debt with $30 left over.
    expect(result.find((b) => b.userId === 'u1')!.balance).toBe(30);
    expect(result.find((b) => b.userId === 'u2')!.balance).toBe(-30);
  });
});

// ─── Integration: full trip flow ────────────────────────────────────────────

describe('Full trip settlement flow (integration)', () => {
  it('3-family vacation: split → balances → settle → all zeros', () => {
    // Uyar Family paid for lodging ($900)
    // Yilmaz Family paid for groceries ($300)
    // Demir Family paid for activities ($150)
    // All split equally by family

    const lodging = makeExpense('lodge', 900, 'a', [
      { family_id: 'a', share_amount: 300 },
      { family_id: 'b', share_amount: 300 },
      { family_id: 'c', share_amount: 300 },
    ]);
    const groceries = makeExpense('groc', 300, 'b', [
      { family_id: 'a', share_amount: 100 },
      { family_id: 'b', share_amount: 100 },
      { family_id: 'c', share_amount: 100 },
    ]);
    const activities = makeExpense('act', 150, 'c', [
      { family_id: 'a', share_amount: 50 },
      { family_id: 'b', share_amount: 50 },
      { family_id: 'c', share_amount: 50 },
    ]);

    const balances = calculateFamilyBalances([lodging, groceries, activities], families);

    // A: paid 900, owed 450 → +450
    // B: paid 300, owed 450 → -150
    // C: paid 150, owed 450 → -300
    const a = find(balances, 'a');
    const b = find(balances, 'b');
    const c = find(balances, 'c');

    expect(a.balance).toBeCloseTo(450, 2);
    expect(b.balance).toBeCloseTo(-150, 2);
    expect(c.balance).toBeCloseTo(-300, 2);

    // Settle
    const settlements = calculateSettlements(balances);
    expect(settlements).toHaveLength(2);
    const totalSettled = settlements.reduce((s, t) => s + t.amount, 0);
    expect(totalSettled).toBeCloseTo(450, 2);

    // All settlements go to family A (creditor)
    settlements.forEach((s) => expect(s.toFamilyId).toBe('a'));
  });
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function total(shares: Array<{ shareAmount: number }>) {
  return shares.reduce((s, x) => s + x.shareAmount, 0);
}

function find<T extends { familyId: string }>(arr: T[], id: string): T {
  const result = arr.find((x) => x.familyId === id);
  if (!result) throw new Error(`Family ${id} not found in result`);
  return result;
}

function makeBalances(
  items: Array<{ id: string; name: string; balance: number }>
): FamilyBalance[] {
  return items.map((item) => ({
    familyId: item.id,
    familyName: item.name,
    totalPaid: item.balance > 0 ? item.balance : 0,
    totalOwed: item.balance < 0 ? -item.balance : 0,
    balance: item.balance,
  }));
}
