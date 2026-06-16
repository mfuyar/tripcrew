import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type RegisterPushTokenRequest = {
  token?: string;
  platform?: string;
  deviceId?: string | null;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizePlatform(value: unknown) {
  return value === 'ios' || value === 'android' || value === 'web' ? value : 'unknown';
}

function isExpoPushToken(value: unknown): value is string {
  // Accept any non-empty string inside the brackets — token format varies by Expo build type
  return (
    typeof value === 'string' &&
    value.length > 10 &&
    value.length < 512 &&
    /^(ExpoPushToken|ExponentPushToken)\[.+\]$/.test(value)
  );
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
      return jsonResponse({ error: 'Push registration function is not configured.' }, 500);
    }

    const authed = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await authed.auth.getUser();
    if (authError || !user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const payload = await req.json().catch(() => ({})) as RegisterPushTokenRequest;
    if (!isExpoPushToken(payload.token)) {
      return jsonResponse({ error: 'Invalid Expo push token.' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const platform = normalizePlatform(payload.platform);
    const deviceId = typeof payload.deviceId === 'string' && payload.deviceId.length > 0
      ? payload.deviceId
      : null;

    if (deviceId) {
      await admin
        .from('push_tokens')
        .update({ is_active: false })
        .eq('user_id', user.id)
        .eq('device_id', deviceId)
        .neq('token', payload.token);
    }

    const { error: upsertError } = await admin
      .from('push_tokens')
      .upsert({
        user_id: user.id,
        token: payload.token,
        platform,
        device_id: deviceId,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'token' });

    if (upsertError) return jsonResponse({ error: upsertError.message }, 500);

    const { count, error: countError } = await admin
      .from('push_tokens')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (countError) return jsonResponse({ error: countError.message }, 500);

    return jsonResponse({
      token: payload.token,
      platform,
      deviceId,
      activeTokens: count ?? 0,
    });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
