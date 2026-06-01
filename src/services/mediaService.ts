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
    const ext = uri.split('.').pop() ?? 'jpg';
    const fileName = `${tripId}/${userId}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('trip-media')
      .upload(fileName, blob, { contentType: blob.type });

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
