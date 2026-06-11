/**
 * SPEC §7 — Organizer Settlement Records
 *
 * The trip organizer creates settlement requests, involved parties confirm
 * payment/receipt, and the organizer closes the settlement.
 */

const mockSingle = jest.fn();
const mockEq = jest.fn();
const mockIs = jest.fn();
const mockIn = jest.fn();
const mockOr = jest.fn();
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
  is: mockIs.mockReturnThis(),
  in: mockIn.mockReturnThis(),
  or: mockOr.mockReturnThis(),
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
  mockDelete.mockReturnThis();
  mockEq.mockReturnThis();
  mockIs.mockReturnThis();
  mockIn.mockReturnThis();
  mockOr.mockReturnThis();
  mockOrder.mockReturnThis();
  mockNotifyUsers.mockResolvedValue({ data: [], error: null });
  mockNotifyTripMembers.mockResolvedValue({ data: [], error: null });
});

const tripId = 'trip-1';
const settlementId = 'sett-1';

function makeSettlement(status: string, extra: Record<string, unknown> = {}) {
  return {
    id: settlementId,
    trip_id: tripId,
    from_family_id: 'fam-a',
    to_family_id: 'fam-b',
    amount: 150,
    currency: 'USD',
    status,
    from_family: { id: 'fam-a', name: 'Alpha Family' },
    to_family: { id: 'fam-b', name: 'Beta Family' },
    ...extra,
  };
}

describe('SPEC §7 — organizer settlement records', () => {
  it('creates family settlement as a pending request', async () => {
    const proposed = makeSettlement('proposed');
    mockSingle.mockResolvedValueOnce({ data: proposed, error: null });
    mockIn.mockResolvedValueOnce({ data: [{ user_id: 'payer-1' }, { user_id: 'receiver-1' }], error: null });

    const { data, error } = await settlementService.createFamilySettlementRequest(
      tripId,
      'fam-a',
      'fam-b',
      150,
      'USD',
      undefined,
      'organizer-1'
    );

    const payload = (mockInsert as jest.Mock).mock.calls[0]?.[0];
    expect(error).toBeNull();
    expect(payload.status).toBe('proposed');
    expect(payload.settlement_type).toBe('family');
    expect(data?.status).toBe('proposed');
  });

  it('rejects settlements where a family pays itself', async () => {
    const { data, error } = await settlementService.createFamilySettlementRequest(
      tripId,
      'fam-a',
      'fam-a',
      150,
      'USD',
      undefined,
      'organizer-1'
    );

    expect(data).toBeNull();
    expect(error).toBe('A family cannot pay themselves');
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('stores cancellation reason', async () => {
    const cancelled = makeSettlement('cancelled', { cancel_reason: 'Duplicate' });
    mockSingle.mockResolvedValueOnce({ data: cancelled, error: null });

    const { data, error } = await settlementService.cancel(settlementId, 'Duplicate', 'organizer-1');

    const payload = (mockUpdate as jest.Mock).mock.calls[0]?.[0];
    expect(error).toBeNull();
    expect(payload.status).toBe('cancelled');
    expect(payload.cancel_reason).toBe('Duplicate');
    expect(data?.status).toBe('cancelled');
  });

  it('payer and receiver confirmations make settlement ready to close', async () => {
    mockSingle.mockResolvedValueOnce({ data: { receiver_family_approved_at: null }, error: null });
    mockSingle.mockResolvedValueOnce({ data: makeSettlement('payer_approved'), error: null });

    const payer = await settlementService.confirmAsPayer(settlementId, 'payer-1');
    expect(payer.error).toBeNull();
    expect((mockUpdate as jest.Mock).mock.calls[0]?.[0].status).toBe('payer_approved');

    mockSingle.mockResolvedValueOnce({ data: { payer_family_approved_at: new Date().toISOString() }, error: null });
    mockSingle.mockResolvedValueOnce({ data: makeSettlement('confirmed'), error: null });

    const receiver = await settlementService.confirmAsReceiver(settlementId, 'receiver-1');
    expect(receiver.error).toBeNull();
    expect((mockUpdate as jest.Mock).mock.calls[1]?.[0].status).toBe('confirmed');
  });

  it('organizer closes confirmed settlement', async () => {
    mockSingle.mockResolvedValueOnce({ data: makeSettlement('completed'), error: null });
    mockIn.mockResolvedValueOnce({ data: [], error: null });

    const { data, error } = await settlementService.closeSettlement(settlementId, 'organizer-1');

    expect(error).toBeNull();
    expect((mockUpdate as jest.Mock).mock.calls[0]?.[0].status).toBe('completed');
    expect(data?.status).toBe('completed');
  });

  it('sends manual notification to involved families', async () => {
    const completed = makeSettlement('completed');
    mockSingle.mockResolvedValueOnce({ data: completed, error: null });
    mockIn.mockResolvedValueOnce({ data: [{ user_id: 'payer-1' }, { user_id: 'receiver-1' }], error: null });

    const { error } = await settlementService.sendSettlementNotification(settlementId, 'organizer-1');

    expect(error).toBeNull();
    expect(mockNotifyUsers).toHaveBeenCalledWith(
      expect.arrayContaining(['payer-1', 'receiver-1']),
      tripId,
      'settlement_request',
      '💸 Settlement update',
      'Alpha Family should pay Beta Family $150.00. Please confirm after payment.',
      expect.objectContaining({ event: 'settlement_notification' })
    );
  });

  it('returns settlement records for a trip', async () => {
    const settlements = [makeSettlement('completed'), makeSettlement('cancelled')];
    mockOrder.mockResolvedValueOnce({ data: settlements, error: null });

    const { data, error } = await settlementService.getSettlements(tripId);

    expect(error).toBeNull();
    expect(data).toHaveLength(2);
  });
});
