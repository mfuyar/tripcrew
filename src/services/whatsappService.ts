import { supabase, supabaseAnonKey, supabaseUrl } from '../lib/supabaseClient';
import { ServiceResult } from '../types';

type WhatsAppKind = 'poll' | 'poll_reminder' | 'emergency';

type SendWhatsAppResponse = {
  sent?: number;
  failed?: number;
  total?: number;
  skipped?: number;
  reason?: string;
  error?: string;
};

async function sendWhatsApp(input: {
  tripId: string;
  kind: WhatsAppKind;
  message?: string;
  pollId?: string;
  familyId?: string;
  includeSelf?: boolean;
}): Promise<ServiceResult<{ sent: number; total: number }>> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return { data: null, error: 'Please sign in before sending WhatsApp messages.' };

  const res = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  const body = await res.json().catch(() => null) as SendWhatsAppResponse | null;

  if (!res.ok) {
    return { data: null, error: body?.error ?? `WhatsApp send failed (${res.status}).` };
  }
  if (body?.error) {
    return { data: null, error: body.error };
  }

  const sent = body?.sent ?? 0;
  const total = body?.total ?? sent;

  if (total === 0) {
    const reason = body?.reason ?? 'No recipients have a phone number saved in their profile.';
    return { data: null, error: reason };
  }

  return { data: { sent, total }, error: null };
}

export const whatsappService = {
  sendPollWhatsApp(tripId: string, pollId: string, question: string): Promise<ServiceResult<{ sent: number; total: number }>> {
    return sendWhatsApp({ tripId, kind: 'poll', pollId, message: question, includeSelf: true });
  },

  sendPollReminderWhatsApp(tripId: string, pollId: string, question: string): Promise<ServiceResult<{ sent: number; total: number }>> {
    return sendWhatsApp({ tripId, kind: 'poll_reminder', pollId, message: question, includeSelf: true });
  },

  sendEmergency(tripId: string, message: string, familyId?: string, includeSelf = false): Promise<ServiceResult<{ sent: number; total: number }>> {
    return sendWhatsApp({ tripId, kind: 'emergency', message, familyId, includeSelf });
  },
};
