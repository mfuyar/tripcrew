import { File } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { supabase, supabaseAnonKey, supabaseUrl } from '../lib/supabaseClient';
import { Message, TripMedia, MediaType, ServiceResult } from '../types';

const MEDIA_BUCKET = 'trip-media';
const MAX_IMAGE_DIMENSION = 1600;
const IMAGE_COMPRESS_QUALITY = 0.78;
const CHAT_MEDIA_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

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

async function prepareImageForUpload(uri: string): Promise<string> {
  try {
    const result = await manipulateAsync(
      uri,
      [{ resize: { width: MAX_IMAGE_DIMENSION } }],
      { compress: IMAGE_COMPRESS_QUALITY, format: SaveFormat.JPEG }
    );
    return result.uri;
  } catch {
    return uri;
  }
}

async function prepareFileForUpload(uri: string, mediaType: MediaType): Promise<{
  ext: string;
  contentType: string;
  file: File;
}> {
  const uploadUri = mediaType === 'photo' ? await prepareImageForUpload(uri) : uri;
  const file = new File(uploadUri);
  const ext = mediaType === 'photo' ? 'jpg' : getExtension(uploadUri, mediaType);
  const contentType = mediaType === 'photo' ? 'image/jpeg' : getContentType(file, ext, mediaType);
  return { ext, contentType, file };
}

async function uploadStorageObject(
  tripId: string,
  userId: string,
  uri: string,
  mediaType: MediaType,
  pathPrefix = ''
): Promise<ServiceResult<{ fileName: string; contentType: string; fileSize: number | null }>> {
  const { ext, contentType, file } = await prepareFileForUpload(uri, mediaType);
  const fileName = `${pathPrefix}${tripId}/${userId}/${Date.now()}.${ext}`;
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

  return { data: { fileName, contentType, fileSize: file.size || null }, error: null };
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
    const upload = await uploadStorageObject(tripId, userId, uri, mediaType);
    if (upload.error || !upload.data) return { data: null, error: upload.error };
    const { fileName, contentType, fileSize } = upload.data;

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
        file_size: fileSize,
      })
      .select('*, uploader:profiles(*), family:families(*)')
      .single();

    if (error) return { data: null, error: error.message };

    // DB stores the public URL (used as a path marker for signed-URL regeneration).
    // Return a signed URL to callers so the file is immediately accessible
    // regardless of bucket visibility (e.g. for messages.media_url in chat).
    const { data: signed } = await supabase.storage
      .from(MEDIA_BUCKET)
      .createSignedUrl(fileName, 60 * 60 * 24 * 365);
    const result = data as TripMedia;
    return { data: signed ? { ...result, url: signed.signedUrl } : result, error: null };
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

  async deleteMedia(item: Pick<TripMedia, 'id' | 'url'> | string): Promise<ServiceResult<null>> {
    const mediaId = typeof item === 'string' ? item : item.id;
    const mediaUrl = typeof item === 'string' ? undefined : item.url;
    const path = mediaUrl ? extractStoragePath(mediaUrl) : null;
    if (path) {
      await supabase.storage.from(MEDIA_BUCKET).remove([path]);
    }
    const { error } = await supabase.from('trip_media').delete().eq('id', mediaId);
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

  // Upload a file to storage only — no trip_media row. Used for ephemeral chat media.
  async uploadChatMedia(
    tripId: string,
    userId: string,
    uri: string,
    mediaType: MediaType
  ): Promise<ServiceResult<{ url: string; mime_type: string }>> {
    const upload = await uploadStorageObject(tripId, userId, uri, mediaType, 'chat/');
    if (upload.error || !upload.data) return { data: null, error: upload.error };
    const { fileName, contentType } = upload.data;

    // Chat media is intentionally ephemeral; regenerate the URL on send with a 24h expiry.
    const { data: signed, error: signErr } = await supabase.storage
      .from(MEDIA_BUCKET)
      .createSignedUrl(fileName, CHAT_MEDIA_TTL_SECONDS);
    if (signErr || !signed) {
      const { data: urlData } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(fileName);
      return { data: { url: urlData.publicUrl, mime_type: contentType }, error: null };
    }
    return { data: { url: signed.signedUrl, mime_type: contentType }, error: null };
  },

  async uploadChatAudio(
    tripId: string,
    userId: string,
    uri: string,
    mediaType: MediaType
  ): Promise<ServiceResult<{ url: string; mime_type: string }>> {
    return mediaService.uploadChatMedia(tripId, userId, uri, mediaType);
  },

  async refreshChatMessageMediaUrls<T extends Pick<Message, 'media_url' | 'message_type'>>(
    messages: T[],
    expiresIn = 60 * 60 * 24
  ): Promise<T[]> {
    const pathByIndex = new Map<number, string>();

    messages.forEach((message, index) => {
      if (!message.media_url || !['image', 'audio'].includes(message.message_type)) return;
      const path = extractStoragePath(message.media_url);
      if (path) pathByIndex.set(index, path);
    });

    if (pathByIndex.size === 0) return messages;

    const paths = [...pathByIndex.values()];
    const { data: signed, error } = await supabase.storage
      .from(MEDIA_BUCKET)
      .createSignedUrls(paths, expiresIn);

    if (error || !signed) return messages;

    const signedUrlByPath = new Map(
      signed
        .filter((item) => item.signedUrl)
        .map((item) => [item.path, item.signedUrl as string])
    );

    return messages.map((message, index) => {
      const path = pathByIndex.get(index);
      const signedUrl = path ? signedUrlByPath.get(path) : undefined;
      return signedUrl ? { ...message, media_url: signedUrl } : message;
    });
  },

  async deleteExpiredChatMedia(tripId: string, olderThan = new Date(Date.now() - 24 * 60 * 60 * 1000)): Promise<ServiceResult<number>> {
    const { data: expiredMessages, error: queryError } = await supabase
      .from('messages')
      .select('id, media_url, message_type')
      .eq('trip_id', tripId)
      .in('message_type', ['image', 'audio'])
      .not('media_url', 'is', null)
      .lt('created_at', olderThan.toISOString());

    if (queryError) return { data: null, error: queryError.message };

    const messages = ((expiredMessages ?? []) as { id: string; media_url: string | null; message_type: string }[])
      .filter((message) => {
        if (message.message_type === 'audio') return true;
        const path = message.media_url ? extractStoragePath(message.media_url) : null;
        return path?.startsWith('chat/');
      });
    if (messages.length === 0) return { data: 0, error: null };

    const paths = messages
      .map((message) => message.media_url ? extractStoragePath(message.media_url) : null)
      .filter(Boolean) as string[];

    if (paths.length > 0) {
      await supabase.storage.from(MEDIA_BUCKET).remove(paths);
    }

    const { error: deleteError } = await supabase
      .from('messages')
      .delete()
      .in('id', messages.map((message) => message.id));

    if (deleteError) return { data: null, error: deleteError.message };
    return { data: messages.length, error: null };
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
