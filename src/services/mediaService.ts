import { File } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import { supabase, supabaseAnonKey, supabaseUrl } from '../lib/supabaseClient';
import { TripMedia, MediaType, ServiceResult } from '../types';

const MEDIA_BUCKET = 'trip-media';

function getExtension(uri: string, mediaType: MediaType): string {
  const cleanUri = uri.split('?')[0];
  const ext = cleanUri.split('.').pop()?.toLowerCase();
  if (ext && ext.length <= 5) return ext;
  if (mediaType === 'audio') return 'm4a';
  if (mediaType === 'video') return 'mp4';
  return 'jpg';
}

function getContentType(file: File, ext: string, mediaType: MediaType): string {
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    heic: 'image/heic',
    m4a: 'audio/m4a',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    aac: 'audio/aac',
    caf: 'audio/x-caf',
    mp4: mediaType === 'audio' ? 'audio/mp4' : 'video/mp4',
    mov: 'video/quicktime',
  };
  return file.type || mimeMap[ext] || (mediaType === 'audio' ? 'audio/m4a' : 'image/jpeg');
}

export const mediaService = {
  async uploadMedia(
    tripId: string,
    userId: string,
    familyId: string | undefined,
    uri: string,
    mediaType: MediaType,
    caption?: string
  ): Promise<ServiceResult<TripMedia>> {
    const file = new File(uri);
    const ext = getExtension(uri, mediaType);
    const fileName = `${tripId}/${userId}/${Date.now()}.${ext}`;
    const contentType = getContentType(file, ext, mediaType);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token ?? supabaseAnonKey;

    const uploadResponse = await expoFetch(
      `${supabaseUrl}/storage/v1/object/${MEDIA_BUCKET}/${fileName}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: supabaseAnonKey,
          'Content-Type': contentType,
          'x-upsert': 'false',
        },
        body: file,
      }
    );

    if (!uploadResponse.ok) {
      const uploadError = await uploadResponse.text().catch(() => '');
      return { data: null, error: uploadError || 'Media upload failed' };
    }

    const { data: urlData } = supabase.storage
      .from(MEDIA_BUCKET)
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
        mime_type: contentType,
        file_size: file.size || null,
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
