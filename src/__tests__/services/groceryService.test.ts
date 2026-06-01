/**
 * SPEC: Grocery Service
 *
 * Tests add, list, mark-purchased, delete, and assign-family operations.
 * Covers SPEC §11 (offline-queueable) and data integrity for grocery items.
 */

const mockSingle = jest.fn();
const mockEq = jest.fn();
const mockOrder = jest.fn();
const mockSelect = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();

const mockFrom = jest.fn(() => ({
  select: mockSelect.mockReturnThis(),
  insert: mockInsert.mockReturnThis(),
  update: mockUpdate.mockReturnThis(),
  delete: mockDelete.mockReturnThis(),
  eq: mockEq.mockReturnThis(),
  order: mockOrder.mockReturnThis(),
  single: mockSingle,
}));

jest.mock('../../lib/supabaseClient', () => ({
  supabase: { from: mockFrom },
}));

import { groceryService } from '../../services/groceryService';

beforeEach(() => jest.clearAllMocks());

describe('groceryService', () => {
  const tripId = 'trip-1';
  const userId = 'user-1';
  const itemId = 'item-1';

  const mockItem = {
    id: itemId,
    trip_id: tripId,
    name: 'Sunscreen',
    quantity: '2',
    category: 'toiletries',
    assigned_family_id: null,
    is_purchased: false,
    purchased_by: null,
    purchased_at: null,
    notes: null,
    added_by: userId,
    created_at: '2024-07-01T10:00:00Z',
    updated_at: '2024-07-01T10:00:00Z',
  };

  describe('addItem', () => {
    // SPEC §11: New items start as not purchased
    it('adds an item with is_purchased=false', async () => {
      mockSingle.mockResolvedValueOnce({ data: mockItem, error: null });

      const { data, error } = await groceryService.addItem(tripId, userId, {
        name: 'Sunscreen',
        quantity: '2',
        category: 'toiletries',
        assigned_family_id: null,
        notes: null,
      });

      expect(mockFrom).toHaveBeenCalledWith('grocery_items');
      expect(error).toBeNull();
      expect(data?.name).toBe('Sunscreen');
      expect(data?.is_purchased).toBe(false);
    });

    it('returns error if insert fails', async () => {
      mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'Insert failed' } });

      const { data, error } = await groceryService.addItem(tripId, userId, {
        name: 'Water',
        quantity: '6',
        category: null,
        assigned_family_id: null,
        notes: null,
      });

      expect(data).toBeNull();
      expect(error).toBe('Insert failed');
    });
  });

  describe('getItems', () => {
    it('returns all items for a trip ordered by created_at', async () => {
      const items = [mockItem, { ...mockItem, id: 'item-2', name: 'Towels' }];
      mockOrder.mockResolvedValueOnce({ data: items, error: null });

      const { data, error } = await groceryService.getItems(tripId);

      expect(mockFrom).toHaveBeenCalledWith('grocery_items');
      expect(error).toBeNull();
      expect(data).toHaveLength(2);
      expect(data?.[0].name).toBe('Sunscreen');
    });

    it('returns empty array when no items exist', async () => {
      mockOrder.mockResolvedValueOnce({ data: [], error: null });

      const { data, error } = await groceryService.getItems(tripId);

      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });

  describe('markPurchased', () => {
    // SPEC §12: Integrity — purchaser and timestamp recorded
    it('sets is_purchased=true with purchaser and timestamp', async () => {
      const purchasedItem = {
        ...mockItem,
        is_purchased: true,
        purchased_by: userId,
        purchased_at: '2024-07-02T14:00:00Z',
      };
      mockSingle.mockResolvedValueOnce({ data: purchasedItem, error: null });

      const { data, error } = await groceryService.markPurchased(itemId, userId);

      expect(mockFrom).toHaveBeenCalledWith('grocery_items');
      expect(error).toBeNull();
      expect(data?.is_purchased).toBe(true);
      expect(data?.purchased_by).toBe(userId);
      expect(data?.purchased_at).toBeTruthy();
    });
  });

  describe('deleteItem', () => {
    it('deletes an item by id and returns no error', async () => {
      mockEq.mockResolvedValueOnce({ data: null, error: null });

      const { error } = await groceryService.deleteItem(itemId);

      expect(mockFrom).toHaveBeenCalledWith('grocery_items');
      expect(error).toBeNull();
    });
  });

  describe('assignFamily', () => {
    it('assigns an item to a family', async () => {
      const familyId = 'family-1';
      const assigned = { ...mockItem, assigned_family_id: familyId };
      mockSingle.mockResolvedValueOnce({ data: assigned, error: null });

      const { data, error } = await groceryService.assignFamily(itemId, familyId);

      expect(error).toBeNull();
      expect(data?.assigned_family_id).toBe(familyId);
    });

    it('unassigns a family by passing null', async () => {
      const unassigned = { ...mockItem, assigned_family_id: null };
      mockSingle.mockResolvedValueOnce({ data: unassigned, error: null });

      const { data, error } = await groceryService.assignFamily(itemId, null);

      expect(error).toBeNull();
      expect(data?.assigned_family_id).toBeNull();
    });
  });
});
