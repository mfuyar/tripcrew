import { Expense } from '../types';

function positiveFamilySplitIds(expense: Expense): string[] {
  return (expense.expense_splits ?? [])
    .filter((split) => split.share_amount > 0)
    .map((split) => split.family_id);
}

function positivePersonSplitIds(expense: Expense): string[] {
  return (expense.expense_person_splits ?? [])
    .filter((split) => split.share_amount > 0)
    .map((split) => split.user_id);
}

export function isSelfOnlyFamilyExpense(expense: Expense): boolean {
  if (!expense.paid_by_family_id) return false;
  const splitIds = positiveFamilySplitIds(expense);
  return splitIds.length > 0 && splitIds.every((familyId) => familyId === expense.paid_by_family_id);
}

export function isSelfOnlyPersonExpense(expense: Expense): boolean {
  if (expense.paid_by_family_id || !expense.paid_by_user_id) return false;
  const splitIds = positivePersonSplitIds(expense);
  return splitIds.length > 0 && splitIds.every((userId) => userId === expense.paid_by_user_id);
}

export function isSelfOnlyExpense(expense: Expense): boolean {
  return isSelfOnlyFamilyExpense(expense) || isSelfOnlyPersonExpense(expense);
}

export function canViewSelfOnlyExpense(
  expense: Expense,
  userId: string | undefined,
  userFamilyId: string | undefined,
  canSeeAllPrivateExpenses: boolean
): boolean {
  if (canSeeAllPrivateExpenses) return true;
  if (isSelfOnlyPersonExpense(expense)) return expense.paid_by_user_id === userId;
  if (isSelfOnlyFamilyExpense(expense)) return expense.paid_by_family_id === userFamilyId;
  return false;
}
