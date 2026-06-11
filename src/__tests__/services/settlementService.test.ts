/**
 * SPEC: Settlement Service
 *
 * Tests the settlement payment tracking service.
 */

const mockSingle = jest.fn();
const mockEq = jest.fn();
const mockIs = jest.fn();
const mockIn = jest.fn();
const mockOrder = jest.fn();
const mockSelect = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();

const mockFrom = jest.fn(() => ({
  select: mockSelect.mockReturnThis(),
  insert: mockInsert.mockReturnThis(),
  update: mockUpdate.mockReturnThis(),
  eq: mockEq.mockReturnThis(),
  is: mockIs.mockReturnThis(),
  in: mockIn.mockReturnThis(),
  order: mockOrder.mockReturnThis(),
  single: mockSingle,
}));

jest.mock('../../lib/supabaseClient', () => ({
  supabase: { from: mockFrom },
}));

const mockNotifyUsers = jest.fn();
const mockNotifyTripMembers = jest.fn();
jest.mock('../../services/notificationService', () => ({
  notificationService: {
    notifyUsers: mockNotifyUsers,
    notifyTripMembers: mockNotifyTripMembers,
  },
}));

import { settlementService } from '../../services/settlementService';

beforeEach(() => {
  jest.clearAllMocks();
  mockSelect.mockReturnThis();
  mockInsert.mockReturnThis();
  mockUpdate.mockReturnThis();
  mockEq.mockReturnThis();
  mockIs.mockReturnThis();
  mockIn.mockReturnThis();
  mockOrder.mockReturnThis();
  mockNotifyUsers.mockResolvedValue({ data: [], error: null });
  mockNotifyTripMembers.mockResolvedValue({ data: [], error: null });
});

describe('settlementService', () => {
  const tripId = 'trip-1';

  describe('recordSettlement', () => {
    it('creates a pending family settlement request', async () => {
      const completed = {
        id: 's1',
        trip_id: tripId,
        from_family_id: 'f1',
        to_family_id: 'f2',
        amount: 10,
        currency: 'USD',
        status: 'proposed',
        from_family: { id: 'f1', name: 'Alpha' },
        to_family: { id: 'f2', name: 'Beta' },
      };
      mockSingle.mockResolvedValueOnce({ data: completed, error: null });
      mockIn.mockResolvedValueOnce({ data: [{ user_id: 'payer-1' }, { user_id: 'receiver-1' }], error: null });

      const { data, error } = await settlementService.createFamilySettlementRequest(
        tripId,
        'f1',
        'f2',
        10,
        'USD',
        undefined,
        'user-1'
      );

      const payload = (mockInsert as jest.Mock).mock.calls[0]?.[0];
      expect(error).toBeNull();
      expect(payload.status).toBe('proposed');
      expect(payload.settlement_type).toBe('family');
      expect(data?.status).toBe('proposed');
      expect(mockNotifyUsers).toHaveBeenCalledWith(
        expect.any(Array),
        tripId,
        'settlement_request',
        '💸 Settlement requested',
        'Alpha should pay Beta $10.00. Please confirm after payment.',
        expect.objectContaining({ event: 'settlement_requested' })
      );
    });

    it('rejects self-settlements', async () => {
      const { data, error } = await settlementService.recordSettlement(
        tripId,
        'f1',
        'f1',
        10,
        'USD',
        undefined,
        'f1'
      );

      expect(data).toBeNull();
      expect(error).toBe('A family cannot pay themselves');
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('keeps createProposal compatible by creating a pending request', async () => {
      const completed = {
        id: 's1',
        trip_id: tripId,
        from_family_id: 'f1',
        to_family_id: 'f2',
        amount: 20,
        currency: 'USD',
        status: 'proposed',
      };
      mockSingle.mockResolvedValueOnce({ data: completed, error: null });

      const { data, error } = await settlementService.createProposal(
        tripId,
        'f1',
        'f2',
        20,
        'USD',
        undefined,
        'f1',
        'user-1'
      );

      const payload = (mockInsert as jest.Mock).mock.calls[0]?.[0];
      expect(error).toBeNull();
      expect(payload.status).toBe('proposed');
      expect(data?.status).toBe('proposed');
    });
  });

  describe('confirmations', () => {
    it('payer confirmation moves to payer_approved', async () => {
      const updated = { id: 's1', trip_id: tripId, status: 'payer_approved', payer_family_approved_at: new Date().toISOString() };
      mockSingle.mockResolvedValueOnce({ data: { receiver_family_approved_at: null }, error: null });
      mockSingle.mockResolvedValueOnce({ data: updated, error: null });

      const { data, error } = await settlementService.confirmAsPayer('s1', 'user-1');

      const payload = (mockUpdate as jest.Mock).mock.calls[0]?.[0];
      expect(error).toBeNull();
      expect(payload.status).toBe('payer_approved');
      expect(data?.status).toBe('payer_approved');
    });

    it('receiver confirmation after payer moves to confirmed', async () => {
      const updated = { id: 's1', trip_id: tripId, status: 'confirmed', receiver_family_approved_at: new Date().toISOString() };
      mockSingle.mockResolvedValueOnce({ data: { payer_family_approved_at: new Date().toISOString() }, error: null });
      mockSingle.mockResolvedValueOnce({ data: updated, error: null });

      const { data, error } = await settlementService.confirmAsReceiver('s1', 'user-2');

      const payload = (mockUpdate as jest.Mock).mock.calls[0]?.[0];
      expect(error).toBeNull();
      expect(payload.status).toBe('confirmed');
      expect(data?.status).toBe('confirmed');
    });

    it('organizer closes confirmed settlement', async () => {
      const closed = { id: 's1', trip_id: tripId, status: 'completed', amount: 20, currency: 'USD' };
      mockSingle.mockResolvedValueOnce({ data: closed, error: null });
      mockIn.mockResolvedValueOnce({ data: [], error: null });

      const { data, error } = await settlementService.closeSettlement('s1', 'organizer-1');

      const payload = (mockUpdate as jest.Mock).mock.calls[0]?.[0];
      expect(error).toBeNull();
      expect(payload.status).toBe('completed');
      expect(payload.closed_at).toEqual(expect.any(String));
      expect(data?.status).toBe('completed');
    });
  });

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
          status: 'completed',
        },
      ];
      mockOrder.mockResolvedValueOnce({ data: mockData, error: null });

      const { data, error } = await settlementService.getSettlements(tripId);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data?.[0].amount).toBe(185);
      expect(data?.[0].status).toBe('completed');
    });
  });
});
