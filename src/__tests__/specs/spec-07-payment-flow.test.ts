/**
 * SPEC §7 — Payment Status Flow
 *
 * pending → paid    (payer action)
 * paid    → confirmed (receiver action)
 * paid    → disputed  (receiver action)
 * disputed → paid   (payer re-submits)
 *
 * createSettlement always starts as 'pending'.
 * confirmed_at is set when status becomes 'confirmed'.
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

import { settlementService } from '../../services/settlementService';

beforeEach(() => jest.clearAllMocks());

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
    ...extra,
  };
}

// ─── createSettlement always starts as pending ────────────────────────────────

describe('SPEC §7 — createSettlement starts as pending', () => {
  it('new settlement has status = pending', async () => {
    const pending = makeSettlement('pending');
    mockSingle.mockResolvedValueOnce({ data: pending, error: null });

    const { data } = await settlementService.createSettlement(tripId, {
      from_family_id: 'fam-a',
      to_family_id: 'fam-b',
      amount: 150,
      currency: 'USD',
      notes: undefined,
    });

    // Verify 'pending' was inserted
    const insertCalls = (mockInsert as jest.Mock).mock.calls;
    expect(insertCalls.some((args) => args[0]?.status === 'pending')).toBe(true);
    expect(data?.status).toBe('pending');
  });

  it('rejects settlements where a family pays itself', async () => {
    const { data, error } = await settlementService.createSettlement(tripId, {
      from_family_id: 'fam-a',
      to_family_id: 'fam-a',
      amount: 150,
      currency: 'USD',
      notes: undefined,
    });

    expect(data).toBeNull();
    expect(error).toBe('A family cannot pay themselves');
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

// ─── pending → paid ───────────────────────────────────────────────────────────

describe('SPEC §7 — pending → paid (payer action)', () => {
  it('updates status to paid', async () => {
    const paid = makeSettlement('paid');
    mockSingle.mockResolvedValueOnce({ data: { status: 'pending' }, error: null });
    mockSingle.mockResolvedValueOnce({ data: paid, error: null });

    const { data, error } = await settlementService.updatePaymentStatus(settlementId, 'paid');

    expect(error).toBeNull();
    expect(data?.status).toBe('paid');
  });

  it('does not set confirmed_at when marking as paid', async () => {
    const paid = makeSettlement('paid');
    mockSingle.mockResolvedValueOnce({ data: { status: 'pending' }, error: null });
    mockSingle.mockResolvedValueOnce({ data: paid, error: null });

    await settlementService.updatePaymentStatus(settlementId, 'paid');

    const updateCalls = (mockUpdate as jest.Mock).mock.calls;
    const payload = updateCalls[0]?.[0];
    expect(payload?.confirmed_at).toBeUndefined();
  });

  it('rejects pending → confirmed', async () => {
    mockSingle.mockResolvedValueOnce({ data: { status: 'pending' }, error: null });

    const { data, error } = await settlementService.updatePaymentStatus(settlementId, 'confirmed');

    expect(data).toBeNull();
    expect(error).toBe('Invalid payment status transition: pending to confirmed');
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

// ─── paid → confirmed ─────────────────────────────────────────────────────────

describe('SPEC §7 — paid → confirmed (receiver action)', () => {
  it('updates status to confirmed', async () => {
    const confirmed = makeSettlement('confirmed', { confirmed_at: new Date().toISOString() });
    mockSingle.mockResolvedValueOnce({ data: { status: 'paid' }, error: null });
    mockSingle.mockResolvedValueOnce({ data: confirmed, error: null });

    const { data, error } = await settlementService.updatePaymentStatus(settlementId, 'confirmed');

    expect(error).toBeNull();
    expect(data?.status).toBe('confirmed');
  });

  it('sets confirmed_at timestamp when confirming', async () => {
    const confirmed = makeSettlement('confirmed', { confirmed_at: '2024-08-05T10:00:00Z' });
    mockSingle.mockResolvedValueOnce({ data: { status: 'paid' }, error: null });
    mockSingle.mockResolvedValueOnce({ data: confirmed, error: null });

    await settlementService.updatePaymentStatus(settlementId, 'confirmed');

    const updateCalls = (mockUpdate as jest.Mock).mock.calls;
    const payload = updateCalls[0]?.[0];
    expect(payload?.confirmed_at).toBeDefined();
    expect(typeof payload?.confirmed_at).toBe('string');
  });

  it('confirmPayment() is a convenience alias for confirmed', async () => {
    const confirmed = makeSettlement('confirmed', { confirmed_at: new Date().toISOString() });
    mockSingle.mockResolvedValueOnce({ data: { status: 'paid' }, error: null });
    mockSingle.mockResolvedValueOnce({ data: confirmed, error: null });

    const { data } = await settlementService.confirmPayment(settlementId);

    expect(data?.status).toBe('confirmed');
  });
});

// ─── paid → disputed ──────────────────────────────────────────────────────────

describe('SPEC §7 — paid → disputed (receiver action)', () => {
  it('updates status to disputed', async () => {
    const disputed = makeSettlement('disputed');
    mockSingle.mockResolvedValueOnce({ data: { status: 'paid' }, error: null });
    mockSingle.mockResolvedValueOnce({ data: disputed, error: null });

    const { data, error } = await settlementService.updatePaymentStatus(settlementId, 'disputed');

    expect(error).toBeNull();
    expect(data?.status).toBe('disputed');
  });

  it('does not set confirmed_at when disputing', async () => {
    const disputed = makeSettlement('disputed');
    mockSingle.mockResolvedValueOnce({ data: { status: 'paid' }, error: null });
    mockSingle.mockResolvedValueOnce({ data: disputed, error: null });

    await settlementService.updatePaymentStatus(settlementId, 'disputed');

    const updateCalls = (mockUpdate as jest.Mock).mock.calls;
    const payload = updateCalls[0]?.[0];
    expect(payload?.confirmed_at).toBeUndefined();
  });
});

// ─── disputed → paid ──────────────────────────────────────────────────────────

describe('SPEC §7 — disputed → paid (payer re-submits)', () => {
  it('allows re-marking a disputed settlement as paid', async () => {
    const repaid = makeSettlement('paid');
    mockSingle.mockResolvedValueOnce({ data: { status: 'disputed' }, error: null });
    mockSingle.mockResolvedValueOnce({ data: repaid, error: null });

    const { data, error } = await settlementService.updatePaymentStatus(settlementId, 'paid');

    expect(error).toBeNull();
    expect(data?.status).toBe('paid');
  });
});

// ─── getSettlements ───────────────────────────────────────────────────────────

describe('SPEC §7 — getSettlements', () => {
  it('returns all settlements for a trip', async () => {
    const settlements = [makeSettlement('pending'), makeSettlement('confirmed')];
    mockOrder.mockResolvedValueOnce({ data: settlements, error: null });

    const { data, error } = await settlementService.getSettlements(tripId);

    expect(error).toBeNull();
    expect(data).toHaveLength(2);
  });
});
