import { supabase } from '../lib/supabaseClient';
import { Expense, ExpenseSplit, FamilySplitShare, ServiceResult } from '../types';

function isMissingReplaceSplitsFunction(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === 'PGRST202' ||
    error.message?.includes('replace_expense_splits') === true ||
    error.message?.includes('schema cache') === true
  );
}

export const expenseService = {
  async createExpense(
    tripId: string,
    userId: string,
    input: Omit<Expense, 'id' | 'trip_id' | 'paid_by_user_id' | 'created_at' | 'updated_at' | 'paid_by_family' | 'expense_splits'>
  ): Promise<ServiceResult<Expense>> {
    const { data, error } = await supabase
      .from('expenses')
      .insert({ ...input, trip_id: tripId, paid_by_user_id: userId })
      .select()
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as Expense, error: null };
  },

  async getExpenses(tripId: string): Promise<ServiceResult<Expense[]>> {
    const { data, error } = await supabase
      .from('expenses')
      .select('*, paid_by_family:families(*), expense_splits(*, family:families(*))')
      .eq('trip_id', tripId)
      .order('date', { ascending: false });
    if (error) return { data: null, error: error.message };
    return { data: data as Expense[], error: null };
  },

  async getExpenseById(expenseId: string): Promise<ServiceResult<Expense>> {
    const { data, error } = await supabase
      .from('expenses')
      .select('*, paid_by_family:families(*), expense_splits(*, family:families(*))')
      .eq('id', expenseId)
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as Expense, error: null };
  },

  async updateExpense(
    expenseId: string,
    updates: Partial<Omit<Expense, 'id' | 'trip_id' | 'paid_by_user_id' | 'created_at' | 'paid_by_family' | 'expense_splits'>>
  ): Promise<ServiceResult<Expense>> {
    const { data, error } = await supabase
      .from('expenses')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', expenseId)
      .select()
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as Expense, error: null };
  },

  async deleteExpense(expenseId: string): Promise<ServiceResult<null>> {
    const { error } = await supabase.from('expenses').delete().eq('id', expenseId);
    return { data: null, error: error?.message ?? null };
  },

  async getExpenseSplits(expenseId: string): Promise<ServiceResult<ExpenseSplit[]>> {
    const { data, error } = await supabase
      .from('expense_splits')
      .select('*, family:families(*)')
      .eq('expense_id', expenseId);
    if (error) return { data: null, error: error.message };
    return { data: data as ExpenseSplit[], error: null };
  },

  async saveExpenseSplits(
    expenseId: string,
    tripId: string,
    shares: FamilySplitShare[]
  ): Promise<ServiceResult<ExpenseSplit[]>> {
    if (!shares.length) {
      return { data: null, error: 'Expense must have at least one split' };
    }

    const rows = shares.map((s) => ({
      family_id: s.familyId,
      share_amount: s.shareAmount,
      percentage: s.percentage,
    }));
    const { data, error } = await supabase.rpc('replace_expense_splits', {
      expense_uuid: expenseId,
      trip_uuid: tripId,
      shares_json: rows,
    });

    if (error && !isMissingReplaceSplitsFunction(error)) {
      return { data: null, error: error.message };
    }

    if (error) {
      const { error: deleteError } = await supabase
        .from('expense_splits')
        .delete()
        .eq('expense_id', expenseId);

      if (deleteError) return { data: null, error: deleteError.message };

      const fallbackRows = rows.map((row) => ({
        expense_id: expenseId,
        trip_id: tripId,
        ...row,
      }));

      const { data: fallbackData, error: insertError } = await supabase
        .from('expense_splits')
        .insert(fallbackRows)
        .select('*, family:families(*)');

      if (insertError) return { data: null, error: insertError.message };
      return { data: fallbackData as ExpenseSplit[], error: null };
    }

    return { data: data as ExpenseSplit[], error: null };
  },

  async getExpensesByCategory(tripId: string): Promise<ServiceResult<Record<string, number>>> {
    const { data, error } = await supabase
      .from('expenses')
      .select('category, amount')
      .eq('trip_id', tripId);
    if (error) return { data: null, error: error.message };
    const grouped: Record<string, number> = {};
    for (const row of data ?? []) {
      grouped[row.category] = (grouped[row.category] ?? 0) + row.amount;
    }
    return { data: grouped, error: null };
  },
};
