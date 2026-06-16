import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'TripCrew <notifications@tripcrewfamily.com>';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type EmailKind = 'announcement' | 'poll' | 'invite' | 'reminder';

type EmailRequest = {
  tripId?: string;
  kind?: EmailKind;
  title?: string;
  body?: string;
  options?: string[];
  itemId?: string;
  pollId?: string;
  recipientEmail?: string;
  recipientName?: string;
  familyName?: string;
  familyId?: string;
  inviteLink?: string;
};

type TripRow = {
  id: string;
  name: string;
  destination: string | null;
  invite_code?: string | null;
};

type MemberRow = {
  user_id: string;
  role: string;
  profile: { email: string | null; full_name: string | null } | null;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function sanitizeText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function uniqueEmails(members: MemberRow[], excludeUserId: string) {
  const seen = new Set<string>();
  members.forEach((member) => {
    if (member.user_id === excludeUserId) return;
    const email = member.profile?.email?.trim().toLowerCase();
    if (!email) return;
    seen.add(email);
  });
  return Array.from(seen);
}

function mailboxEmail(value: string) {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim();
}

function tripLabel(trip: TripRow) {
  return trip.destination ? `${trip.name} (${trip.destination})` : trip.name;
}

function senderLabel(user: { email?: string | null; user_metadata?: Record<string, unknown> | null }) {
  const metadataName = typeof user.user_metadata?.full_name === 'string'
    ? user.user_metadata.full_name.trim()
    : '';
  return metadataName || user.email || 'A TripCrew member';
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function buildEmail(payload: Required<Pick<EmailRequest, 'kind' | 'title' | 'body'>> & Pick<EmailRequest, 'options' | 'pollId'>, trip: TripRow, sender: string) {
  const title = escapeHtml(payload.title);
  const body = escapeHtml(payload.body).replace(/\n/g, '<br />');
  const tripName = escapeHtml(tripLabel(trip));
  const senderText = escapeHtml(sender);
  const options = payload.options?.filter(Boolean) ?? [];
  const optionList = options.length > 0
    ? `<h2 style="font-size:16px;margin:24px 0 8px;">Options</h2><ol>${options.map((option) => `<li>${escapeHtml(option)}</li>`).join('')}</ol>`
    : '';

  const isReminder = payload.kind === 'reminder';
  const isPoll = payload.kind === 'poll' || isReminder;
  const subjectPrefix = payload.kind === 'poll' ? 'New poll'
    : isReminder ? 'Reminder'
    : payload.kind === 'invite' ? 'Trip invite'
    : 'Announcement';
  const reminderBanner = isReminder
    ? `<div style="background:#FEF3C7;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:13px;color:#92400E;font-weight:600;">⏰ Don't forget to vote!</div>`
    : '';
  const pollLink = isPoll && payload.pollId
    ? `travelcrew://poll?pollId=${encodeURIComponent(payload.pollId)}&tripId=${encodeURIComponent(trip.id)}`
    : null;
  const voteButton = pollLink
    ? `<div style="text-align:center;margin-top:24px;"><a href="${escapeHtml(pollLink)}" style="display:inline-block;background:#4F7FFF;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:50px;font-size:15px;font-weight:700;">Vote Now →</a></div>`
    : '';
  const voteText = pollLink ? `\n\nTap to vote: ${pollLink}` : '';
  return {
    subject: `[${trip.name}] ${isReminder ? '⏰ Reminder' : subjectPrefix}: ${payload.title}`,
    text: `${isReminder ? '⏰ Reminder' : subjectPrefix}: ${payload.title}\nSent by: ${sender}\n\n${payload.body}${options.length ? `\n\nOptions:\n${options.map((option, index) => `${index + 1}. ${option}`).join('\n')}` : ''}${voteText}\n\nTrip: ${tripLabel(trip)}`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.45;color:#111827;">
        ${reminderBanner}
        <p style="font-size:13px;color:#6b7280;margin:0 0 12px;">${escapeHtml(subjectPrefix)} from TripCrew</p>
        <h1 style="font-size:22px;margin:0 0 16px;">${title}</h1>
        <p style="font-size:14px;color:#4b5563;margin:0 0 16px;">Sent by ${senderText}</p>
        <div style="font-size:15px;margin-bottom:16px;">${body}</div>
        ${optionList}
        ${voteButton}
        <p style="font-size:13px;color:#6b7280;margin-top:24px;">Trip: ${tripName}</p>
      </div>
    `,
  };
}

function buildInviteEmail(input: {
  trip: TripRow;
  recipientName: string;
  familyName: string;
  inviteLink: string;
  sender: string;
}) {
  const tripName = escapeHtml(tripLabel(input.trip));
  const greeting = input.recipientName ? `Hi ${escapeHtml(input.recipientName)},` : 'Hi,';
  const inviteCode = escapeHtml(input.trip.invite_code ?? '');
  const familyLine = input.familyName ? `<p><strong>Family:</strong> ${escapeHtml(input.familyName)}</p>` : '';
  const link = escapeHtml(input.inviteLink);
  const senderText = escapeHtml(input.sender);
  return {
    subject: `Join ${input.trip.name} on TripCrew`,
    text: [
      input.recipientName ? `Hi ${input.recipientName},` : 'Hi,',
      '',
      `You have been invited to join ${tripLabel(input.trip)} on TripCrew.`,
      `Sent by: ${input.sender}`,
      input.familyName ? `Family: ${input.familyName}` : '',
      input.inviteLink ? `Tap to join: ${input.inviteLink}` : '',
      input.trip.invite_code ? `Or enter invite code: ${input.trip.invite_code}` : '',
      '',
      'After you sign in or create an account, use the invite link/code to request access.',
    ].filter(Boolean).join('\n'),
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.45;color:#111827;">
        <p>${greeting}</p>
        <h1 style="font-size:22px;margin:0 0 16px;">Join ${tripName} on TripCrew</h1>
        <p style="font-size:14px;color:#4b5563;margin:0 0 16px;">Sent by ${senderText}</p>
        ${familyLine}
        <p>After you sign in or create an account, use the invite link/code to request access.</p>
        ${link ? `<p><a href="${link}" style="display:inline-block;background:#4F7FFF;color:white;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">Open invite</a></p>` : ''}
        ${inviteCode ? `<p style="font-size:14px;color:#4b5563;">Invite code: <strong>${inviteCode}</strong></p>` : ''}
      </div>
    `,
  };
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
    const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? '';
    const from = Deno.env.get('RESEND_FROM_EMAIL') ?? DEFAULT_FROM;
    if (!supabaseUrl || !anonKey || !serviceRoleKey || !resendApiKey) {
      return jsonResponse({ error: 'Email function is not configured.' }, 500);
    }

    const authed = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await authed.auth.getUser();
    if (authError || !user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const payload = await req.json().catch(() => ({})) as EmailRequest;
    const tripId = sanitizeText(payload.tripId, 80);
    const kind = payload.kind === 'poll' ? 'poll' : payload.kind === 'announcement' ? 'announcement' : payload.kind === 'invite' ? 'invite' : payload.kind === 'reminder' ? 'reminder' : null;
    const title = sanitizeText(payload.title, 160);
    const body = sanitizeText(payload.body, 5000);
    const recipientEmail = sanitizeText(payload.recipientEmail, 320).toLowerCase();
    const recipientName = sanitizeText(payload.recipientName, 120);
    const familyName = sanitizeText(payload.familyName, 120);
    const familyId = sanitizeText(payload.familyId, 80);
    const inviteLink = sanitizeText(payload.inviteLink, 500);
    const options = Array.isArray(payload.options)
      ? payload.options.map((option) => sanitizeText(option, 200)).filter(Boolean).slice(0, 20)
      : [];
    const pollId = sanitizeText(payload.pollId, 80);

    if (!tripId || !kind || (kind !== 'invite' && (!title || !body)) || (kind === 'invite' && !isValidEmail(recipientEmail))) {
      return jsonResponse({ error: 'tripId, kind, title/body, and invite recipient email are required.' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const [{ data: trip }, { data: senderMember }, { data: isGlobalAdmin }] = await Promise.all([
      admin.from('trips').select('id, name, destination, invite_code').eq('id', tripId).single(),
      admin.from('trip_members').select('user_id, role').eq('trip_id', tripId).eq('user_id', user.id).maybeSingle(),
      authed.rpc('is_global_admin', { user_uuid: user.id }),
    ]);

    if (!trip) return jsonResponse({ error: 'Trip not found.' }, 404);
    if (!senderMember && isGlobalAdmin !== true) {
      return jsonResponse({ error: 'Only trip members can email this trip.' }, 403);
    }

    let isFamilyAdmin = false;
    if (kind === 'invite' && familyId) {
      const { data: familyMember } = await admin
        .from('family_members')
        .select('id')
        .eq('trip_id', tripId)
        .eq('family_id', familyId)
        .eq('user_id', user.id)
        .eq('is_admin', true)
        .maybeSingle();
      isFamilyAdmin = Boolean(familyMember);
    }

    if (
      kind === 'invite' &&
      senderMember?.role !== 'trip_organizer' &&
      senderMember?.role !== 'trip_admin' &&
      isGlobalAdmin !== true &&
      !isFamilyAdmin
    ) {
      return jsonResponse({ error: 'Only trip organizers, trip admins, and family admins can send invite emails.' }, 403);
    }

    let recipients: string[] = [];
    if (kind === 'invite') {
      recipients = [recipientEmail];
    } else {
      const { data: members, error: membersError } = await admin
        .from('trip_members')
        .select('user_id, role, profile:profiles(email, full_name)')
        .eq('trip_id', tripId);
      if (membersError) return jsonResponse({ error: membersError.message }, 500);
      recipients = uniqueEmails((members ?? []) as MemberRow[], user.id);
    }
    if (recipients.length === 0) {
      return jsonResponse({ sent: 0, recipientCount: 0, reason: 'no_recipient_emails' });
    }

    const sender = senderLabel(user);
    const email = kind === 'invite'
      ? buildInviteEmail({
        trip: trip as TripRow,
        recipientName,
        familyName,
        inviteLink,
        sender,
      })
      : buildEmail({ kind, title, body, options, pollId }, trip as TripRow, sender);
    const resendResponse = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'TripCrew/1.0',
      },
      body: JSON.stringify({
        from,
        to: kind === 'invite' ? recipients : [user.email ?? mailboxEmail(from)],
        bcc: kind === 'invite' ? undefined : recipients,
        reply_to: user.email ?? mailboxEmail(from),
        subject: email.subject,
        html: email.html,
        text: email.text,
        tags: [
          { name: 'trip_id', value: tripId },
          { name: 'kind', value: kind },
        ],
      }),
    });
    const resendBody = await resendResponse.json().catch(() => null);
    if (!resendResponse.ok) {
      return jsonResponse({ error: 'Resend request failed.', details: resendBody }, resendResponse.status);
    }

    return jsonResponse({
      sent: recipients.length,
      recipientCount: recipients.length,
      id: resendBody?.id ?? null,
    });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
