import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

// Only UUIDs / alphanumeric IDs are accepted — prevents injection
function isSafeId(value: string): boolean {
  return value.length > 0 && value.length <= 128 && /^[A-Za-z0-9_\-]+$/.test(value);
}

serve((req) => {
  const url = new URL(req.url);
  const rawType = url.searchParams.get('type') ?? '';
  const rawTripId = url.searchParams.get('tripId') ?? '';
  const rawPollId = url.searchParams.get('pollId') ?? '';

  // Whitelist allowed types; reject everything else
  const type = ['poll', 'trip', 'home'].includes(rawType) ? rawType : 'home';
  const tripId = isSafeId(rawTripId) ? rawTripId : '';
  const pollId = isSafeId(rawPollId) ? rawPollId : '';

  let deepLink = 'travelcrew://';
  let label = 'Open TripCrew';

  if (type === 'poll' && pollId && tripId) {
    deepLink = `travelcrew://poll?pollId=${encodeURIComponent(pollId)}&tripId=${encodeURIComponent(tripId)}`;
    label = 'View Poll in TripCrew';
  } else if (type === 'trip' && tripId) {
    deepLink = `travelcrew://trip?tripId=${encodeURIComponent(tripId)}`;
    label = 'Open Trip in TripCrew';
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Opening TripCrew…</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #E8F4FD;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
    }
    .card {
      background: #fff;
      border-radius: 20px;
      padding: 40px 32px;
      text-align: center;
      max-width: 360px;
      width: 100%;
      box-shadow: 0 8px 40px rgba(79,127,255,0.12);
    }
    .emoji { font-size: 56px; margin-bottom: 16px; }
    h1 { font-size: 22px; font-weight: 800; color: #1a1a2e; margin-bottom: 8px; }
    p  { font-size: 15px; color: #6b7280; line-height: 1.6; margin-bottom: 28px; }
    a.btn {
      display: inline-block;
      background: linear-gradient(135deg, #38BDF8 0%, #6366F1 100%);
      color: #fff;
      text-decoration: none;
      padding: 14px 32px;
      border-radius: 50px;
      font-size: 16px;
      font-weight: 700;
    }
  </style>
  <script>
    // Auto-redirect immediately; fallback button stays for manual tap
    window.location.href = ${JSON.stringify(deepLink)};
  </script>
</head>
<body>
  <div class="card">
    <div class="emoji">🏖️</div>
    <h1>Opening TripCrew…</h1>
    <p>If the app doesn't open automatically, tap the button below.</p>
    <a class="btn" href="${deepLink}">${label}</a>
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
});
