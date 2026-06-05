/**
 * moderationService — AI photo moderation via the Gemini Edge Function.
 * Called before every photo is stored so +18 / unsafe content never reaches storage.
 */

import * as FileSystem from 'expo-file-system';
import { supabase, supabaseAnonKey, supabaseUrl } from '../lib/supabaseClient';

export type ModerationResult =
  | { ok: true }
  | { ok: false; reason: string; block: boolean }; // block=true → reject; false → flag for review

const PROMPT = [
  'You are a content moderation system for a family travel app.',
  'Analyse this image and return only valid JSON: {"adult":boolean,"unsafe":boolean,"uncertain":boolean,"reason":string}.',
  '"adult" = nudity, sexual content, explicit poses, pornography, or clearly 18+ imagery.',
  '"unsafe" = graphic violence, hateful symbols, gore.',
  '"uncertain" = image might be borderline but you are not confident enough to reject.',
  '"reason" = short explanation (max 20 words).',
  'Be strict. Family travel app. Children may see this content.',
].join(' ');

export async function moderatePhoto(localUri: string): Promise<ModerationResult> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token ?? supabaseAnonKey;

    // Read image as base64
    const base64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Detect MIME from extension
    const ext = localUri.split('?')[0].split('.').pop()?.toLowerCase() ?? 'jpeg';
    const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';

    const response = await fetch(`${supabaseUrl}/functions/v1/gemini-proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { text: PROMPT },
            { inlineData: { mimeType: mime, data: base64 } },
          ],
        }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      }),
    });

    if (!response.ok) {
      // Moderation API unavailable — allow upload but flag as pending_review
      return { ok: false, reason: 'Moderation service unavailable', block: false };
    }

    const json = await response.json();
    const text: string = json?.candidates?.[0]?.content?.parts
      ?.map((p: any) => p.text ?? '')
      .join('') ?? '';

    const parsed = JSON.parse(text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim());

    if (parsed.adult || parsed.unsafe) {
      return {
        ok: false,
        reason: String(parsed.reason || 'Image contains inappropriate content.'),
        block: true,
      };
    }

    if (parsed.uncertain) {
      return {
        ok: false,
        reason: String(parsed.reason || 'Image flagged for manual review.'),
        block: false,  // upload but route to pending_review
      };
    }

    return { ok: true };
  } catch {
    // Parse or network error — allow but flag
    return { ok: false, reason: 'Moderation check failed. Photo will be reviewed.', block: false };
  }
}
