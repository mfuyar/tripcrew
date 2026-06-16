import { supabase } from '../lib/supabaseClient';
import { Expense, ExpensePersonSplit, ExpenseSplit, ExpenseVersion, FamilySplitShare, PersonSplitShare, ServiceResult } from '../types';
import { notificationService } from './notificationService';

function isMissingReplaceSplitsFunction(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === 'PGRST202' ||
    error.message?.includes('replace_expense_splits') === true ||
    error.message?.includes('schema cache') === true
  );
}

function isMissingReplacePersonSplitsFunction(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === 'PGRST202' ||
    error.message?.includes('replace_expense_person_splits') === true ||
    error.message?.includes('schema cache') === true
  );
}

function formatExpenseAmount(expense: Pick<Expense, 'amount' | 'currency'>): string {
  const currency = expense.currency || 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(expense.amount);
  } catch {
    return `${currency} ${expense.amount.toFixed(2)}`;
  }
}

async function getExpenseNotificationRecipients(expense: Expense, actorUserId: string): Promise<string[]> {
  const ids = new Set<string>();

  if (expense.paid_by_family_id) {
    const { data: members } = await supabase
      .from('trip_members')
      .select('user_id')
      .eq('trip_id', expense.trip_id);
    (members ?? []).forEach((row: { user_id: string }) => ids.add(row.user_id));
  } else {
    if (expense.paid_by_user_id) ids.add(expense.paid_by_user_id);
    const splitIds = expense.expense_person_splits?.map((split) => split.user_id).filter(Boolean) ?? [];
    splitIds.forEach((id) => ids.add(id));

    const { data: organizers } = await supabase
      .from('trip_members')
      .select('user_id')
      .eq('trip_id', expense.trip_id)
      .in('role', ['trip_organizer', 'trip_admin']);
    (organizers ?? []).forEach((row: { user_id: string }) => ids.add(row.user_id));
  }

  ids.delete(actorUserId);
  return [...ids];
}

export const expenseService = {
  async createExpense(
    tripId: string,
    userId: string,
    input: Omit<Expense, 'id' | 'trip_id' | 'created_at' | 'updated_at' | 'paid_by_family' | 'paid_by_profile' | 'expense_splits'>
  ): Promise<ServiceResult<Expense>> {
    const { paid_by_user_id, ...rest } = input;
    const { data, error } = await supabase
      .from('expenses')
      .insert({ ...rest, trip_id: tripId, paid_by_user_id: paid_by_user_id ?? userId })
      .select()
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as Expense, error: null };
  },

  async getExpenses(tripId: string): Promise<ServiceResult<Expense[]>> {
    const { data, error } = await supabase
      .from('expenses')
      .select('*, paid_by_family:families(*), paid_by_profile:profiles!paid_by_user_id(*), expense_splits(*, family:families(*)), expense_person_splits(*, profile:profiles!user_id(*))')
      .eq('trip_id', tripId)
      .or('is_deleted.is.null,is_deleted.eq.false')
      .order('date', { ascending: false });
    if (error) return { data: null, error: error.message };
    return { data: data as Expense[], error: null };
  },

  async getExpenseById(expenseId: string): Promise<ServiceResult<Expense>> {
    const { data, error } = await supabase
      .from('expenses')
      .select('*, paid_by_family:families(*), paid_by_profile:profiles!paid_by_user_id(*), expense_splits(*, family:families(*)), expense_person_splits(*, profile:profiles!user_id(*))')
      .eq('id', expenseId)
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as Expense, error: null };
  },

  async notifyExpenseChange(
    expenseId: string,
    actorUserId: string,
    event: 'created' | 'updated' | 'deleted'
  ): Promise<ServiceResult<number>> {
    const { data: expense, error } = await expenseService.getExpenseById(expenseId);
    if (error || !expense) return { data: null, error: error ?? 'Expense not found' };

    const userIds = await getExpenseNotificationRecipients(expense, actorUserId);
    if (userIds.length === 0) return { data: 0, error: null };

    const verb = event === 'created' ? 'added' : event;
    const title = event === 'created'
      ? '💸 New Expense'
      : event === 'updated'
        ? '💸 Expense Updated'
        : '💸 Expense Deleted';
    const body = `${expense.title} ${verb}: ${formatExpenseAmount(expense)}`;

    return notificationService.notifyUsers(userIds, expense.trip_id, 'expense_added', title, body, {
      type: 'expense_added',
      event: `expense_${event}`,
      trip_id: expense.trip_id,
      expense_id: expense.id,
      paid_by_family_id: expense.paid_by_family_id,
      paid_by_user_id: expense.paid_by_user_id,
    }).then((result) => ({
      data: result.data?.length ?? 0,
      error: result.error,
    }));
  },

  async updateExpense(
    expenseId: string,
    updates: Partial<Omit<Expense, 'id' | 'trip_id' | 'paid_by_user_id' | 'created_at' | 'paid_by_family' | 'paid_by_profile' | 'expense_splits'>>
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

  // ─── Hard delete (permanent — admin only) ───────────────────────────────────
  async deleteExpense(expenseId: string): Promise<ServiceResult<null>> {
    const { error } = await supabase.from('expenses').delete().eq('id', expenseId);
    return { data: null, error: error?.message ?? null };
  },

  // ─── Versioning ─────────────────────────────────────────────────────────────

  async saveVersion(
    expense: Expense,
    changeType: ExpenseVersion['change_type'],
    changedByName: string,
    changeSummary?: string
  ): Promise<void> {
    const nextVersion = (expense.current_version ?? 1) + (changeType === 'create' ? 0 : 1);
    await supabase.from('expense_versions').insert({
      expense_id:      expense.id,
      trip_id:         expense.trip_id,
      version_number:  nextVersion,
      snapshot:        {
        id: expense.id, trip_id: expense.trip_id,
        title: expense.title, amount: expense.amount, currency: expense.currency,
        category: expense.category, paid_by_family_id: expense.paid_by_family_id,
        paid_by_user_id: expense.paid_by_user_id, split_method: expense.split_method,
        date: expense.date, notes: expense.notes, receipt_url: expense.receipt_url,
      },
      change_type:     changeType,
      change_summary:  changeSummary,
      changed_by_name: changedByName,
    });
  },

  async getVersions(expenseId: string): Promise<ServiceResult<ExpenseVersion[]>> {
    const { data, error } = await supabase
      .from('expense_versions')
      .select('*')
      .eq('expense_id', expenseId)
      .order('version_number', { ascending: false });
    if (error) return { data: null, error: error.message };
    return { data: data as ExpenseVersion[], error: null };
  },

  // Soft-delete: marks as deleted, saves version, keeps data
  async softDeleteExpense(
    expense: Expense,
    deletedByUserId: string,
    deletedByName: string
  ): Promise<ServiceResult<null>> {
    const nextVersion = (expense.current_version ?? 1) + 1;
    const { data, error } = await supabase
      .from('expenses')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by: deletedByUserId,
        current_version: nextVersion,
        last_edited_by: deletedByUserId,
        last_edited_at: new Date().toISOString(),
      })
      .eq('id', expense.id)
      .select('id');
    if (error) return { data: null, error: error.message };
    if (!data || data.length === 0) {
      return { data: null, error: 'You do not have permission to delete this expense.' };
    }
    await expenseService.saveVersion(expense, 'delete', deletedByName, 'Expense deleted');
    return { data: null, error: null };
  },

  // Restore from a specific version snapshot
  async restoreVersion(
    version: ExpenseVersion,
    restoredByUserId: string,
    restoredByName: string
  ): Promise<ServiceResult<Expense>> {
    const snap = version.snapshot;
    const { data: current } = await expenseService.getExpenseById(version.expense_id);
    const nextVersion = (current?.current_version ?? version.version_number) + 1;

    const { data, error } = await supabase
      .from('expenses')
      .update({
        ...snap,
        is_deleted: false,
        deleted_at: null,
        deleted_by: null,
        current_version: nextVersion,
        last_edited_by: restoredByUserId,
        last_edited_at: new Date().toISOString(),
      })
      .eq('id', version.expense_id)
      .select('*, paid_by_family:families(*), paid_by_profile:profiles!paid_by_user_id(*), expense_splits(*, family:families(*)), expense_person_splits(*, profile:profiles!user_id(*))')
      .single();

    if (error) return { data: null, error: error.message };

    // Record the restore as a new version
    await supabase.from('expense_versions').insert({
      expense_id:      version.expense_id,
      trip_id:         version.trip_id,
      version_number:  nextVersion,
      snapshot:        snap,
      change_type:     'restore',
      change_summary:  `Restored to v${version.version_number}`,
      changed_by_name: restoredByName,
    });

    return { data: data as Expense, error: null };
  },

  // Purge old versions (non-current) 7+ days after trip closes
  async purgeOldVersions(tripId: string): Promise<ServiceResult<number>> {
    const { data, error } = await supabase.rpc('purge_old_expense_versions', { p_trip_id: tripId });
    if (error) return { data: null, error: error.message };
    return { data: data as number, error: null };
  },

  // Get soft-deleted expenses (admin only)
  async getDeletedExpenses(tripId: string): Promise<ServiceResult<Expense[]>> {
    const { data, error } = await supabase
      .from('expenses')
      .select('*, paid_by_family:families(*), paid_by_profile:profiles!paid_by_user_id(*)')
      .eq('trip_id', tripId)
      .eq('is_deleted', true)
      .order('deleted_at', { ascending: false });
    if (error) return { data: null, error: error.message };
    return { data: data as Expense[], error: null };
  },

  async getExpenseSplits(expenseId: string): Promise<ServiceResult<ExpenseSplit[]>> {
    const { data, error } = await supabase
      .from('expense_splits')
      .select('*, family:families(*)')
      .eq('expense_id', expenseId);
    if (error) return { data: null, error: error.message };
    return { data: data as ExpenseSplit[], error: null };
  },

  async saveExpensePersonSplits(
    expenseId: string,
    tripId: string,
    shares: PersonSplitShare[]
  ): Promise<ServiceResult<ExpensePersonSplit[]>> {
    if (!shares.length) {
      return { data: null, error: 'Expense must have at least one person split' };
    }

    const rows = shares.map((s) => ({
      user_id: s.userId,
      share_amount: s.shareAmount,
      percentage: s.percentage,
    }));
    const { data, error } = await supabase.rpc('replace_expense_person_splits', {
      expense_uuid: expenseId,
      trip_uuid: tripId,
      shares_json: rows,
    });

    if (error && !isMissingReplacePersonSplitsFunction(error)) {
      return { data: null, error: error.message };
    }

    if (error) {
      const { error: deleteError } = await supabase
        .from('expense_person_splits')
        .delete()
        .eq('expense_id', expenseId);
      if (deleteError) return { data: null, error: deleteError.message };

      const fallbackRows = rows.map((row) => ({
        expense_id: expenseId,
        trip_id: tripId,
        ...row,
      }));
      const { data: fallbackData, error: insertError } = await supabase
        .from('expense_person_splits')
        .insert(fallbackRows)
        .select('*, profile:profiles!user_id(*)');

      if (insertError) return { data: null, error: insertError.message };
      return { data: fallbackData as ExpensePersonSplit[], error: null };
    }

    return { data: data as ExpensePersonSplit[], error: null };
  },

  async saveExpenseSplits(
    expenseId: string,
    tripId: string,
    shares: FamilySplitShare[]
  ): Promise<ServiceResult<ExpenseSplit[]>> {
    if (!shares.length) {
      return { data: [], error: null };
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
