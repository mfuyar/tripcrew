const mockSingle = jest.fn();
const mockEq = jest.fn();
const mockSelect = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockResize = jest.fn().mockReturnThis();
const mockReset = jest.fn().mockReturnThis();
const mockRenderAsync = jest.fn();
const mockSaveAsync = jest.fn();
const mockManipulateAsync = jest.fn();

const mockFrom = jest.fn(() => ({
  insert: mockInsert.mockReturnThis(),
  update: mockUpdate.mockReturnThis(),
  eq: mockEq.mockReturnThis(),
  select: mockSelect.mockReturnThis(),
  single: mockSingle,
}));

const mockGetSession = jest.fn();
const mockGetPublicUrl = jest.fn();
const mockStorageFrom = jest.fn(() => ({
  getPublicUrl: mockGetPublicUrl,
}));

const mockExpoFetch = jest.fn();

jest.mock('../../lib/supabaseClient', () => ({
  supabaseUrl: 'https://project.supabase.co',
  supabaseAnonKey: 'anon-key',
  supabase: {
    auth: { getSession: mockGetSession },
    from: mockFrom,
    storage: { from: mockStorageFrom },
  },
}));

jest.mock('expo-file-system', () => ({
  File: class MockFile {
    uri: string;
    type = 'image/jpeg';
    size = 12345;

    constructor(uri: string) {
      this.uri = uri;
    }

    base64() {
      return Promise.resolve(`base64:${this.uri}`);
    }
  },
}));

jest.mock('expo/fetch', () => ({
  fetch: mockExpoFetch,
}));

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: mockManipulateAsync,
  ImageManipulator: {
    manipulate: jest.fn(() => ({
      renderAsync: mockRenderAsync,
      reset: mockReset,
      resize: mockResize,
    })),
  },
  SaveFormat: { JPEG: 'jpeg' },
}));

import { receiptService } from '../../services/receiptService';

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = mockExpoFetch as unknown as typeof fetch;
  mockGetSession.mockResolvedValue({ data: { session: { access_token: 'user-token' } } });
  mockManipulateAsync.mockResolvedValue({ uri: 'file:///cache/compressed-receipt.jpg' });
  mockRenderAsync
    .mockResolvedValueOnce({ width: 3024, height: 4032 })
    .mockResolvedValueOnce({ saveAsync: mockSaveAsync });
  mockSaveAsync.mockResolvedValue({ uri: 'file:///cache/compressed-receipt.jpg' });
});

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
    it('sends compressed receipt image to the scan function', async () => {
      mockExpoFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: makeReceipt() }),
      });

      const { data, error } = await receiptService.uploadReceipt(
        tripId,
        userId,
        'file:///receipt.jpg'
      );

      expect(mockExpoFetch).toHaveBeenCalledWith(
        'https://project.supabase.co/functions/v1/scan-receipt',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer user-token',
            apikey: 'anon-key',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            tripId,
            userId,
            imageBase64: 'base64:file:///cache/compressed-receipt.jpg',
            mimeType: 'image/jpeg',
          }),
        })
      );
      expect(mockManipulateAsync).toHaveBeenCalledWith(
        'file:///receipt.jpg',
        [{ resize: { width: 1600 } }],
        { compress: 0.82, format: 'jpeg' }
      );
      expect(error).toBeNull();
      expect(data?.image_url).toBe(imageUrl);
    });

    it('returns scan upload errors', async () => {
      mockExpoFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Upload failed' }),
      });

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
    it('requires a signed-in user before calling the scan function', async () => {
      mockGetSession.mockResolvedValueOnce({ data: { session: null } });

      const { data, error } = await receiptService.scanReceipt(receiptId, imageUrl);

      expect(mockExpoFetch).not.toHaveBeenCalled();
      expect(data).toBeNull();
      expect(error).toBe('You must be signed in to scan receipts.');
    });

    it('invokes the Gemini receipt scan function', async () => {
      const scanned = makeReceipt({
        parsed_amount: 42.5,
        parsed_merchant: 'Market',
        parsed_date: '2026-06-02',
      });
      mockExpoFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: scanned }),
      });

      const { data, error } = await receiptService.scanReceipt(receiptId, imageUrl);

      expect(mockExpoFetch).toHaveBeenCalledWith(
        'https://project.supabase.co/functions/v1/scan-receipt',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer user-token',
            apikey: 'anon-key',
          }),
          body: JSON.stringify({ receiptId }),
        })
      );
      expect(error).toBeNull();
      expect(data?.parsed_merchant).toBe('Market');
    });

    it('returns an error when the scan function returns no receipt data', async () => {
      mockExpoFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: null }),
      });

      const { data, error } = await receiptService.scanReceipt(receiptId, imageUrl);

      expect(data).toBeNull();
      expect(error).toBe('Receipt scan returned no data');
    });

    it('returns function errors', async () => {
      mockExpoFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'GEMINI_API_KEY is not configured' }),
      });

      const { data, error } = await receiptService.scanReceipt(receiptId, imageUrl);

      expect(data).toBeNull();
      expect(error).toBe('GEMINI_API_KEY is not configured');
    });

    it('returns clear rejected-receipt messages from the scan function', async () => {
      mockExpoFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({
          error: 'This image does not look like a valid receipt. Please add this expense manually and attach the compressed photo there if you still want to keep it.',
        }),
      });

      const { data, error } = await receiptService.scanReceipt(receiptId, imageUrl);

      expect(data).toBeNull();
      expect(error).toContain('does not look like a valid receipt');
      expect(error).toContain('add this expense manually');
    });
  });
});
