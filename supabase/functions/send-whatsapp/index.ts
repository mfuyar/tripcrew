import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function sanitize(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function normalizePhone(raw: string): string | null {
  // Strip all non-digit characters
  const digits = raw.replace(/\D/g, '');
  // Must be 10–15 digits
  if (digits.length < 10 || digits.length > 15) return null;
  // Assume US if 10 digits, otherwise keep as-is
  return digits.length === 10 ? `+1${digits}` : `+${digits}`;
}

async function sendWhatsApp(
  accountSid: string,
  authToken: string,
  from: string,
  to: string,
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const params = new URLSearchParams({
    From: `whatsapp:${from}`,
    To: `whatsapp:${to}`,
    Body: body,
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    return { ok: false, error: err?.message ?? `Twilio error ${res.status}` };
  }
  return { ok: true };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
    const from = Deno.env.get('TWILIO_WHATSAPP_FROM') ?? '+14155238886';
    if (!accountSid || !authToken) return jsonResponse({ error: 'WhatsApp not configured.' }, 500);

    // Authenticate caller
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return jsonResponse({ error: 'Unauthorized' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const kind = sanitize(body.kind, 32);
    const tripId = sanitize(body.tripId, 64);
    const message = sanitize(body.message, 1000);
    const pollId = sanitize(body.pollId ?? '', 64);
    const familyId = sanitize(body.familyId ?? '', 64);
    const includeSelf = body.includeSelf === true;

    if (!tripId) return jsonResponse({ error: 'tripId is required.' }, 400);
    if (!kind) return jsonResponse({ error: 'kind is required (poll | emergency).' }, 400);

    // Verify caller is a trip member
    const { data: callerMember } = await supabase
      .from('trip_members')
      .select('role')
      .eq('trip_id', tripId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!callerMember) return jsonResponse({ error: 'You are not a member of this trip.' }, 403);

    // Get trip name
    const { data: trip } = await supabase
      .from('trips')
      .select('name')
      .eq('id', tripId)
      .single();
    const tripName = (trip as { name?: string } | null)?.name ?? 'your trip';

    // Build target user IDs
    let targetUserIds: string[];
    if (familyId) {
      // Verify caller is a member of this family before messaging it
      const { data: selfInFamily } = await supabase
        .from('family_members')
        .select('id')
        .eq('family_id', familyId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!selfInFamily) return jsonResponse({ error: 'You are not a member of this family.' }, 403);

      const { data: fmRows } = await supabase
        .from('family_members')
        .select('user_id')
        .eq('family_id', familyId);
      targetUserIds = ((fmRows ?? []) as { user_id: string }[]).map((r) => r.user_id);
    } else {
      // Send to all trip members
      const { data: tmRows } = await supabase
        .from('trip_members')
        .select('user_id')
        .eq('trip_id', tripId);
      targetUserIds = ((tmRows ?? []) as { user_id: string }[]).map((r) => r.user_id);
    }

    // Exclude sender unless caller opted in (e.g. announcements)
    if (!includeSelf) {
      targetUserIds = targetUserIds.filter((id) => id !== user.id);
    }
    if (targetUserIds.length === 0) return jsonResponse({ sent: 0 });

    // Fetch profiles with phone numbers
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, phone')
      .in('id', targetUserIds);

    const recipients = ((profiles ?? []) as { id: string; full_name?: string; phone?: string }[])
      .filter((p) => p.phone && p.phone.trim().length > 0);

    if (recipients.length === 0) {
      return jsonResponse({ sent: 0, skipped: targetUserIds.length, reason: 'No recipients have a phone number.' });
    }

    function escapeWA(text: string) {
      return text.replace(/[*_~`]/g, '\\$&');
    }

    const appBaseUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/open-app`;

    // Build message body
    let msgBody: string;
    const safeTripName = escapeWA(tripName);

    if (kind === 'poll') {
      const link = pollId
        ? `${appBaseUrl}?type=poll&pollId=${encodeURIComponent(pollId)}&tripId=${encodeURIComponent(tripId)}`
        : `${appBaseUrl}?type=trip&tripId=${encodeURIComponent(tripId)}`;
      msgBody = [
        `🗳️ New poll in *${safeTripName}*!`,
        '',
        escapeWA(message || 'A new poll is waiting for your vote.'),
        '',
        `Open TripCrew to vote 👉 ${link}`,
      ].join('\n');
    } else if (kind === 'poll_reminder') {
      const link = pollId
        ? `${appBaseUrl}?type=poll&pollId=${encodeURIComponent(pollId)}&tripId=${encodeURIComponent(tripId)}`
        : `${appBaseUrl}?type=trip&tripId=${encodeURIComponent(tripId)}`;
      msgBody = [
        `⏰ *Poll reminder* for *${safeTripName}*`,
        '',
        escapeWA(message || "Don't forget to vote!"),
        '',
        `Open TripCrew 👉 ${link}`,
      ].join('\n');
    } else {
      // emergency
      const sender = (await supabase.from('profiles').select('full_name').eq('id', user.id).single()).data as { full_name?: string } | null;
      const senderName = escapeWA(sender?.full_name ?? 'A trip member');
      const tripLink = `${appBaseUrl}?type=trip&tripId=${encodeURIComponent(tripId)}`;
      msgBody = [
        `🚨 *Emergency message* from *${senderName}* (${safeTripName})`,
        '',
        escapeWA(message),
        '',
        `Open TripCrew 👉 ${tripLink}`,
      ].join('\n');
    }

    // Send in parallel, collect results
    const results = await Promise.allSettled(
      recipients.map(async (p) => {
        const phone = normalizePhone(p.phone!);
        if (!phone) return { ok: false, error: 'Invalid phone' };
        return sendWhatsApp(accountSid, authToken, from, phone, msgBody);
      }),
    );

    const sent = results.filter((r) => r.status === 'fulfilled' && (r.value as { ok: boolean }).ok).length;
    const failed = results.length - sent;

    return jsonResponse({ sent, failed, total: recipients.length });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
