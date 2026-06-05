/**
 * placesService — fetches real place data from free APIs (no API key required)
 * Primary source: OpenStreetMap Overpass API
 * Ranking: rule-based scoring (no AI needed)
 * Dedup: by OSM ID, name similarity, and proximity
 */

import { CommunitySpot, CommunitySpotCategory, SpotPreference } from '../types';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// ─── Haversine distance ───────────────────────────────────────────────────────

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function kmToMiles(km: number): number { return km * 0.621371; }
export function milesToKm(miles: number): number { return miles * 1.60934; }

// ─── OSM tag → category mapping ──────────────────────────────────────────────

interface OsmTags { [key: string]: string }

function mapOsmCategory(tags: OsmTags): CommunitySpotCategory {
  const t = tags.tourism ?? '';
  const a = tags.amenity ?? '';
  const l = tags.leisure ?? '';
  const h = tags.historic ?? '';
  const s = tags.shop ?? '';
  const r = tags.religion ?? '';

  if (['museum', 'gallery'].includes(t) || ['museum', 'library'].includes(a) || h) return 'museum';
  if (['park', 'garden', 'nature_reserve', 'beach_resort'].includes(l) || t === 'viewpoint') return 'park';
  if (['attraction', 'zoo', 'aquarium', 'theme_park', 'artwork'].includes(t)) return 'attraction';
  if (['restaurant', 'cafe', 'fast_food', 'bar', 'food_court'].includes(a)) return 'food';
  if (['mall', 'marketplace', 'supermarket', 'department_store'].includes(s) || a === 'marketplace') return 'shopping';
  if (a === 'place_of_worship' || r) return 'religious';
  if (['playground', 'sports_centre'].includes(l)) return 'family';
  if (['cinema', 'theatre', 'arts_centre'].includes(a)) return 'indoor';
  if (t === 'information' || tags.natural) return 'outdoor';
  return 'other';
}

function extractOsmDescription(tags: OsmTags): string {
  return tags['description'] ?? tags['wikipedia'] ?? tags['inscription'] ?? '';
}

function extractWebsite(tags: OsmTags): string {
  return tags['website'] ?? tags['contact:website'] ?? tags['url'] ?? '';
}

function extractOpeningHours(tags: OsmTags): string {
  return tags['opening_hours'] ?? '';
}

function extractPhotoUrl(_tags: OsmTags): string {
  // OSM doesn't provide photos directly; Wikimedia could be linked
  // For now return empty — photos come from Wikimedia if name matches
  return '';
}

function extractName(tags: OsmTags, fallback: string): string {
  return tags['name:en'] ?? tags['name'] ?? tags['official_name'] ?? fallback;
}

// ─── OSM element → CommunitySpot ─────────────────────────────────────────────

function osmElementToSpot(
  element: any,
  centerLat: number,
  centerLon: number,
  distanceUnit: 'miles' | 'km'
): CommunitySpot | null {
  const lat: number = element.lat ?? element.center?.lat;
  const lon: number = element.lon ?? element.center?.lon;
  if (!lat || !lon) return null;

  const tags: OsmTags = element.tags ?? {};
  const name = extractName(tags, '');
  if (!name || name.length < 2) return null;

  const distKm = haversineKm(centerLat, centerLon, lat, lon);
  const distMiles = kmToMiles(distKm);
  const category = mapOsmCategory(tags);
  const osmId = `${element.type}/${element.id}`;

  return {
    id: `osm-${osmId}`,
    source: 'api',
    source_type: 'api',
    source_name: 'OpenStreetMap',
    source_url: `https://www.openstreetmap.org/${element.type}/${element.id}`,
    osm_id: osmId,
    is_verified: true,
    verification_source: 'OpenStreetMap',
    user_id: 'osm',
    name,
    category,
    description: extractOsmDescription(tags),
    address: [tags['addr:housenumber'], tags['addr:street'], tags['addr:city']]
      .filter(Boolean).join(' ') || tags['addr:full'] || '',
    latitude: lat,
    longitude: lon,
    photo_url: extractPhotoUrl(tags),
    website: extractWebsite(tags),
    opening_hours: extractOpeningHours(tags),
    tags: Object.entries(tags)
      .filter(([k]) => ['tourism', 'amenity', 'leisure', 'historic', 'shop', 'religion', 'fee', 'access', 'wheelchair'].includes(k))
      .map(([k, v]) => `${k}=${v}`),
    distance_km: distKm,
    distance_miles: distMiles,
    distance_unit: distanceUnit,
    upvotes_count: 0,
    comments_count: 0,
    likes_count: 0,
    saves_count: 0,
    moderation_status: 'approved',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// ─── Overpass query builder ───────────────────────────────────────────────────

function buildOverpassQuery(
  lat: number,
  lon: number,
  radiusMeters: number,
  preferences: SpotPreference[]
): string {
  // We always fetch a broad set and filter/rank client-side
  const around = `(around:${radiusMeters},${lat},${lon})`;
  return `
[out:json][timeout:30];
(
  node["tourism"~"attraction|museum|gallery|viewpoint|zoo|aquarium|theme_park|artwork|information"]${around};
  node["amenity"~"restaurant|cafe|fast_food|bar|library|cinema|theatre|arts_centre|place_of_worship|marketplace"]${around};
  node["leisure"~"park|garden|nature_reserve|playground|sports_centre|beach_resort|marina|dog_park|picnic_table"]${around};
  node["historic"~"monument|memorial|castle|ruins|archaeological_site|building|manor|fort|wayside_cross"]${around};
  node["shop"~"mall|marketplace|department_store|books|bakery"]${around};
  node["natural"~"beach|cliff|peak|waterfall|spring|cave_entrance|volcano"]${around};
  way["tourism"~"attraction|museum|gallery|viewpoint|zoo|aquarium"]${around};
  way["leisure"~"park|garden|nature_reserve|beach_resort"]${around};
  way["historic"~"monument|memorial|castle|ruins|archaeological_site"]${around};
  way["amenity"~"library|cinema|theatre|arts_centre|place_of_worship"]${around};
);
out body;
>;
out skel qt;
  `.trim();
}

// ─── Simple in-memory cache ───────────────────────────────────────────────────

interface CacheEntry { spots: CommunitySpot[]; timestamp: number }
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function cacheKey(lat: number, lon: number, radiusM: number, prefs: string[]): string {
  return `${lat.toFixed(4)},${lon.toFixed(4)},${radiusM},${[...prefs].sort().join(',')}`;
}

// ─── Deduplication ───────────────────────────────────────────────────────────

function normalizeNameForDedup(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
}

function deduplicateSpots(spots: CommunitySpot[]): CommunitySpot[] {
  const seen = new Set<string>();
  return spots.filter((s) => {
    const nameKey = normalizeNameForDedup(s.name);
    const coordKey = `${s.latitude.toFixed(3)},${s.longitude.toFixed(3)}`;
    const osmKey = s.osm_id ?? '';
    const key = osmKey || `${nameKey}|${coordKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    // Also block duplicates by very similar name + close coords
    const altKey = `${nameKey}|${coordKey}`;
    if (!osmKey && seen.has(altKey)) return false;
    seen.add(altKey);
    return true;
  });
}

// ─── Preference matching ──────────────────────────────────────────────────────

const FAMILY_CATEGORIES: CommunitySpotCategory[] = ['park', 'family', 'attraction', 'museum'];
const FREE_CATEGORIES: CommunitySpotCategory[] = ['park', 'religious', 'outdoor', 'hidden_gem'];
const FREE_OSM_TAGS = ['fee=no', 'access=yes'];
const INDOOR_CATEGORIES: CommunitySpotCategory[] = ['museum', 'shopping', 'indoor', 'food'];
const HALAL_OSM_TAGS = ['diet:halal=yes', 'cuisine=halal', 'halal=yes'];

function matchPreferences(spot: CommunitySpot, preferences: SpotPreference[]): string[] {
  const matched: string[] = [];
  const tags = spot.tags ?? [];
  const cat = spot.category;

  for (const pref of preferences) {
    switch (pref) {
      case 'family-friendly':
      case 'kids':
        if (FAMILY_CATEGORIES.includes(cat)) matched.push(pref);
        break;
      case 'free':
        if (FREE_CATEGORIES.includes(cat) || tags.some(t => FREE_OSM_TAGS.includes(t))) matched.push(pref);
        break;
      case 'nature':
        if (['park', 'outdoor'].includes(cat)) matched.push(pref);
        break;
      case 'parks':
        if (cat === 'park') matched.push(pref);
        break;
      case 'museums':
      case 'historical':
        if (cat === 'museum') matched.push(pref);
        break;
      case 'indoor':
      case 'rainy-day':
        if (INDOOR_CATEGORIES.includes(cat)) matched.push(pref);
        break;
      case 'outdoor':
        if (['park', 'outdoor', 'hidden_gem'].includes(cat)) matched.push(pref);
        break;
      case 'food':
        if (cat === 'food') matched.push(pref);
        break;
      case 'shopping':
        if (cat === 'shopping') matched.push(pref);
        break;
      case 'religious':
        if (cat === 'religious') matched.push(pref);
        break;
      case 'halal-friendly':
        if (tags.some(t => HALAL_OSM_TAGS.includes(t))) matched.push(pref);
        break;
      case 'low-walking':
        if (['museum', 'shopping', 'food', 'indoor', 'religious'].includes(cat)) matched.push(pref);
        break;
      case 'hidden-gems':
        if (cat === 'hidden_gem') matched.push(pref);
        break;
    }
  }
  return matched;
}

// ─── Data quality score ───────────────────────────────────────────────────────

function dataQualityScore(spot: CommunitySpot): number {
  let score = 0;
  if (spot.address) score += 1;
  if (spot.website) score += 1;
  if (spot.photo_url) score += 1;
  if (spot.opening_hours) score += 1;
  if (spot.description) score += 1;
  return score;
}

// ─── Rule-based priority score ────────────────────────────────────────────────

function computePriorityScore(
  spot: CommunitySpot,
  preferences: SpotPreference[],
  matched: string[]
): number {
  const distKm = spot.distance_km ?? 9999;
  let score = 0;

  // Distance score: max 30 at 0km, 0 at 10km+
  score += Math.max(0, 30 - distKm * 3);

  // Preference matches
  score += matched.length * 15;

  // Family/kids
  if ((preferences.includes('family-friendly') || preferences.includes('kids')) &&
      FAMILY_CATEGORIES.includes(spot.category)) score += 8;

  // Free
  if (preferences.includes('free') && FREE_CATEGORIES.includes(spot.category)) score += 7;

  // Indoor/rainy
  if ((preferences.includes('indoor') || preferences.includes('rainy-day')) &&
      INDOOR_CATEGORIES.includes(spot.category)) score += 6;

  // Hidden gems
  if (spot.category === 'hidden_gem') score += 5;

  // Engagement (member spots)
  score += (spot.upvotes_count ?? 0) * 2;
  score += (spot.saves_count ?? 0) * 3;
  score += (spot.likes_count ?? 0) * 1;

  // Data quality
  score += dataQualityScore(spot);

  // Verified source bonus
  if (spot.is_verified) score += 3;

  return Math.round(score * 10) / 10;
}

// ─── "Why recommended" template generator ────────────────────────────────────

export function generateWhyRecommended(
  spot: CommunitySpot,
  preferences: SpotPreference[],
  matched: string[],
  unit: 'miles' | 'km'
): string {
  const reasons: string[] = [];

  // Distance
  const distKm = spot.distance_km ?? 0;
  const distVal = unit === 'km' ? distKm : kmToMiles(distKm);
  const distStr = `${distVal.toFixed(1)} ${unit}`;
  if (distKm < 0.5) reasons.push('it is very close to your location');
  else reasons.push(`it is ${distStr} from your trip location`);

  // Preference matches
  for (const pref of matched) {
    switch (pref) {
      case 'family-friendly': reasons.push('matches your family-friendly preference'); break;
      case 'kids': reasons.push('is suitable for kids'); break;
      case 'free': reasons.push('is free or low-cost based on available data'); break;
      case 'nature': reasons.push('matches your interest in nature'); break;
      case 'parks': reasons.push('is a park or green space'); break;
      case 'museums': case 'historical': reasons.push('matches your interest in museums and history'); break;
      case 'indoor': case 'rainy-day': reasons.push('is an indoor option, good for rainy days'); break;
      case 'outdoor': reasons.push('matches your preference for outdoor activities'); break;
      case 'food': reasons.push('matches your interest in food and cafes'); break;
      case 'shopping': reasons.push('matches your interest in shopping'); break;
      case 'religious': reasons.push('matches your religious places preference'); break;
      case 'halal-friendly': reasons.push('is listed as halal-friendly in available data'); break;
      case 'low-walking': reasons.push('involves low walking effort'); break;
      case 'hidden-gems': reasons.push('is a lesser-known local gem'); break;
    }
  }

  // Category
  if (reasons.length < 2) {
    const cat = spot.category;
    if (cat === 'attraction') reasons.push('is a notable local attraction');
    else if (cat === 'park') reasons.push('is a park or green space');
    else if (cat === 'museum') reasons.push('is a museum or cultural site');
    else if (cat === 'food') reasons.push('is a dining or cafe option');
    else if (cat === 'religious') reasons.push('is a place of worship or religious interest');
  }

  // Source note
  if (spot.source_type === 'member') {
    reasons.push(`was suggested by a trip member${spot.submitted_by_name ? ` (${spot.submitted_by_name})` : ''}`);
  }

  const unique = [...new Set(reasons)].slice(0, 3);
  if (unique.length === 0) return 'Suggested based on its location near your trip.';
  return `Recommended because ${unique.join(', and ')}.`;
}

// ─── Main fetch function ──────────────────────────────────────────────────────

export interface FetchPlacesOptions {
  lat: number;
  lon: number;
  radiusMiles: number;
  preferences?: SpotPreference[];
  distanceUnit?: 'miles' | 'km';
  forceRefresh?: boolean;
}

export interface FetchPlacesResult {
  spots: CommunitySpot[];
  source: 'cache' | 'api';
  error?: string;
}

export async function fetchNearbyPlaces(opts: FetchPlacesOptions): Promise<FetchPlacesResult> {
  const {
    lat, lon,
    radiusMiles,
    preferences = [],
    distanceUnit = 'miles',
    forceRefresh = false,
  } = opts;

  const radiusMeters = Math.round(milesToKm(radiusMiles) * 1000);
  const key = cacheKey(lat, lon, radiusMeters, preferences);

  if (!forceRefresh) {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return { spots: cached.spots, source: 'cache' };
    }
  }

  try {
    const query = buildOverpassQuery(lat, lon, radiusMeters, preferences);
    const response = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!response.ok) {
      return { spots: [], source: 'api', error: 'Could not reach OpenStreetMap. Try again.' };
    }

    const data = await response.json();
    const elements: any[] = data.elements ?? [];

    // Convert OSM elements → CommunitySpot
    const raw: CommunitySpot[] = elements
      .map(el => osmElementToSpot(el, lat, lon, distanceUnit))
      .filter((s): s is CommunitySpot => s !== null);

    // Deduplicate
    const deduped = deduplicateSpots(raw);

    // Match preferences and score
    const scored = deduped.map(spot => {
      const matched = matchPreferences(spot, preferences);
      const score = computePriorityScore(spot, preferences, matched);
      const why = generateWhyRecommended(spot, preferences, matched, distanceUnit);
      return { ...spot, matched_preferences: matched, priority_score: score, why_recommended: why };
    });

    // Sort by score descending
    scored.sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0));

    // Cap at 100 results
    const final = scored.slice(0, 100);

    cache.set(key, { spots: final, timestamp: Date.now() });
    return { spots: final, source: 'api' };

  } catch (err: any) {
    return { spots: [], source: 'api', error: err?.message ?? 'Failed to fetch places.' };
  }
}

// ─── Merge API + member spots ─────────────────────────────────────────────────

export function mergeAndRankSpots(
  apiSpots: CommunitySpot[],
  memberSpots: CommunitySpot[],
  preferences: SpotPreference[],
  distanceUnit: 'miles' | 'km'
): CommunitySpot[] {
  // Re-score member spots
  const scoredMembers = memberSpots.map(spot => {
    const matched = matchPreferences(spot, preferences);
    const score = computePriorityScore(spot, preferences, matched);
    const why = generateWhyRecommended(spot, preferences, matched, distanceUnit);
    return { ...spot, matched_preferences: matched, priority_score: score, why_recommended: why };
  });

  const all = [...apiSpots, ...scoredMembers];
  // Deduplicate (member spots may overlap with API spots by name+coords)
  const deduped = deduplicateSpots(all);
  deduped.sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0));
  return deduped;
}

// ─── Category metadata ────────────────────────────────────────────────────────

export const CATEGORY_META: Record<string, { icon: string; label: string }> = {
  attraction:  { icon: '🎡', label: 'Attractions' },
  park:        { icon: '🌳', label: 'Parks & Nature' },
  museum:      { icon: '🏛️', label: 'Museums & History' },
  food:        { icon: '🍽️', label: 'Food & Cafes' },
  shopping:    { icon: '🛍️', label: 'Shopping' },
  religious:   { icon: '🕌', label: 'Religious Places' },
  family:      { icon: '👨‍👩‍👧', label: 'Family Friendly' },
  free:        { icon: '🆓', label: 'Free Things To Do' },
  indoor:      { icon: '🏠', label: 'Indoor / Rainy Day' },
  hidden_gem:  { icon: '✨', label: 'Hidden Gems' },
  outdoor:     { icon: '🌿', label: 'Outdoor' },
  culture:     { icon: '🎭', label: 'Culture' },
  other:       { icon: '📍', label: 'Other' },
};

export const PREFERENCE_META: Array<{ id: SpotPreference; icon: string; label: string }> = [
  { id: 'family-friendly', icon: '👨‍👩‍👧', label: 'Family Friendly' },
  { id: 'kids',            icon: '🧒', label: 'Kids' },
  { id: 'free',            icon: '🆓', label: 'Free' },
  { id: 'nature',          icon: '🌿', label: 'Nature' },
  { id: 'parks',           icon: '🌳', label: 'Parks' },
  { id: 'museums',         icon: '🏛️', label: 'Museums' },
  { id: 'historical',      icon: '🏰', label: 'Historical' },
  { id: 'indoor',          icon: '🏠', label: 'Indoor' },
  { id: 'outdoor',         icon: '☀️', label: 'Outdoor' },
  { id: 'rainy-day',       icon: '🌧️', label: 'Rainy Day' },
  { id: 'food',            icon: '🍴', label: 'Food' },
  { id: 'shopping',        icon: '🛍️', label: 'Shopping' },
  { id: 'religious',       icon: '🕌', label: 'Religious' },
  { id: 'halal-friendly',  icon: '✅', label: 'Halal Friendly' },
  { id: 'low-walking',     icon: '🪑', label: 'Low Walking' },
  { id: 'hidden-gems',     icon: '✨', label: 'Hidden Gems' },
];

export const RADIUS_OPTIONS_MILES = [1, 2, 5, 10, 15, 20, 25, 30, 50];
