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
  requestId?: string;
};

type ExpoPushTicket = {
  status?: string;
  message?: string;
  details?: {
    error?: string;
    [key: string]: unknown;
  };
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function getTripId(data: Record<string, unknown> | undefined) {
  const value = data?.trip_id ?? data?.tripId;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function getRequestId(payload: PushRequest) {
  const value = payload.requestId ?? payload.data?.request_id ?? payload.data?.requestId;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function getPayloadType(data: Record<string, unknown> | undefined) {
  const value = data?.type;
  return typeof value === 'string' ? value : null;
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
    const requestedUserIds = Array.from(new Set(payload.userIds ?? [])).filter(Boolean);
    const title = payload.title?.trim();
    const body = payload.body?.trim();
    if (!title || !body) return jsonResponse({ error: 'title and body are required.' }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const requestId = getRequestId(payload);
    const payloadType = getPayloadType(payload.data);
    let tripId = getTripId(payload.data);
    let allowedUserIds = requestedUserIds;

    if (requestId) {
      const { data: joinRequest, error: requestError } = await admin
        .from('trip_join_requests')
        .select('id, trip_id, user_id, status')
        .eq('id', requestId)
        .single();

      if (requestError || !joinRequest) {
        return jsonResponse({ error: 'Join request not found.' }, 404);
      }

      tripId = joinRequest.trip_id;

      if (payloadType === 'join_request') {
        if (joinRequest.user_id !== user.id) {
          return jsonResponse({ error: 'Not allowed to send push for this join request.' }, 403);
        }

        const { data: managers, error: managerError } = await admin
          .from('trip_members')
          .select('user_id')
          .eq('trip_id', joinRequest.trip_id)
          .in('role', ['trip_organizer', 'trip_admin']);

        if (managerError) return jsonResponse({ error: managerError.message }, 500);

        const managerIds = Array.from(new Set((managers ?? []).map((row: { user_id: string }) => row.user_id)));
        allowedUserIds = requestedUserIds.length > 0
          ? requestedUserIds.filter((id) => managerIds.includes(id))
          : managerIds;
      } else if (payloadType === 'join_request_review') {
        const { data: canManage } = await authed.rpc('can_manage_trip', {
          trip_uuid: joinRequest.trip_id,
          user_uuid: user.id,
        });

        if (canManage !== true) {
          return jsonResponse({ error: 'Only trip managers can send join review push notifications.' }, 403);
        }

        allowedUserIds = requestedUserIds.length > 0
          ? requestedUserIds.filter((id) => id === joinRequest.user_id)
          : [joinRequest.user_id];
      } else {
        return jsonResponse({ error: 'Unsupported join request push type.' }, 400);
      }

      if (allowedUserIds.length === 0) {
        return jsonResponse({
          sent: 0,
          recipientCount: 0,
          tokenCount: 0,
          tickets: [],
          reason: 'no_allowed_recipients',
        });
      }
    }

    if (tripId && !requestId) {
      const [{ data: senderMembership }, { data: isGlobalAdmin }] = await Promise.all([
        admin
          .from('trip_members')
          .select('id')
          .eq('trip_id', tripId)
          .eq('user_id', user.id)
          .limit(1),
        authed.rpc('is_global_admin', { user_uuid: user.id }),
      ]);

      if (!senderMembership?.length && isGlobalAdmin !== true) {
        return jsonResponse({ error: 'Not allowed to send push notifications for this trip.' }, 403);
      }

      const [{ data: memberRecipients }, { data: consentRecipients }] = await Promise.all([
        admin
          .from('trip_members')
          .select('user_id')
          .eq('trip_id', tripId)
          .in('user_id', requestedUserIds),
        admin
          .from('admin_consent_requests')
          .select('admin_id')
          .eq('trip_id', tripId)
          .in('admin_id', requestedUserIds),
      ]);

      const allowed = new Set<string>();
      (memberRecipients ?? []).forEach((row: { user_id: string }) => allowed.add(row.user_id));
      (consentRecipients ?? []).forEach((row: { admin_id: string }) => allowed.add(row.admin_id));
      allowedUserIds = requestedUserIds.filter((id) => allowed.has(id));

      if (allowedUserIds.length === 0) {
        return jsonResponse({ error: 'No requested recipients are allowed for this trip.' }, 403);
      }
    } else if (!tripId && !requestId) {
      allowedUserIds = requestedUserIds.filter((id) => id === user.id);
      if (allowedUserIds.length === 0) {
        return jsonResponse({ error: 'trip_id is required for sending push notifications to other users.' }, 403);
      }
    }

    const { data: tokens, error: tokenError } = await admin
      .from('push_tokens')
      .select('token')
      .in('user_id', allowedUserIds)
      .eq('is_active', true);

    if (tokenError) return jsonResponse({ error: tokenError.message }, 500);

    const uniqueTokens = Array.from(new Set((tokens ?? []).map((row: { token: string }) => row.token)));
    if (uniqueTokens.length === 0) {
      return jsonResponse({
        sent: 0,
        recipientCount: allowedUserIds.length,
        tokenCount: 0,
        tickets: [],
        reason: 'no_active_push_tokens',
      });
    }

    const messages = uniqueTokens.map((to) => ({
      to,
      title,
      body,
      data: payload.data ?? {},
      sound: NOTIFICATION_SOUND,
      channelId: 'default',
      priority: 'high',
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

    const ticketList = Array.isArray(tickets?.data)
      ? tickets.data as ExpoPushTicket[]
      : Array.isArray(tickets)
        ? tickets as ExpoPushTicket[]
        : [];
    const staleTokens = uniqueTokens.filter((_, index) => {
      const ticket = ticketList[index];
      return ticket?.status === 'error' && ticket.details?.error === 'DeviceNotRegistered';
    });
    if (staleTokens.length > 0) {
      await admin
        .from('push_tokens')
        .update({ is_active: false })
        .in('token', staleTokens);
    }

    return jsonResponse({
      sent: uniqueTokens.length,
      recipientCount: allowedUserIds.length,
      tokenCount: uniqueTokens.length,
      staleTokenCount: staleTokens.length,
      tickets,
    });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
