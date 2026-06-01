import { supabase } from '../lib/supabaseClient';
import { TripMedia, MediaType, ServiceResult } from '../types';

export const mediaService = {
  async uploadMedia(
    tripId: string,
    userId: string,
    familyId: string | undefined,
    uri: string,
    mediaType: MediaType,
    caption?: string
  ): Promise<ServiceResult<TripMedia>> {
    // Convert URI to Blob for upload
    const response = await fetch(uri);
    const blob = await response.blob();
    // Strip query params from URI before extracting extension
    const cleanUri = uri.split('?')[0];
    const ext = cleanUri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const fileName = `${tripId}/${userId}/${Date.now()}.${ext}`;
    // blob.type can be empty on some platforms — fall back to MIME from extension
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      gif: 'image/gif', webp: 'image/webp', heic: 'image/heic',
      mp4: 'video/mp4', mov: 'video/quicktime',
    };
    const contentType = blob.type || mimeMap[ext] || 'image/jpeg';

    const { error: uploadError } = await supabase.storage
      .from('trip-media')
      .upload(fileName, blob, { contentType, upsert: false });

    if (uploadError) return { data: null, error: uploadError.message };

    const { data: urlData } = supabase.storage
      .from('trip-media')
      .getPublicUrl(fileName);

    const { data, error } = await supabase
      .from('trip_media')
      .insert({
        trip_id: tripId,
        uploaded_by: userId,
        family_id: familyId ?? null,
        media_type: mediaType,
        url: urlData.publicUrl,
        caption: caption ?? null,
      })
      .select('*, uploader:profiles(*), family:families(*)')
      .single();

    if (error) return { data: null, error: error.message };
    return { data: data as TripMedia, error: null };
  },

  async getMedia(tripId: string): Promise<ServiceResult<TripMedia[]>> {
    const { data, error } = await supabase
      .from('trip_media')
      .select('*, uploader:profiles(*), family:families(*)')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false });
    if (error) return { data: null, error: error.message };
    return { data: data as TripMedia[], error: null };
  },

  async deleteMedia(mediaId: string): Promise<ServiceResult<null>> {
    const { error } = await supabase
      .from('trip_media')
      .delete()
      .eq('id', mediaId);
    return { data: null, error: error?.message ?? null };
  },

  async updateCaption(
    mediaId: string,
    caption: string
  ): Promise<ServiceResult<TripMedia>> {
    const { data, error } = await supabase
      .from('trip_media')
      .update({ caption, updated_at: new Date().toISOString() })
      .eq('id', mediaId)
      .select()
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as TripMedia, error: null };
  },
};
