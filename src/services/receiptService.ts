import { supabase } from '../lib/supabaseClient';
import { ReceiptScan, ReceiptLineItem, ServiceResult } from '../types';

// TODO: Replace with a real OCR API (e.g. Google Vision API, AWS Textract)
// This function simulates receipt parsing for MVP purposes
function mockParseReceipt(imageUri: string): {
  amount: number;
  merchant: string;
  date: string;
  items: ReceiptLineItem[];
} {
  return {
    amount: Math.round(Math.random() * 200 * 100) / 100,
    merchant: 'Sample Store',
    date: new Date().toISOString().split('T')[0],
    items: [
      { description: 'Item 1', amount: 12.99 },
      { description: 'Item 2', amount: 8.50 },
      { description: 'Item 3', amount: 5.25 },
    ],
  };
}

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

  // TODO: Integrate with a real OCR service for production
  async scanReceiptPlaceholder(
    receiptId: string,
    imageUri: string
  ): Promise<ServiceResult<ReceiptScan>> {
    const parsed = mockParseReceipt(imageUri);
    const { data, error } = await supabase
      .from('receipt_scans')
      .update({
        parsed_amount: parsed.amount,
        parsed_merchant: parsed.merchant,
        parsed_date: parsed.date,
        parsed_items: parsed.items,
      })
      .eq('id', receiptId)
      .select()
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as ReceiptScan, error: null };
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
