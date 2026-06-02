import { supabase } from '../lib/supabaseClient';
import { ReceiptScan, ServiceResult } from '../types';

export const receiptService = {
  async uploadReceipt(
    tripId: string,
    userId: string,
    imageUri: string
  ): Promise<ServiceResult<ReceiptScan>> {
    // Upload image to storage
    const response = await fetch(imageUri);
    const blob = await response.blob();
    const fileName = `receipts/${tripId}/${userId}/${Date.now()}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from('trip-media')
      .upload(fileName, blob, { contentType: 'image/jpeg' });

    if (uploadError) return { data: null, error: uploadError.message };

    const { data: urlData } = supabase.storage
      .from('trip-media')
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
