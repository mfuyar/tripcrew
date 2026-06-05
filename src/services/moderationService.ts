/**
 * moderationService — AI photo moderation via the Gemini Edge Function.
 * Called before every photo is stored so +18 / unsafe content never reaches storage.
 */

import { File } from 'expo-file-system';
import { supabase, supabaseAnonKey, supabaseUrl } from '../lib/supabaseClient';

export type ModerationResult =
  | { ok: true }
  | { ok: false; reason: string; block: boolean }; // block=true → reject; false → flag for review

const PROMPT = [
  'You are a strict content moderation system for a conservative family travel app.',
  'Children and families will see every photo. Apply the highest standards.',
  'Return only valid JSON: {"reject":boolean,"flag":boolean,"reason":string}.',
  '"reject"=true if the image contains ANY of: nudity, sexual content, explicit poses, pornography, graphic violence, gore, blood, weapons displayed aggressively, drug paraphernalia, hateful symbols, racist content, extremist imagery, self-harm, child exploitation, or anything clearly inappropriate for children.',
  '"flag"=true if the image is borderline, ambiguous, or you are uncertain — even slightly.',
  '"reject" takes priority over "flag".',
  '"reason" = one short sentence (max 15 words) explaining your decision.',
  'When in doubt, flag it. This is a family app.',
].join(' ');

export async function moderatePhoto(localUri: string): Promise<ModerationResult> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token ?? supabaseAnonKey;

    // Read image as base64 using Expo SDK 56 File class
    const file = new File(localUri);
    const base64 = await file.base64();

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

    if (parsed.reject) {
      return {
        ok: false,
        reason: String(parsed.reason || 'Photo contains inappropriate content and cannot be uploaded.'),
        block: true,
      };
    }

    if (parsed.flag) {
      return {
        ok: false,
        reason: String(parsed.reason || 'Photo flagged for manual review by an admin.'),
        block: false,
      };
    }

    return { ok: true };
  } catch {
    // Parse or network error — allow but flag
    return { ok: false, reason: 'Moderation check failed. Photo will be reviewed.', block: false };
  }
}
