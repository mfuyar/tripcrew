import { File } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { supabase, supabaseAnonKey, supabaseUrl } from '../lib/supabaseClient';
import { CommunitySpot, CommunitySpotCategory, CommunitySpotComment, ServiceResult } from '../types';

const MEDIA_BUCKET = 'trip-media';
const MAX_IMAGE_DIMENSION = 1600;
const IMAGE_COMPRESS_QUALITY = 0.78;

export interface CommunitySpotInput {
  name: string;
  category: CommunitySpotCategory;
  description: string;
  address?: string;
  latitude: number;
  longitude: number;
  photoUri?: string;
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

async function uploadSpotPhoto(userId: string, uri: string): Promise<ServiceResult<string>> {
  const file = await preparePhoto(uri);
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

function categoryLabel(category: CommunitySpotCategory): string {
  return category === 'hidden_gem'
    ? 'Hidden gems'
    : category.charAt(0).toUpperCase() + category.slice(1);
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
  async create(userId: string, input: CommunitySpotInput): Promise<ServiceResult<CommunitySpot>> {
    let photoUrl: string | null = null;
    if (input.photoUri) {
      const upload = await uploadSpotPhoto(userId, input.photoUri);
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
    if (error) return { data: null, error: error.message };
    return { data: data as CommunitySpot[], error: null };
  },

  async getRecent(userId?: string): Promise<ServiceResult<CommunitySpot[]>> {
    const { data, error } = await supabase
      .from('community_spots')
      .select('*, author:profiles(*), comments:community_spot_comments(*, author:profiles(*))')
      .order('created_at', { ascending: false })
      .limit(25);
    if (error) return { data: null, error: error.message };

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
    const { data, error } = await supabase
      .from('community_spot_comments')
      .insert({ spot_id: spotId, user_id: userId, content })
      .select('*, author:profiles(*)')
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as CommunitySpotComment, error: null };
  },

  buildNearbyGuidePrompt,
  summarizeNearbySpots,
};
