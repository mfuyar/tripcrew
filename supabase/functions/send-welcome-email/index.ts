import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'TripCrew <notifications@tripcrewfamily.com>';

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

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function buildWelcomeEmail(firstName: string, fullName: string) {
  const greeting = firstName ? `Hi ${escapeHtml(firstName)}` : 'Welcome';
  const nameDisplay = fullName ? escapeHtml(fullName) : 'there';

  return {
    subject: `Welcome to TripCrew, ${firstName || nameDisplay}! 🏖️`,
    text: [
      `Hi ${nameDisplay},`,
      '',
      "Welcome to TripCrew — we're so glad you're here!",
      '',
      'WHY WE BUILT THIS',
      '',
      "TripCrew started from a very personal place. We've all been there: a big family trip on the horizon, group chats overflowing with questions, spreadsheets being emailed back and forth, someone always unsure what they owe, and half the family packing duplicates while the other half forgets the essentials.",
      '',
      "We built TripCrew because family trips deserve better than chaos. The memories you make together — the inside jokes, the spontaneous detours, the moments that become stories you'll tell for years — those deserve a smooth runway to take off from.",
      '',
      "So we made a place where your whole travel crew can show up, stay in sync, and focus on what actually matters: enjoying the journey.",
      '',
      "HERE'S WHAT'S WAITING FOR YOU",
      '',
      '✈️  Trip Planning — Create trips, invite families, keep everyone on the same page.',
      '💰  Expense Splitting — Track shared costs and settle up fairly, automatically.',
      '🎒  Packing Lists — Coordinate who brings what, so nothing gets left behind.',
      '📸  Trip Album — Capture and share photos from the whole crew in one place.',
      '🗳️  Polls — Let the group vote on activities, restaurants, or anything else.',
      '💬  Trip Chat — One dedicated chat per trip, no more buried group messages.',
      '📣  Announcements — Broadcast important updates to every member at once.',
      '',
      "You're all set. Create your first trip and invite your crew — the adventure starts now.",
      '',
      '💬 ENABLE WHATSAPP NOTIFICATIONS',
      '',
      'Get poll alerts and emergency messages on WhatsApp in two steps:',
      '  1. Add your phone number in the app: Profile → Edit → Phone',
      '  2. Send this message on WhatsApp to +1 (415) 523-8886:',
      '     join expression-quite',
      '',
      'With excitement,',
      'The TripCrew Team',
      '',
      '—',
      'TripCrew: Family Travel',
      'tripcrewfamily.com',
    ].join('\n'),
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>Welcome to TripCrew</title>
  <style>:root { color-scheme: light only; }</style>
</head>
<body style="margin:0;padding:0;background-color:#E8F4FD;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#E8F4FD;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- HERO HEADER -->
          <tr>
            <td style="background:linear-gradient(135deg,#38BDF8 0%,#6366F1 100%);border-radius:20px 20px 0 0;padding:48px 40px 40px;text-align:center;">
              <div style="font-size:56px;margin-bottom:12px;">🏖️</div>
              <h1 style="margin:0;font-size:32px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;text-shadow:0 1px 4px rgba(0,0,0,0.15);">Welcome to TripCrew</h1>
              <p style="margin:12px 0 0;font-size:17px;color:rgba(255,255,255,0.95);line-height:1.5;">${greeting} — your adventure starts here.</p>
            </td>
          </tr>

          <!-- MAIN CARD -->
          <tr>
            <td style="background:#ffffff;padding:40px;border-radius:0 0 20px 20px;box-shadow:0 8px 40px rgba(79,127,255,0.12);">

              <!-- STORY SECTION -->
              <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a1a2e;">Why we built TripCrew</h2>
              <p style="margin:0 0 16px;font-size:15px;color:#4b5563;line-height:1.7;">
                TripCrew started from a very personal place. We've all been there: a big family trip on the horizon, group chats overflowing with questions, spreadsheets being emailed back and forth, someone always unsure what they owe, and half the family packing duplicates while the other half forgets the essentials.
              </p>
              <p style="margin:0 0 16px;font-size:15px;color:#4b5563;line-height:1.7;">
                We built TripCrew because family trips deserve better than chaos. The memories you make together — the inside jokes, the spontaneous detours, the moments that become stories you'll tell for years — those deserve a smooth runway to take off from.
              </p>
              <p style="margin:0 0 32px;font-size:15px;color:#4b5563;line-height:1.7;">
                So we made a place where your whole travel crew can show up, stay in sync, and focus on what actually matters: <strong style="color:#4F7FFF;">enjoying the journey.</strong>
              </p>

              <!-- DIVIDER -->
              <hr style="border:none;border-top:1px solid #e8edf8;margin:0 0 32px;" />

              <!-- FEATURES GRID -->
              <h2 style="margin:0 0 20px;font-size:20px;font-weight:700;color:#1a1a2e;">Here's what's waiting for you</h2>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width:50%;padding:0 8px 16px 0;vertical-align:top;">
                    <div style="background:#f5f8ff;border-radius:14px;padding:18px;">
                      <div style="font-size:28px;margin-bottom:8px;">✈️</div>
                      <div style="font-size:14px;font-weight:700;color:#1a1a2e;margin-bottom:4px;">Trip Planning</div>
                      <div style="font-size:13px;color:#6b7280;line-height:1.5;">Create trips, invite families, keep everyone on the same page.</div>
                    </div>
                  </td>
                  <td style="width:50%;padding:0 0 16px 8px;vertical-align:top;">
                    <div style="background:#f5f8ff;border-radius:14px;padding:18px;">
                      <div style="font-size:28px;margin-bottom:8px;">💰</div>
                      <div style="font-size:14px;font-weight:700;color:#1a1a2e;margin-bottom:4px;">Expense Splitting</div>
                      <div style="font-size:13px;color:#6b7280;line-height:1.5;">Track shared costs and settle up fairly, automatically.</div>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="width:50%;padding:0 8px 16px 0;vertical-align:top;">
                    <div style="background:#f5f8ff;border-radius:14px;padding:18px;">
                      <div style="font-size:28px;margin-bottom:8px;">🎒</div>
                      <div style="font-size:14px;font-weight:700;color:#1a1a2e;margin-bottom:4px;">Packing Lists</div>
                      <div style="font-size:13px;color:#6b7280;line-height:1.5;">Coordinate who brings what, so nothing gets left behind.</div>
                    </div>
                  </td>
                  <td style="width:50%;padding:0 0 16px 8px;vertical-align:top;">
                    <div style="background:#f5f8ff;border-radius:14px;padding:18px;">
                      <div style="font-size:28px;margin-bottom:8px;">📸</div>
                      <div style="font-size:14px;font-weight:700;color:#1a1a2e;margin-bottom:4px;">Trip Album</div>
                      <div style="font-size:13px;color:#6b7280;line-height:1.5;">Capture and share photos from the whole crew in one place.</div>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="width:50%;padding:0 8px 0 0;vertical-align:top;">
                    <div style="background:#f5f8ff;border-radius:14px;padding:18px;">
                      <div style="font-size:28px;margin-bottom:8px;">🗳️</div>
                      <div style="font-size:14px;font-weight:700;color:#1a1a2e;margin-bottom:4px;">Polls</div>
                      <div style="font-size:13px;color:#6b7280;line-height:1.5;">Let the group vote on activities, restaurants, or anything else.</div>
                    </div>
                  </td>
                  <td style="width:50%;padding:0 0 0 8px;vertical-align:top;">
                    <div style="background:#f5f8ff;border-radius:14px;padding:18px;">
                      <div style="font-size:28px;margin-bottom:8px;">💬</div>
                      <div style="font-size:14px;font-weight:700;color:#1a1a2e;margin-bottom:4px;">Trip Chat</div>
                      <div style="font-size:13px;color:#6b7280;line-height:1.5;">One dedicated chat per trip, no more buried group messages.</div>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- WHATSAPP SECTION -->
              <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:14px;padding:20px;margin-top:8px;text-align:center;">
                <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#15803d;">💬 Enable WhatsApp Notifications</p>
                <p style="margin:0 0 16px;font-size:14px;color:#166534;line-height:1.6;">Get poll alerts and emergency messages directly on WhatsApp. Two quick steps:</p>
                <p style="margin:0 0 12px;font-size:13px;color:#166534;text-align:left;line-height:1.7;">
                  <strong>1.</strong> Add your phone number in the app — go to <strong>Profile → Edit → Phone</strong>.<br/>
                  <strong>2.</strong> Tap below to join our WhatsApp channel (pre-filled message, just hit send).
                </p>
                <a href="https://wa.me/14155238886?text=join%20expression-quite" style="display:inline-block;background:#25D366;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:50px;font-size:15px;font-weight:700;">Open WhatsApp &amp; Join →</a>
                <p style="margin:12px 0 0;font-size:12px;color:#6b7280;">Opens WhatsApp with <strong>join expression-quite</strong> pre-filled</p>
              </div>

              <!-- CTA -->
              <div style="text-align:center;margin-top:36px;">
                <p style="font-size:16px;color:#4b5563;margin:0 0 20px;line-height:1.6;">You're all set. Create your first trip and invite your crew — the adventure starts now.</p>
                <a href="travelcrew://" style="display:inline-block;background:linear-gradient(135deg,#38BDF8 0%,#6366F1 100%);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:50px;font-size:16px;font-weight:700;letter-spacing:0.2px;">Open TripCrew 🚀</a>
              </div>

              <!-- SIGN OFF -->
              <div style="margin-top:36px;padding-top:28px;border-top:1px solid #e8edf8;text-align:center;">
                <p style="margin:0;font-size:14px;color:#4b5563;">With excitement,</p>
                <p style="margin:4px 0 0;font-size:15px;font-weight:700;color:#4F7FFF;">The TripCrew Team</p>
              </div>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="padding:24px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">TripCrew: Family Travel &nbsp;·&nbsp; <a href="https://tripcrewfamily.com" style="color:#9ca3af;">tripcrewfamily.com</a></p>
              <p style="margin:6px 0 0;font-size:12px;color:#9ca3af;">You received this because you created an account.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim(),
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const apiKey = req.headers.get('apikey') ?? req.headers.get('x-anon-key') ?? '';
    const expectedAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    if (!apiKey || apiKey !== expectedAnonKey) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? '';
    const from = Deno.env.get('RESEND_FROM_EMAIL') ?? DEFAULT_FROM;
    if (!resendApiKey) {
      return jsonResponse({ error: 'Email function is not configured.' }, 500);
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const recipientEmail = sanitizeText(body.email, 320).toLowerCase();
    const fullName = sanitizeText(body.fullName, 120);

    if (!isValidEmail(recipientEmail)) {
      return jsonResponse({ error: 'A valid recipient email is required.' }, 400);
    }

    const firstName = fullName.split(' ')[0] ?? '';
    const email = buildWelcomeEmail(firstName, fullName);

    const resendResponse = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'TripCrew/1.0',
      },
      body: JSON.stringify({
        from,
        to: [recipientEmail],
        subject: email.subject,
        html: email.html,
        text: email.text,
        tags: [{ name: 'kind', value: 'welcome' }],
      }),
    });

    const resendBody = await resendResponse.json().catch(() => null);
    if (!resendResponse.ok) {
      return jsonResponse({ error: 'Resend request failed.', details: resendBody }, resendResponse.status);
    }

    return jsonResponse({ sent: 1, id: resendBody?.id ?? null });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
