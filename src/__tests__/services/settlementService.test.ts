/**
 * SPEC: Settlement Service
 *
 * Tests the settlement payment tracking service.
 */

const mockSingle = jest.fn();
const mockEq = jest.fn();
const mockOrder = jest.fn();
const mockSelect = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();

const mockFrom = jest.fn(() => ({
  select: mockSelect.mockReturnThis(),
  insert: mockInsert.mockReturnThis(),
  update: mockUpdate.mockReturnThis(),
  eq: mockEq.mockReturnThis(),
  order: mockOrder.mockReturnThis(),
  single: mockSingle,
}));

jest.mock('../../lib/supabaseClient', () => ({
  supabase: { from: mockFrom },
}));

import { settlementService } from '../../services/settlementService';

beforeEach(() => jest.clearAllMocks());

describe('settlementService', () => {
  const tripId = 'trip-1';

  describe('getSettlements', () => {
    // SPEC: Returns all settlements for a trip
    it('returns settlements for a trip', async () => {
      const mockData = [
        {
          id: 's1',
          trip_id: tripId,
          from_family_id: 'f2',
          to_family_id: 'f1',
          amount: 185,
          currency: 'USD',
          status: 'pending',
        },
      ];
      mockOrder.mockResolvedValueOnce({ data: mockData, error: null });

      const { data, error } = await settlementService.getSettlements(tripId);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data?.[0].amount).toBe(185);
      expect(data?.[0].status).toBe('pending');
    });
  });

  describe('updatePaymentStatus', () => {
    // SPEC: Payer can mark payment as 'paid'
    it('updates payment status to paid', async () => {
      const updated = { id: 's1', status: 'paid', paid_at: new Date().toISOString() };
      mockSingle.mockResolvedValueOnce({ data: updated, error: null });

      const { data, error } = await settlementService.updatePaymentStatus('s1', 'paid');

      expect(error).toBeNull();
      expect(data?.status).toBe('paid');
    });

    // SPEC: Receiver can confirm payment
    it('updates payment status to confirmed', async () => {
      const updated = { id: 's1', status: 'confirmed', confirmed_at: new Date().toISOString() };
      mockSingle.mockResolvedValueOnce({ data: updated, error: null });

      const { data, error } = await settlementService.updatePaymentStatus('s1', 'confirmed');

      expect(error).toBeNull();
      expect(data?.status).toBe('confirmed');
    });

    // SPEC: Payment can be disputed
    it('updates payment status to disputed', async () => {
      const updated = { id: 's1', status: 'disputed' };
      mockSingle.mockResolvedValueOnce({ data: updated, error: null });

      const { data, error } = await settlementService.updatePaymentStatus('s1', 'disputed');

      expect(error).toBeNull();
      expect(data?.status).toBe('disputed');
    });
  });
});
