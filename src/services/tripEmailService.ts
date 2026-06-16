import { supabase, supabaseAnonKey, supabaseUrl } from '../lib/supabaseClient';
import { ServiceResult, Trip } from '../types';

async function sendWelcomeEmail(email: string, fullName: string): Promise<ServiceResult<null>> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-welcome-email`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, fullName }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null) as { error?: string } | null;
      return { data: null, error: body?.error ?? `Welcome email failed (${res.status}).` };
    }
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Welcome email could not be sent.' };
  }
}

type SendEmailResponse = {
  sent?: number;
  recipientCount?: number;
  error?: string;
  details?: unknown;
};

function formatEmailResponseError(response: SendEmailResponse | null, fallback: string) {
  if (response?.error) {
    const details = response.details ? ` ${JSON.stringify(response.details)}` : '';
    return `${response.error}${details}`;
  }
  return fallback;
}

async function sendTripEmail(input: {
  tripId: string;
  kind: 'announcement' | 'poll' | 'invite' | 'reminder';
  title?: string;
  body?: string;
  options?: string[];
  pollId?: string;
  recipientEmail?: string;
  recipientName?: string;
  familyName?: string;
  familyId?: string;
  inviteLink?: string;
}): Promise<ServiceResult<number>> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.access_token) {
    return { data: null, error: sessionError?.message ?? 'Please sign in again before sending email.' };
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sessionData.session.access_token}`,
      apikey: supabaseAnonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const response = await res.json().catch(() => null) as SendEmailResponse | null;
  if (!res.ok) return { data: null, error: formatEmailResponseError(response, `Email function failed (${res.status}).`) };
  if (response?.error) return { data: null, error: formatEmailResponseError(response, 'Email could not be sent.') };
  return { data: response?.sent ?? 0, error: null };
}

export const welcomeEmailService = {
  send: sendWelcomeEmail,
};

export const tripEmailService = {
  async emailAnnouncement(
    tripId: string,
    _trip: Trip | null | undefined,
    title: string,
    content: string
  ): Promise<ServiceResult<number>> {
    return sendTripEmail({
      tripId,
      kind: 'announcement',
      title,
      body: content,
    });
  },

  async emailPoll(
    tripId: string,
    _trip: Trip | null | undefined,
    question: string,
    options: string[],
    description?: string,
    pollId?: string
  ): Promise<ServiceResult<number>> {
    return sendTripEmail({
      tripId,
      kind: 'poll',
      title: question,
      body: description || question,
      options,
      pollId,
    });
  },

  async emailPollReminder(
    tripId: string,
    question: string,
    options: string[],
    description?: string,
    pollId?: string
  ): Promise<ServiceResult<number>> {
    return sendTripEmail({
      tripId,
      kind: 'reminder',
      title: question,
      body: description || question,
      options,
      pollId,
    });
  },

  async emailTripInvite(input: {
    tripId: string;
    recipientEmail: string;
    recipientName?: string;
    familyName?: string;
    familyId?: string;
    inviteLink?: string;
  }): Promise<ServiceResult<number>> {
    return sendTripEmail({
      kind: 'invite',
      ...input,
    });
  },
};
