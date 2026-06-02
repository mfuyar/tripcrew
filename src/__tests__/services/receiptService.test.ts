const mockSingle = jest.fn();
const mockEq = jest.fn();
const mockSelect = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();

const mockFrom = jest.fn(() => ({
  insert: mockInsert.mockReturnThis(),
  update: mockUpdate.mockReturnThis(),
  eq: mockEq.mockReturnThis(),
  select: mockSelect.mockReturnThis(),
  single: mockSingle,
}));

const mockUpload = jest.fn();
const mockGetPublicUrl = jest.fn();
const mockStorageFrom = jest.fn(() => ({
  upload: mockUpload,
  getPublicUrl: mockGetPublicUrl,
}));

const mockInvoke = jest.fn();

jest.mock('../../lib/supabaseClient', () => ({
  supabase: {
    from: mockFrom,
    storage: { from: mockStorageFrom },
    functions: { invoke: mockInvoke },
  },
}));

jest.mock('expo-file-system', () => ({
  File: class MockFile {
    uri: string;
    type = 'image/jpeg';

    constructor(uri: string) {
      this.uri = uri;
    }
  },
}));

import { receiptService } from '../../services/receiptService';

beforeEach(() => jest.clearAllMocks());

const tripId = 'trip-1';
const userId = 'user-1';
const receiptId = 'receipt-1';
const imageUrl = 'https://storage.example.com/receipts/trip-1/user-1/123.jpg';

function makeReceipt(overrides: Record<string, unknown> = {}) {
  return {
    id: receiptId,
    trip_id: tripId,
    scanned_by: userId,
    image_url: imageUrl,
    raw_text: null,
    parsed_amount: null,
    parsed_merchant: null,
    parsed_date: null,
    parsed_items: null,
    expense_id: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('receiptService', () => {
  describe('uploadReceipt', () => {
    it('uploads receipt image and creates a receipt scan record', async () => {
      mockUpload.mockResolvedValueOnce({ error: null });
      mockGetPublicUrl.mockReturnValueOnce({ data: { publicUrl: imageUrl } });
      mockSingle.mockResolvedValueOnce({ data: makeReceipt(), error: null });

      const { data, error } = await receiptService.uploadReceipt(
        tripId,
        userId,
        'file:///receipt.jpg'
      );

      expect(mockStorageFrom).toHaveBeenCalledWith('trip-media');
      expect(mockUpload).toHaveBeenCalled();
      expect(mockFrom).toHaveBeenCalledWith('receipt_scans');
      expect(error).toBeNull();
      expect(data?.image_url).toBe(imageUrl);
    });

    it('returns upload errors', async () => {
      mockUpload.mockResolvedValueOnce({ error: { message: 'Upload failed' } });

      const { data, error } = await receiptService.uploadReceipt(
        tripId,
        userId,
        'file:///receipt.jpg'
      );

      expect(data).toBeNull();
      expect(error).toBe('Upload failed');
    });
  });

  describe('scanReceipt', () => {
    it('invokes the Gemini receipt scan function', async () => {
      const scanned = makeReceipt({
        parsed_amount: 42.5,
        parsed_merchant: 'Market',
        parsed_date: '2026-06-02',
      });
      mockInvoke.mockResolvedValueOnce({ data: { data: scanned }, error: null });

      const { data, error } = await receiptService.scanReceipt(receiptId, imageUrl);

      expect(mockInvoke).toHaveBeenCalledWith('scan-receipt', {
        body: { receiptId, imageUrl },
      });
      expect(error).toBeNull();
      expect(data?.parsed_merchant).toBe('Market');
    });

    it('returns function errors', async () => {
      mockInvoke.mockResolvedValueOnce({
        data: { error: 'GEMINI_API_KEY is not configured' },
        error: null,
      });

      const { data, error } = await receiptService.scanReceipt(receiptId, imageUrl);

      expect(data).toBeNull();
      expect(error).toBe('GEMINI_API_KEY is not configured');
    });
  });
});
