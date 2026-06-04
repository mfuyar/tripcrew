import { File } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { supabase, supabaseAnonKey, supabaseUrl } from '../lib/supabaseClient';
import { ReceiptScan, ServiceResult } from '../types';

const RECEIPT_BUCKET = 'trip-media';
const MAX_RECEIPT_IMAGE_DIMENSION = 1600;
const RECEIPT_IMAGE_COMPRESS_QUALITY = 0.78;

async function prepareReceiptImageForUpload(uri: string): Promise<string> {
  const context = ImageManipulator.manipulate(uri);
  const image = await context.renderAsync();
  const resize =
    image.width > image.height
      ? { width: Math.min(image.width, MAX_RECEIPT_IMAGE_DIMENSION) }
      : { height: Math.min(image.height, MAX_RECEIPT_IMAGE_DIMENSION) };

  context.reset();
  context.resize(resize);
  const renderedImage = await context.renderAsync();
  const result = await renderedImage.saveAsync({
    compress: RECEIPT_IMAGE_COMPRESS_QUALITY,
    format: SaveFormat.JPEG,
  });
  return result.uri;
}

export const receiptService = {
  async uploadReceipt(
    tripId: string,
    userId: string,
    imageUri: string
  ): Promise<ServiceResult<ReceiptScan>> {
    // Upload image to storage
    const uploadUri = await prepareReceiptImageForUpload(imageUri);
    const file = new File(uploadUri);
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
          'Content-Type': 'image/jpeg',
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
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) return { data: null, error: 'You must be signed in to scan receipts.' };

    const response = await expoFetch(`${supabaseUrl}/functions/v1/scan-receipt`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ receiptId }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return { data: null, error: data?.error ?? 'Receipt scan failed' };
    }
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
