type ReceiptLineItem = {
  description: string;
  amount: number | null;
  quantity?: number | null;
};

type ParsedReceipt = {
  is_receipt: boolean | null;
  confidence: number | null;
  rejection_reason: string | null;
  merchant: string | null;
  total: number | null;
  date: string | null;
  raw_text: string | null;
  items: ReceiptLineItem[];
};

type ReceiptScanRow = {
  id: string;
  trip_id: string;
  image_url: string;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const receiptSchema = {
  type: 'object',
  properties: {
    is_receipt: {
      type: ['boolean', 'null'],
      description: 'True only when the image is a real purchase receipt or invoice.',
    },
    confidence: {
      type: ['number', 'null'],
      description: '0 to 1 confidence that this is a legitimate receipt and the extracted total/date are reliable.',
    },
    rejection_reason: {
      type: ['string', 'null'],
      description: 'Short reason if the image is not a legitimate receipt or cannot be reliably read.',
    },
    merchant: {
      type: ['string', 'null'],
      description: 'Merchant, store, restaurant, or vendor name from the receipt.',
    },
    total: {
      type: ['number', 'null'],
      description: 'Final receipt total paid. Use a decimal number without currency symbols.',
    },
    date: {
      type: ['string', 'null'],
      format: 'date',
      description: 'Purchase date in YYYY-MM-DD format.',
    },
    raw_text: {
      type: ['string', 'null'],
      description: 'Concise transcription of visible receipt text.',
    },
    items: {
      type: 'array',
      description: 'Line items visible on the receipt.',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          amount: { type: ['number', 'null'] },
          quantity: { type: ['number', 'null'] },
        },
        required: ['description', 'amount'],
      },
    },
  },
  required: ['is_receipt', 'confidence', 'rejection_reason', 'merchant', 'total', 'date', 'raw_text', 'items'],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function normalizeDate(value: string | null) {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function normalizeParsedReceipt(parsed: ParsedReceipt): ParsedReceipt {
  return {
    is_receipt: typeof parsed.is_receipt === 'boolean' ? parsed.is_receipt : null,
    confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : null,
    rejection_reason: parsed.rejection_reason?.trim() || null,
    merchant: parsed.merchant?.trim() || null,
    total: typeof parsed.total === 'number' && parsed.total > 0 ? parsed.total : null,
    date: normalizeDate(parsed.date),
    raw_text: parsed.raw_text?.trim() || null,
    items: Array.isArray(parsed.items)
      ? parsed.items
          .filter((item) => item.description?.trim())
          .map((item) => ({
            description: item.description.trim(),
            amount: typeof item.amount === 'number' ? item.amount : null,
            quantity: typeof item.quantity === 'number' ? item.quantity : null,
          }))
      : [],
  };
}

function dateOnlyUtc(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function parseDateOnly(value: string | null) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function isDateReallyOff(value: string | null) {
  const parsed = parseDateOnly(value);
  if (!parsed) return false;
  const today = dateOnlyUtc(new Date());
  const diffDays = Math.round((parsed.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  return diffDays < -370 || diffDays > 31;
}

function receiptEvidenceCount(parsed: ParsedReceipt) {
  let count = 0;
  if (parsed.merchant) count += 1;
  if (parsed.total !== null) count += 1;
  if (parsed.date) count += 1;
  if ((parsed.raw_text?.length ?? 0) >= 20) count += 1;
  if (parsed.items.some((item) => item.amount !== null)) count += 1;
  return count;
}

function validationError(parsed: ParsedReceipt) {
  if (parsed.is_receipt === false || (parsed.confidence !== null && parsed.confidence < 0.45)) {
    return parsed.rejection_reason || 'This image does not look like a valid receipt.';
  }
  if (!parsed.total || !parsed.merchant) {
    return 'I could not find a clear merchant and final total on this receipt.';
  }
  if (receiptEvidenceCount(parsed) < 3) {
    return 'This does not have enough readable receipt details to scan safely.';
  }
  if (isDateReallyOff(parsed.date)) {
    return 'The receipt date looks too far from today, so I did not process it.';
  }
  return null;
}

function storagePathFromPublicUrl(imageUrl: string) {
  const marker = '/storage/v1/object/public/trip-media/';
  const index = imageUrl.indexOf(marker);
  if (index < 0) return null;
  return decodeURIComponent(imageUrl.slice(index + marker.length).split('?')[0]);
}

async function deleteRejectedReceipt(
  supabaseUrl: string,
  serviceRoleKey: string,
  receipt: ReceiptScanRow,
) {
  const path = storagePathFromPublicUrl(receipt.image_url);
  if (path) {
    await fetch(`${supabaseUrl}/storage/v1/object/trip-media/${path}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
    }).catch(() => null);
  }

  await fetch(`${supabaseUrl}/rest/v1/receipt_scans?id=eq.${receipt.id}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
    },
  }).catch(() => null);
}

function extractGeminiText(response: any) {
  return response?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text ?? '')
    .join('')
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const geminiApiKey = getRequiredEnv('GEMINI_API_KEY');
    const supabaseUrl = getRequiredEnv('SUPABASE_URL');
    const supabaseAnonKey = getRequiredEnv('SUPABASE_ANON_KEY');
    const supabaseServiceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');
    const geminiModel = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.5-flash';
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) return jsonResponse({ error: 'Missing authorization header' }, 401);

    const { receiptId } = await req.json();
    if (!receiptId) {
      return jsonResponse({ error: 'receiptId is required' }, 400);
    }

    const receiptResponse = await fetch(
      `${supabaseUrl}/rest/v1/receipt_scans?id=eq.${receiptId}&select=id,trip_id,image_url&limit=1`,
      {
        headers: {
          Authorization: authHeader,
          apikey: supabaseAnonKey,
        },
      }
    );

    if (!receiptResponse.ok) {
      const errorText = await receiptResponse.text();
      return jsonResponse({ error: `Could not verify receipt access: ${errorText}` }, 403);
    }

    const receiptRows = (await receiptResponse.json()) as ReceiptScanRow[];
    const receipt = receiptRows[0];
    if (!receipt) return jsonResponse({ error: 'Receipt scan not found or not accessible' }, 404);

    const imageResponse = await fetch(receipt.image_url);
    if (!imageResponse.ok) {
      return jsonResponse({ error: 'Could not download receipt image' }, 400);
    }

    const contentType = imageResponse.headers.get('Content-Type') ?? 'image/jpeg';
    const base64Image = arrayBufferToBase64(await imageResponse.arrayBuffer());
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': geminiApiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: [
                    'Decide if this image is a legitimate purchase receipt or invoice, then extract receipt data.',
                    'Reject menus, screenshots, handwritten notes, random product photos, bank cards, people, documents, or unreadable/blurry images.',
                    'Return only fields visible or strongly implied by the receipt.',
                    'Use null for missing merchant, total, or date.',
                    'The total must be the final amount paid, not subtotal.',
                    'Set is_receipt false and explain rejection_reason when the image is not clearly a receipt.',
                  ].join(' '),
                },
                {
                  inline_data: {
                    mime_type: contentType,
                    data: base64Image,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            responseJsonSchema: receiptSchema,
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      return jsonResponse({ error: `Gemini scan failed: ${errorText}` }, 502);
    }

    const text = extractGeminiText(await geminiResponse.json());
    if (!text) return jsonResponse({ error: 'Gemini returned no receipt data' }, 502);

    const parsed = normalizeParsedReceipt(JSON.parse(text));
    const invalidReason = validationError(parsed);
    if (invalidReason) {
      await deleteRejectedReceipt(supabaseUrl, supabaseServiceRoleKey, receipt);
      return jsonResponse({
        error: `${invalidReason} Please add this expense manually and attach the compressed photo there if you still want to keep it.`,
      }, 422);
    }

    const updateResponse = await fetch(`${supabaseUrl}/rest/v1/receipt_scans?id=eq.${receiptId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
        apikey: supabaseServiceRoleKey,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        raw_text: parsed.raw_text,
        parsed_amount: parsed.total,
        parsed_merchant: parsed.merchant,
        parsed_date: parsed.date,
        parsed_items: parsed.items,
      }),
    });

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      return jsonResponse({ error: `Could not save receipt scan: ${errorText}` }, 500);
    }

    const updatedRows = await updateResponse.json();
    return jsonResponse({ data: updatedRows?.[0] ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Receipt scan failed';
    return jsonResponse({ error: message }, 500);
  }
});
