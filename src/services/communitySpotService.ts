import { File } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { supabase, supabaseAnonKey, supabaseUrl } from '../lib/supabaseClient';
import { CommunitySpot, CommunitySpotCategory, CommunitySpotComment, ModerationStatus, ServiceResult } from '../types';

const MEDIA_BUCKET = 'trip-media';
const MAX_IMAGE_DIMENSION = 1600;
const IMAGE_COMPRESS_QUALITY = 0.78;
const BAD_LANGUAGE_PATTERNS = [
  /\bfuck(?:ing|er|ed)?\b/i,
  /\bshit(?:ty)?\b/i,
  /\bbitch(?:es)?\b/i,
  /\basshole\b/i,
  /\bcunt\b/i,
  /\bdick\b/i,
  /\bpussy\b/i,
  /\bslut\b/i,
  /\bwhore\b/i,
  /\bfag(?:got)?\b/i,
  /\bnigg(?:a|er)s?\b/i,
  /\bretard(?:ed)?\b/i,
];

function getGeminiApiKey(): string | undefined {
  const key = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!key || key.startsWith('your_') || key === 'your_gemini_api_key_here') return undefined;
  return key;
}

function getGeminiModel(): string {
  return process.env.EXPO_PUBLIC_GEMINI_MODEL ?? 'gemini-2.0-flash';
}

export interface CommunitySpotInput {
  name: string;
  category: CommunitySpotCategory;
  description: string;
  address?: string;
  latitude: number;
  longitude: number;
  photoUri?: string;
}

interface ModerationDecision {
  status: ModerationStatus;
  reason?: string;
}

async function preparePhoto(uri: string): Promise<File> {
  const context = ImageManipulator.manipulate(uri);
  const image = await context.renderAsync();
  const resize =
    image.width > image.height
      ? { width: Math.min(image.width, MAX_IMAGE_DIMENSION) }
      : { height: Math.min(image.height, MAX_IMAGE_DIMENSION) };

  context.reset();
  context.resize(resize);
  const renderedImage = await context.renderAsync();
  const result = await renderedImage.saveAsync({
    compress: IMAGE_COMPRESS_QUALITY,
    format: SaveFormat.JPEG,
  });
  return new File(result.uri);
}

async function uploadPreparedSpotPhoto(userId: string, file: File): Promise<ServiceResult<string>> {
  const fileName = `community-spots/${userId}/${Date.now()}.jpg`;
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token ?? supabaseAnonKey;

  const uploadResponse = await expoFetch(
    `${supabaseUrl}/storage/v1/object/${MEDIA_BUCKET}/${fileName}`,
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
    const uploadError = await uploadResponse.text().catch(() => '');
    return { data: null, error: uploadError || 'Spot photo upload failed' };
  }

  const { data: urlData } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(fileName);
  return { data: urlData.publicUrl, error: null };
}

function containsBadLanguage(...values: Array<string | undefined>): boolean {
  const text = values.filter(Boolean).join(' ');
  return BAD_LANGUAGE_PATTERNS.some((pattern) => pattern.test(text));
}

function parseGeminiJsonObject(text: string): any {
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const jsonText = start >= 0 && end >= start ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(jsonText);
}

async function moderatePhoto(file: File): Promise<ModerationDecision> {
  const geminiApiKey = getGeminiApiKey();
  if (!geminiApiKey) {
    return {
      status: 'pending_review',
      reason: 'Photo needs manual review because Gemini moderation is not configured.',
    };
  }

  try {
    const base64 = await file.base64();
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${getGeminiModel()}:generateContent?key=${encodeURIComponent(geminiApiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              {
                text: [
                  'Moderate this user-submitted travel spot photo.',
                  'Return only JSON: {"adult": boolean, "unsafe": boolean, "uncertain": boolean, "reason": string}.',
                  'adult should be true for nudity, sexual content, explicit poses, pornography, or clearly +18 imagery.',
                  'unsafe should be true for graphic violence or hateful symbols.',
                  'uncertain should be true only when the image might be unsafe but is not clear enough to reject directly.',
                ].join('\n'),
              },
              { inlineData: { mimeType: file.type || 'image/jpeg', data: base64 } },
            ],
          }],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    if (!response.ok) {
      return {
        status: 'pending_review',
        reason: 'Photo needs manual review because automatic moderation failed.',
      };
    }

    const result = parseGeminiJsonObject(extractGeminiText(await response.json()));
    if (result.adult || result.unsafe) {
      return {
        status: 'rejected',
        reason: String(result.reason || 'Photo contains content that cannot be posted.'),
      };
    }
    if (result.uncertain) {
      return {
        status: 'pending_review',
        reason: String(result.reason || 'Photo needs manual review.'),
      };
    }
    return { status: 'approved' };
  } catch {
    return {
      status: 'pending_review',
      reason: 'Photo needs manual review because automatic moderation failed.',
    };
  }
}

async function moderateSpotInput(input: CommunitySpotInput, photoFile?: File): Promise<ModerationDecision> {
  if (containsBadLanguage(input.name, input.description, input.address)) {
    return {
      status: 'rejected',
      reason: 'This spot cannot be posted.',
    };
  }
  if (!photoFile) return { status: 'approved' };
  return moderatePhoto(photoFile);
}

function categoryLabel(category: CommunitySpotCategory): string {
  return category === 'hidden_gem'
    ? 'Hidden gems'
    : category.charAt(0).toUpperCase() + category.slice(1);
}

function isMissingCommunitySchema(error?: string | null): boolean {
  if (!error) return false;
  return (
    error.includes('community_spots') ||
    error.includes('get_nearby_community_spots') ||
    error.includes('schema cache') ||
    error.includes('Could not find the table') ||
    error.includes('Could not find the function')
  );
}

function normalizeCategory(value: string | undefined): CommunitySpotCategory {
  const normalized = (value ?? '').toLowerCase().replace(/\s+/g, '_');
  if (['outdoor', 'food', 'culture', 'hidden_gem', 'other'].includes(normalized)) {
    return normalized as CommunitySpotCategory;
  }
  if (normalized.includes('hidden')) return 'hidden_gem';
  return 'other';
}

function extractGeminiText(response: any): string {
  return response?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text ?? '')
    .join('')
    .trim() ?? '';
}

function parseGeminiJsonArray(text: string): any[] {
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  const jsonText = start >= 0 && end >= start ? cleaned.slice(start, end + 1) : cleaned;
  const parsed = JSON.parse(jsonText);
  return Array.isArray(parsed) ? parsed : [];
}

export function buildNearbyGuidePrompt(
  latitude: number,
  longitude: number,
  spots: CommunitySpot[],
  radiusMiles: number
): string {
  const spotLines = spots.map((spot) => [
    `Name: ${spot.name}`,
    `Category: ${categoryLabel(spot.category)}`,
    `Location: ${spot.latitude}, ${spot.longitude}${spot.address ? ` (${spot.address})` : ''}`,
    `Distance: ${spot.distance_miles?.toFixed(1) ?? 'unknown'} miles`,
    `Upvotes: ${spot.upvotes_count}`,
    `Description: ${spot.description}`,
    `Comments: ${(spot.comments ?? []).map((comment) => comment.content).join(' | ') || 'No comments yet'}`,
  ].join('\n')).join('\n\n');

  return [
    `You are a friendly local guide. A traveler is at ${latitude}, ${longitude}.`,
    `Below are community-submitted spots within ${radiusMiles} miles, each with a description, location, upvotes, and user comments.`,
    'Summarize the best options by category: outdoor, food, culture, hidden gems, and other.',
    'Be conversational and highlight what makes each spot special based on what locals said. Favor closer and more-upvoted spots when the descriptions are similarly useful.',
    '',
    spotLines,
  ].join('\n');
}

export function summarizeNearbySpots(spots: CommunitySpot[]): string {
  if (spots.length === 0) {
    return 'No community spots nearby yet. Add the first local find for travelers around this area.';
  }

  const grouped = spots.reduce((acc, spot) => {
    if (!acc[spot.category]) acc[spot.category] = [];
    acc[spot.category].push(spot);
    return acc;
  }, {} as Record<CommunitySpotCategory, CommunitySpot[]>);

  return (['outdoor', 'food', 'culture', 'hidden_gem', 'other'] as CommunitySpotCategory[])
    .filter((category) => grouped[category]?.length)
    .map((category) => {
      const picks = grouped[category]
        .sort((a, b) => b.upvotes_count - a.upvotes_count || (a.distance_miles ?? 999) - (b.distance_miles ?? 999))
        .slice(0, 2);
      const names = picks.map((spot) => {
        const distance = spot.distance_miles == null ? '' : `, ${spot.distance_miles.toFixed(1)} mi away`;
        return `${spot.name}${distance}`;
      }).join('; ');
      return `${categoryLabel(category)}: ${names}.`;
    })
    .join('\n');
}

export const communitySpotService = {
  isMissingCommunitySchema,
  containsBadLanguage,

  async create(userId: string, input: CommunitySpotInput): Promise<ServiceResult<CommunitySpot>> {
    let photoFile: File | null = null;
    let photoUrl: string | null = null;
    if (input.photoUri) {
      photoFile = await preparePhoto(input.photoUri);
    }

    const moderation = await moderateSpotInput(input, photoFile ?? undefined);
    if (moderation.status === 'rejected') {
      return { data: null, error: moderation.reason ?? 'This spot cannot be posted.' };
    }

    if (photoFile) {
      const upload = await uploadPreparedSpotPhoto(userId, photoFile);
      if (upload.error || !upload.data) return { data: null, error: upload.error };
      photoUrl = upload.data;
    }

    const { data, error } = await supabase
      .from('community_spots')
      .insert({
        user_id: userId,
        name: input.name,
        category: input.category,
        description: input.description,
        address: input.address ?? null,
        latitude: input.latitude,
        longitude: input.longitude,
        photo_url: photoUrl,
        moderation_status: moderation.status,
        moderation_reason: moderation.reason ?? null,
      })
      .select('*, author:profiles(*)')
      .single();

    if (error) return { data: null, error: error.message };
    return { data: data as CommunitySpot, error: null };
  },

  async getNearby(
    latitude: number,
    longitude: number,
    radiusMiles = 10,
    userId?: string
  ): Promise<ServiceResult<CommunitySpot[]>> {
    const { data, error } = await supabase.rpc('get_nearby_community_spots', {
      p_latitude: latitude,
      p_longitude: longitude,
      p_radius_miles: radiusMiles,
      p_user_id: userId ?? null,
      p_limit: 50,
    });
    if (error) {
      if (isMissingCommunitySchema(error.message)) return { data: [], error: null };
      return { data: null, error: error.message };
    }
    return { data: data as CommunitySpot[], error: null };
  },

  async getRecent(userId?: string): Promise<ServiceResult<CommunitySpot[]>> {
    const { data, error } = await supabase
      .from('community_spots')
      .select('*, author:profiles(*), comments:community_spot_comments(*, author:profiles(*))')
      .eq('moderation_status', 'approved')
      .order('created_at', { ascending: false })
      .limit(25);
    if (error) {
      if (isMissingCommunitySchema(error.message)) return { data: [], error: null };
      return { data: null, error: error.message };
    }

    const spots = (data as CommunitySpot[]).map((spot) => ({
      ...spot,
      viewer_has_upvoted: false,
    }));

    if (!userId || spots.length === 0) return { data: spots, error: null };

    const { data: votes } = await supabase
      .from('community_spot_votes')
      .select('spot_id')
      .eq('user_id', userId)
      .in('spot_id', spots.map((spot) => spot.id));
    const voted = new Set((votes ?? []).map((vote: { spot_id: string }) => vote.spot_id));
    return {
      data: spots.map((spot) => ({ ...spot, viewer_has_upvoted: voted.has(spot.id) })),
      error: null,
    };
  },

  async toggleUpvote(spotId: string, userId: string): Promise<ServiceResult<CommunitySpot>> {
    const { data, error } = await supabase.rpc('toggle_community_spot_vote', {
      p_spot_id: spotId,
      p_user_id: userId,
    });
    if (error) return { data: null, error: error.message };
    return { data: data as CommunitySpot, error: null };
  },

  async addComment(spotId: string, userId: string, content: string): Promise<ServiceResult<CommunitySpotComment>> {
    if (containsBadLanguage(content)) {
      return { data: null, error: 'This comment cannot be posted.' };
    }
    const { data, error } = await supabase
      .from('community_spot_comments')
      .insert({ spot_id: spotId, user_id: userId, content })
      .select('*, author:profiles(*)')
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as CommunitySpotComment, error: null };
  },

  async updateComment(commentId: string, content: string): Promise<ServiceResult<CommunitySpotComment>> {
    const trimmed = content.trim();
    if (!trimmed) return { data: null, error: 'Comment cannot be empty.' };
    if (containsBadLanguage(trimmed)) return { data: null, error: 'This comment cannot be posted.' };
    const { data, error } = await supabase
      .from('community_spot_comments')
      .update({ content: trimmed })
      .eq('id', commentId)
      .select('*, author:profiles(*)')
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as CommunitySpotComment, error: null };
  },

  async getPendingReview(): Promise<ServiceResult<CommunitySpot[]>> {
    const { data, error } = await supabase
      .from('community_spots')
      .select('*, author:profiles(*)')
      .eq('moderation_status', 'pending_review')
      .order('created_at', { ascending: true });
    if (error) return { data: null, error: error.message };
    return { data: data as CommunitySpot[], error: null };
  },

  async reviewSpot(
    spotId: string,
    moderatorId: string,
    status: 'approved' | 'rejected'
  ): Promise<ServiceResult<CommunitySpot>> {
    const { data, error } = await supabase.rpc('review_community_spot', {
      p_spot_id: spotId,
      p_moderator_id: moderatorId,
      p_status: status,
    });
    if (error) return { data: null, error: error.message };
    return { data: data as CommunitySpot, error: null };
  },

  async getGeminiFavorites(
    latitude: number,
    longitude: number,
    radiusMiles = 10
  ): Promise<ServiceResult<CommunitySpot[]>> {
    const geminiApiKey = getGeminiApiKey();
    if (!geminiApiKey) {
      return { data: null, error: 'Gemini API key is missing. Add EXPO_PUBLIC_GEMINI_API_KEY to .env.' };
    }

    const prompt = [
      'You are a friendly local travel guide.',
      `A traveler is at latitude ${latitude}, longitude ${longitude}.`,
      `Suggest 6 favorite places within about ${radiusMiles} miles.`,
      'Prefer real, visit-worthy places locals or travelers often like: outdoor spots, food areas, culture, and hidden gems.',
      'Return only valid JSON, as an array. No markdown.',
      'Each item must have: name, category, description, address, latitude, longitude.',
      'category must be one of: outdoor, food, culture, hidden_gem, other.',
      'description should be one friendly sentence explaining why it is worth checking out.',
    ].join('\n');

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${getGeminiModel()}:generateContent?key=${encodeURIComponent(geminiApiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.55,
              responseMimeType: 'application/json',
            },
          }),
        }
      );

      if (!response.ok) {
        if (response.status === 400 || response.status === 403) {
          return { data: null, error: 'Gemini API key is invalid. Update EXPO_PUBLIC_GEMINI_API_KEY in .env.' };
        }
        return { data: null, error: 'Could not load suggested places right now.' };
      }

      const text = extractGeminiText(await response.json());
      const places = parseGeminiJsonArray(text);
      const now = new Date().toISOString();
      const spots = places
        .map((place, index) => ({
          id: `gemini-${latitude}-${longitude}-${index}`,
          source: 'gemini' as const,
          user_id: 'gemini',
          name: String(place.name ?? 'Suggested place'),
          category: normalizeCategory(place.category),
          description: String(place.description ?? 'A nearby place worth checking out.'),
          address: place.address ? String(place.address) : undefined,
          latitude: Number(place.latitude),
          longitude: Number(place.longitude),
          upvotes_count: 0,
          comments_count: 0,
          created_at: now,
          updated_at: now,
          viewer_has_upvoted: false,
        }))
        .filter((spot) => Number.isFinite(spot.latitude) && Number.isFinite(spot.longitude));

      return { data: spots, error: null };
    } catch (error: any) {
      return { data: null, error: error?.message ?? 'Gemini places lookup failed' };
    }
  },

  buildNearbyGuidePrompt,
  summarizeNearbySpots,
};
