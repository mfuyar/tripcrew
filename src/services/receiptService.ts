import * as FileSystem from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { supabase, supabaseAnonKey, supabaseUrl } from '../lib/supabaseClient';
import { ReceiptScan, ServiceResult } from '../types';

const MAX_RECEIPT_DIM = 1600;
const RECEIPT_QUALITY = 0.82;

async function prepareBase64(uri: string): Promise<{ base64: string; mimeType: string }> {
  try {
    const resized = await manipulateAsync(
      uri,
      [{ resize: { width: MAX_RECEIPT_DIM } }],
      { compress: RECEIPT_QUALITY, format: SaveFormat.JPEG }
    );
    const base64 = await FileSystem.readAsStringAsync(resized.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return { base64, mimeType: 'image/jpeg' };
  } catch {
    // Fall back to original
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpeg';
    return { base64, mimeType: ext === 'png' ? 'image/png' : 'image/jpeg' };
  }
}

export const receiptService = {
  /**
   * Upload receipt image and run OCR in one call.
   * Sends base64 directly to the Edge Function — no signed URL dependency.
   */
  async uploadReceipt(
    tripId: string,
    userId: string,
    imageUri: string
  ): Promise<ServiceResult<ReceiptScan>> {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return { data: null, error: 'You must be signed in to scan receipts.' };

    // Prepare image as base64 locally
    let imageData: { base64: string; mimeType: string };
    try {
      imageData = await prepareBase64(imageUri);
    } catch (e: any) {
      return { data: null, error: e?.message ?? 'Could not read receipt image.' };
    }

    // Send to Edge Function — OCR + DB record creation in one step
    const response = await fetch(`${supabaseUrl}/functions/v1/scan-receipt`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tripId,
        userId,
        imageBase64: imageData.base64,
        mimeType: imageData.mimeType,
      }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return { data: null, error: data?.error ?? 'Receipt scan failed. Please try again.' };
    }
    if (data?.error) return { data: null, error: data.error };
    if (!data?.data) return { data: null, error: 'Receipt scan returned no data.' };

    return { data: data.data as ReceiptScan, error: null };
  },

  /** Legacy: call scan separately if receipt was already uploaded */
  async scanReceipt(receiptId: string, _imageUrl: string): Promise<ServiceResult<ReceiptScan>> {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return { data: null, error: 'You must be signed in to scan receipts.' };

    const response = await fetch(`${supabaseUrl}/functions/v1/scan-receipt`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ receiptId }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) return { data: null, error: data?.error ?? 'Receipt scan failed' };
    if (data?.error) return { data: null, error: data.error };
    if (!data?.data) return { data: null, error: 'Receipt scan returned no data' };
    return { data: data.data as ReceiptScan, error: null };
  },

  async attachToExpense(
    receiptId: string,
    expenseId: string
  ): Promise<ServiceResult<ReceiptScan>> {
    const { data, error } = await supabase
      .from('receipt_scans')
      .update({ expense_id: expenseId })
      .eq('id', receiptId)
      .select()
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as ReceiptScan, error: null };
  },

  async getReceiptsForExpense(expenseId: string): Promise<ServiceResult<ReceiptScan[]>> {
    const { data, error } = await supabase
      .from('receipt_scans')
      .select('*')
      .eq('expense_id', expenseId)
      .order('created_at', { ascending: false });
    if (error) return { data: null, error: error.message };
    return { data: data as ReceiptScan[], error: null };
  },
};
