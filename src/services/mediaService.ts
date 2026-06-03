import { File } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase, supabaseAnonKey, supabaseUrl } from '../lib/supabaseClient';
import { TripMedia, MediaType, ServiceResult } from '../types';

const MAX_PHOTO_PX = 1920;

// Resize a photo so neither dimension exceeds MAX_PHOTO_PX, keeping aspect ratio.
// Returns the original URI unchanged for non-photo or already-small files.
async function resizePhoto(uri: string, width: number, height: number): Promise<string> {
  if (width <= MAX_PHOTO_PX && height <= MAX_PHOTO_PX) return uri;
  const landscape = width >= height;
  const resize = landscape ? { width: MAX_PHOTO_PX } : { height: MAX_PHOTO_PX };
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize }],
    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
  );
  return result.uri;
}

const MEDIA_BUCKET = 'trip-media';

function getExtension(uri: string, mediaType: MediaType): string {
  const cleanUri = uri.split('?')[0];
  const ext = cleanUri.split('.').pop()?.toLowerCase();
  if (ext && ext.length <= 5) return ext;
  if (mediaType === 'audio') return 'm4a';
  if (mediaType === 'video') return 'mp4';
  return 'jpg';
}

// Extract storage object path from a public or signed URL
function extractStoragePath(url: string): string | null {
  // Public URL: .../storage/v1/object/public/trip-media/<path>
  const pub = `/public/${MEDIA_BUCKET}/`;
  const pubIdx = url.indexOf(pub);
  if (pubIdx >= 0) return decodeURIComponent(url.substring(pubIdx + pub.length).split('?')[0]);
  // Signed URL: .../storage/v1/object/sign/trip-media/<path>?token=...
  const sign = `/sign/${MEDIA_BUCKET}/`;
  const signIdx = url.indexOf(sign);
  if (signIdx >= 0) return decodeURIComponent(url.substring(signIdx + sign.length).split('?')[0]);
  return null;
}

function getContentType(file: File, ext: string, mediaType: MediaType): string {
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    heic: 'image/heic',
    m4a: 'audio/mp4',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    aac: 'audio/aac',
    caf: 'audio/x-caf',
    mp4: mediaType === 'audio' ? 'audio/mp4' : 'video/mp4',
    mov: 'video/quicktime',
  };

  if (mediaType === 'audio') return mimeMap[ext] || 'audio/mp4';
  return file.type || mimeMap[ext] || 'image/jpeg';
}

export const mediaService = {
  async uploadMedia(
    tripId: string,
    userId: string,
    familyId: string | undefined,
    uri: string,
    mediaType: MediaType,
    caption?: string,
    originalWidth?: number,
    originalHeight?: number
  ): Promise<ServiceResult<TripMedia>> {
    const finalUri = mediaType === 'photo'
      ? await resizePhoto(uri, originalWidth ?? MAX_PHOTO_PX + 1, originalHeight ?? MAX_PHOTO_PX + 1)
      : uri;
    const file = new File(finalUri);
    const ext = getExtension(finalUri, mediaType);
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
      .in('media_type', ['photo', 'video'])
      .order('created_at', { ascending: false });
    if (error) return { data: null, error: error.message };

    const items = data as TripMedia[];
    const paths = items.map((item) => extractStoragePath(item.url)).filter(Boolean) as string[];

    if (paths.length > 0) {
      const { data: signed } = await supabase.storage
        .from(MEDIA_BUCKET)
        .createSignedUrls(paths, 3600);

      if (signed) {
        const signedMap = new Map(signed.map((s) => [s.path, s.signedUrl]));
        return {
          data: items.map((item) => {
            const path = extractStoragePath(item.url);
            const signedUrl = path ? signedMap.get(path) : undefined;
            return signedUrl ? { ...item, url: signedUrl } : item;
          }),
          error: null,
        };
      }
    }

    return { data: items, error: null };
  },

  async deleteMedia(item: Pick<TripMedia, 'id' | 'url'>): Promise<ServiceResult<null>> {
    const path = extractStoragePath(item.url);
    if (path) {
      await supabase.storage.from(MEDIA_BUCKET).remove([path]);
    }
    const { error } = await supabase.from('trip_media').delete().eq('id', item.id);
    return { data: null, error: error?.message ?? null };
  },

  async deleteMultipleMedia(items: Pick<TripMedia, 'id' | 'url'>[]): Promise<ServiceResult<null>> {
    const paths = items.map((i) => extractStoragePath(i.url)).filter(Boolean) as string[];
    if (paths.length > 0) {
      await supabase.storage.from(MEDIA_BUCKET).remove(paths);
    }
    const ids = items.map((i) => i.id);
    const { error } = await supabase.from('trip_media').delete().in('id', ids);
    return { data: null, error: error?.message ?? null };
  },

  // Upload a file to storage only — no trip_media row. Used for chat voice messages.
  async uploadChatAudio(
    tripId: string,
    userId: string,
    uri: string,
    mediaType: MediaType
  ): Promise<ServiceResult<{ url: string; mime_type: string }>> {
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
      return { data: null, error: uploadError || 'Audio upload failed' };
    }

    const { data: urlData } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(fileName);
    return { data: { url: urlData.publicUrl, mime_type: contentType }, error: null };
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
