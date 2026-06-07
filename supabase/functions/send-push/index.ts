import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const NOTIFICATION_SOUND = 'tripcrew_alert.wav';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type PushRequest = {
  userIds?: string[];
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ error: 'Push function is not configured.' }, 500);
    }

    const authed = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await authed.auth.getUser();
    if (authError || !user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const payload = await req.json() as PushRequest;
    const userIds = Array.from(new Set(payload.userIds ?? [])).filter(Boolean);
    const title = payload.title?.trim();
    const body = payload.body?.trim();
    if (userIds.length === 0) return jsonResponse({ sent: 0, tickets: [] });
    if (!title || !body) return jsonResponse({ error: 'title and body are required.' }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: tokens, error: tokenError } = await admin
      .from('push_tokens')
      .select('token')
      .in('user_id', userIds)
      .eq('is_active', true);

    if (tokenError) return jsonResponse({ error: tokenError.message }, 500);

    const uniqueTokens = Array.from(new Set((tokens ?? []).map((row: { token: string }) => row.token)));
    if (uniqueTokens.length === 0) return jsonResponse({ sent: 0, tickets: [] });

    const messages = uniqueTokens.map((to) => ({
      to,
      title,
      body,
      data: payload.data ?? {},
      sound: NOTIFICATION_SOUND,
      channelId: 'default',
    }));

    const expoResponse = await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
    const tickets = await expoResponse.json().catch(() => null);
    if (!expoResponse.ok) {
      return jsonResponse({ error: 'Expo push request failed.', tickets }, expoResponse.status);
    }

    return jsonResponse({ sent: uniqueTokens.length, tickets });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
