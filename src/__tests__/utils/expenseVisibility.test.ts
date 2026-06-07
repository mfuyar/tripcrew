import { Expense } from '../../types';
import {
  canViewSelfOnlyExpense,
  isSelfOnlyExpense,
  isSelfOnlyFamilyExpense,
  isSelfOnlyPersonExpense,
} from '../../utils/expenseVisibility';

function makeExpense(overrides: Partial<Expense>): Expense {
  return {
    id: 'expense-1',
    trip_id: 'trip-1',
    title: 'Gas',
    amount: 20,
    currency: 'USD',
    category: 'gas',
    paid_by_family_id: null,
    paid_by_user_id: 'user-payer',
    split_method: 'equal_by_person',
    date: '2026-06-07',
    created_at: '2026-06-07T00:00:00.000Z',
    updated_at: '2026-06-07T00:00:00.000Z',
    ...overrides,
  } as Expense;
}

describe('expenseVisibility', () => {
  it('marks a family expense as private when only the paying family has a positive split', () => {
    const expense = makeExpense({
      paid_by_family_id: 'family-1',
      expense_splits: [
        { id: 'split-1', expense_id: 'expense-1', trip_id: 'trip-1', family_id: 'family-1', share_amount: 20, created_at: '' },
        { id: 'split-2', expense_id: 'expense-1', trip_id: 'trip-1', family_id: 'family-2', share_amount: 0, created_at: '' },
      ],
    });

    expect(isSelfOnlyFamilyExpense(expense)).toBe(true);
    expect(isSelfOnlyExpense(expense)).toBe(true);
    expect(canViewSelfOnlyExpense(expense, 'user-1', 'family-1', false)).toBe(true);
    expect(canViewSelfOnlyExpense(expense, 'user-2', 'family-2', false)).toBe(false);
    expect(canViewSelfOnlyExpense(expense, 'organizer', undefined, true)).toBe(true);
  });

  it('keeps a family expense public when another family is included', () => {
    const expense = makeExpense({
      paid_by_family_id: 'family-1',
      expense_splits: [
        { id: 'split-1', expense_id: 'expense-1', trip_id: 'trip-1', family_id: 'family-1', share_amount: 10, created_at: '' },
        { id: 'split-2', expense_id: 'expense-1', trip_id: 'trip-1', family_id: 'family-2', share_amount: 10, created_at: '' },
      ],
    });

    expect(isSelfOnlyFamilyExpense(expense)).toBe(false);
    expect(isSelfOnlyExpense(expense)).toBe(false);
  });

  it('marks a person expense as private when only the payer has a positive split', () => {
    const expense = makeExpense({
      paid_by_user_id: 'user-payer',
      expense_person_splits: [
        { id: 'split-1', expense_id: 'expense-1', trip_id: 'trip-1', user_id: 'user-payer', share_amount: 20, created_at: '' },
        { id: 'split-2', expense_id: 'expense-1', trip_id: 'trip-1', user_id: 'user-2', share_amount: 0, created_at: '' },
      ],
    });

    expect(isSelfOnlyPersonExpense(expense)).toBe(true);
    expect(isSelfOnlyExpense(expense)).toBe(true);
    expect(canViewSelfOnlyExpense(expense, 'user-payer', undefined, false)).toBe(true);
    expect(canViewSelfOnlyExpense(expense, 'user-2', undefined, false)).toBe(false);
    expect(canViewSelfOnlyExpense(expense, 'organizer', undefined, true)).toBe(true);
  });

  it('keeps a person expense public when another person is included', () => {
    const expense = makeExpense({
      paid_by_user_id: 'user-payer',
      expense_person_splits: [
        { id: 'split-1', expense_id: 'expense-1', trip_id: 'trip-1', user_id: 'user-payer', share_amount: 10, created_at: '' },
        { id: 'split-2', expense_id: 'expense-1', trip_id: 'trip-1', user_id: 'user-2', share_amount: 10, created_at: '' },
      ],
    });

    expect(isSelfOnlyPersonExpense(expense)).toBe(false);
    expect(isSelfOnlyExpense(expense)).toBe(false);
  });
});
