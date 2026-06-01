/**
 * SPEC §10 — Fairness Dashboard
 *
 * Insights generated when:
 * - One family paid > 50% of total → warning shown
 * - A family has $0 paid → noted
 * - Sum of all expenses > $0 (no insights if nothing spent)
 *
 * Tone: always friendly, never accusatory.
 * ✅ "Uyar Family covered the most expenses (68% of the total)."
 * ❌ "Uyar Family paid too much."
 */

import { calculateFairnessMetrics } from '../../utils/calculations';
import { Family, Expense } from '../../types';

function makeFamily(id: string, name: string, adults = 2, children = 0): Family {
  return {
    id, trip_id: 'trip-1', name, adults_count: adults, children_count: children,
    created_by: 'u1', created_at: '', updated_at: '',
  };
}

function makeExpense(id: string, amount: number, paidBy: string, splits: Array<{ family_id: string; share_amount: number }>): Expense {
  return {
    id, trip_id: 'trip-1', title: id, amount, currency: 'USD',
    paid_by_family_id: paidBy, paid_by_user_id: 'u1',
    date: '', category: 'other', split_method: 'equal_by_family',
    created_at: '', updated_at: '',
    expense_splits: splits.map((s, i) => ({
      id: `sp-${id}-${i}`, expense_id: id, trip_id: 'trip-1',
      family_id: s.family_id, share_amount: s.share_amount, created_at: '',
    })),
  };
}

const familyA = makeFamily('a', 'Uyar Family');
const familyB = makeFamily('b', 'Yilmaz Family');
const familyC = makeFamily('c', 'Demir Family');
const families = [familyA, familyB, familyC];

// ─── §10 insight thresholds ───────────────────────────────────────────────────

describe('SPEC §10 — Fairness insights', () => {
  it('generates an insight when one family paid > 50% of total', () => {
    // Family A paid $680 out of $1000 total = 68%
    const expenses = [
      makeExpense('e1', 680, 'a', [
        { family_id: 'a', share_amount: 226.67 },
        { family_id: 'b', share_amount: 226.67 },
        { family_id: 'c', share_amount: 226.66 },
      ]),
      makeExpense('e2', 160, 'b', [
        { family_id: 'a', share_amount: 53.33 },
        { family_id: 'b', share_amount: 53.33 },
        { family_id: 'c', share_amount: 53.34 },
      ]),
      makeExpense('e3', 160, 'c', [
        { family_id: 'a', share_amount: 53.33 },
        { family_id: 'b', share_amount: 53.33 },
        { family_id: 'c', share_amount: 53.34 },
      ]),
    ];

    const metrics = calculateFairnessMetrics({ expenses, families });

    const aShare = metrics.paymentShareByFamily.find((p) => p.familyId === 'a');
    expect(aShare!.percentage).toBeGreaterThan(50);
    expect(metrics.insights.length).toBeGreaterThan(0);
  });

  it('generates an insight when a family has $0 paid', () => {
    // Family C paid nothing
    const expenses = [
      makeExpense('e1', 300, 'a', [
        { family_id: 'a', share_amount: 100 },
        { family_id: 'b', share_amount: 100 },
        { family_id: 'c', share_amount: 100 },
      ]),
      makeExpense('e2', 300, 'b', [
        { family_id: 'a', share_amount: 100 },
        { family_id: 'b', share_amount: 100 },
        { family_id: 'c', share_amount: 100 },
      ]),
    ];

    const metrics = calculateFairnessMetrics({ expenses, families });

    const cShare = metrics.paymentShareByFamily.find((p) => p.familyId === 'c');
    expect(cShare!.paid).toBe(0);
    expect(metrics.insights.length).toBeGreaterThan(0);
  });

  it('returns no insights when no expenses exist', () => {
    const metrics = calculateFairnessMetrics({ expenses: [], families });

    // No expenses → nothing to say
    expect(metrics.insights.length).toBe(0);
  });

  it('computes correct percentages for all families', () => {
    const expenses = [
      makeExpense('e1', 600, 'a', [
        { family_id: 'a', share_amount: 200 },
        { family_id: 'b', share_amount: 200 },
        { family_id: 'c', share_amount: 200 },
      ]),
      makeExpense('e2', 400, 'b', [
        { family_id: 'a', share_amount: 133.33 },
        { family_id: 'b', share_amount: 133.33 },
        { family_id: 'c', share_amount: 133.34 },
      ]),
    ];

    const metrics = calculateFairnessMetrics({ expenses, families });
    const sum = metrics.paymentShareByFamily.reduce((s, p) => s + p.percentage, 0);

    expect(sum).toBeCloseTo(100, 1);
    const aShare = metrics.paymentShareByFamily.find((p) => p.familyId === 'a')!;
    expect(aShare.paid).toBe(600);
    expect(aShare.percentage).toBeCloseTo(60, 1);
  });
});

// ─── §10 Tone — friendly, never accusatory ────────────────────────────────────

describe('SPEC §10 — Tone of insights', () => {
  const expenses = [
    makeExpense('e1', 680, 'a', [
      { family_id: 'a', share_amount: 226.67 },
      { family_id: 'b', share_amount: 226.67 },
      { family_id: 'c', share_amount: 226.66 },
    ]),
  ];

  it('insights do not use accusatory language like "paid too much"', () => {
    const metrics = calculateFairnessMetrics({ expenses, families });

    metrics.insights.forEach((insight) => {
      expect(insight.toLowerCase()).not.toContain('paid too much');
      expect(insight.toLowerCase()).not.toContain('overpaid');
      expect(insight.toLowerCase()).not.toContain('unfair');
    });
  });

  it('insights mention the family by name (friendly attribution)', () => {
    const metrics = calculateFairnessMetrics({ expenses, families });

    // At least one insight should mention a family name
    const mentionsFamilyName = metrics.insights.some((i) =>
      families.some((f) => i.includes(f.name))
    );
    expect(mentionsFamilyName).toBe(true);
  });

  it('insights are non-empty strings', () => {
    const metrics = calculateFairnessMetrics({ expenses, families });

    metrics.insights.forEach((insight) => {
      expect(typeof insight).toBe('string');
      expect(insight.trim().length).toBeGreaterThan(0);
    });
  });
});
