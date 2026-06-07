/**
 * SPEC: Expense Service
 *
 * These tests verify the expense service layer behavior using mocked Supabase.
 * Each test defines the expected contract between the app and the database.
 */

// Mock Supabase before any imports
const mockSelect = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockEq = jest.fn();
const mockOr = jest.fn();
const mockOrder = jest.fn();
const mockSingle = jest.fn();

const mockFrom = jest.fn(() => ({
  select: mockSelect.mockReturnThis(),
  insert: mockInsert.mockReturnThis(),
  update: mockUpdate.mockReturnThis(),
  delete: mockDelete.mockReturnThis(),
  eq: mockEq.mockReturnThis(),
  or: mockOr.mockReturnThis(),
  order: mockOrder.mockReturnThis(),
  single: mockSingle,
}));

jest.mock('../../lib/supabaseClient', () => ({
  supabase: { from: mockFrom },
}));

import { expenseService } from '../../services/expenseService';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('expenseService', () => {
  const tripId = 'trip-abc';
  const expenseId = 'exp-123';

  describe('getExpenses', () => {
    // SPEC: Returns expenses for a trip, ordered by date descending
    it('fetches expenses for a trip ordered by date', async () => {
      const mockExpenses = [
        { id: 'e1', trip_id: tripId, title: 'Lunch', amount: 80, paid_by_family_id: 'f1' },
        { id: 'e2', trip_id: tripId, title: 'Gas', amount: 60, paid_by_family_id: 'f2' },
      ];
      mockOrder.mockResolvedValueOnce({ data: mockExpenses, error: null });

      const { data, error } = await expenseService.getExpenses(tripId);

      expect(mockFrom).toHaveBeenCalledWith('expenses');
      expect(mockOr).toHaveBeenCalledWith('is_deleted.is.null,is_deleted.eq.false');
      expect(error).toBeNull();
      expect(data).toHaveLength(2);
      expect(data?.[0].title).toBe('Lunch');
    });

    // SPEC: Returns error string if database query fails
    it('returns error if query fails', async () => {
      const dbError = { message: 'Connection error', code: '500' };
      mockOrder.mockResolvedValueOnce({ data: null, error: dbError });

      const { data, error } = await expenseService.getExpenses(tripId);

      expect(data).toBeNull();
      expect(error).toBeTruthy();
      // Service unwraps error to string via error.message
      expect(error).toBe('Connection error');
    });
  });

  describe('createExpense', () => {
    // SPEC: Creates an expense and returns the created record
    it('creates a new expense successfully', async () => {
      const newExpense = {
        title: 'Hotel',
        amount: 500,
        currency: 'USD',
        paid_by_family_id: 'f1',
        date: '2024-07-04',
        category: 'lodging' as const,
        notes: null,
        receipt_url: null,
      };
      const created = {
        ...newExpense,
        trip_id: tripId,
        paid_by_user_id: 'u1',
        id: expenseId,
        created_at: '2024-07-04T10:00:00Z',
      };
      mockSingle.mockResolvedValueOnce({ data: created, error: null });

      const { data, error } = await expenseService.createExpense(tripId, 'u1', newExpense);

      expect(mockFrom).toHaveBeenCalledWith('expenses');
      expect(error).toBeNull();
      expect(data?.id).toBe(expenseId);
      expect(data?.title).toBe('Hotel');
    });
  });

  describe('updateExpense', () => {
    // SPEC: Updates an expense and returns the updated record
    it('updates an existing expense', async () => {
      const updates = { title: 'Updated Hotel', amount: 450 };
      const updated = { id: expenseId, ...updates };
      mockSingle.mockResolvedValueOnce({ data: updated, error: null });

      const { data, error } = await expenseService.updateExpense(expenseId, updates);

      expect(mockFrom).toHaveBeenCalledWith('expenses');
      expect(error).toBeNull();
      expect(data?.amount).toBe(450);
    });
  });

  describe('deleteExpense', () => {
    // SPEC: Deletes an expense and returns success
    it('deletes an expense by id', async () => {
      mockEq.mockResolvedValueOnce({ data: null, error: null });

      const { error } = await expenseService.deleteExpense(expenseId);

      expect(mockFrom).toHaveBeenCalledWith('expenses');
      expect(error).toBeNull();
    });
  });
});
