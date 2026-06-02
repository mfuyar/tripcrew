import { File } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import { supabase, supabaseAnonKey, supabaseUrl } from '../lib/supabaseClient';
import { ReceiptScan, ServiceResult } from '../types';

const RECEIPT_BUCKET = 'trip-media';

export const receiptService = {
  async uploadReceipt(
    tripId: string,
    userId: string,
    imageUri: string
  ): Promise<ServiceResult<ReceiptScan>> {
    // Upload image to storage
    const file = new File(imageUri);
    const fileName = `receipts/${tripId}/${userId}/${Date.now()}.jpg`;
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token ?? supabaseAnonKey;

    const uploadResponse = await expoFetch(
      `${supabaseUrl}/storage/v1/object/${RECEIPT_BUCKET}/${fileName}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: supabaseAnonKey,
          'Content-Type': file.type || 'image/jpeg',
          'x-upsert': 'false',
        },
        body: file,
      }
    );

    if (!uploadResponse.ok) {
      const uploadError = await uploadResponse.text();
      return { data: null, error: uploadError || 'Receipt upload failed' };
    }

    const { data: urlData } = supabase.storage
      .from(RECEIPT_BUCKET)
      .getPublicUrl(fileName);

    // Create receipt record
    const { data, error } = await supabase
      .from('receipt_scans')
      .insert({
        trip_id: tripId,
        scanned_by: userId,
        image_url: urlData.publicUrl,
      })
      .select()
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as ReceiptScan, error: null };
  },

  async scanReceipt(receiptId: string, imageUrl: string): Promise<ServiceResult<ReceiptScan>> {
    const { data, error } = await supabase.functions.invoke('scan-receipt', {
      body: { receiptId, imageUrl },
    });

    if (error) return { data: null, error: error.message };
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
};
