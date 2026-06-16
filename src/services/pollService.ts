import { supabase } from '../lib/supabaseClient';
import { Poll, PollOption, PollVersion, ServiceResult } from '../types';
import { notificationService } from './notificationService';

export const pollService = {
  async createPoll(
    tripId: string,
    userId: string,
    question: string,
    options: string[],
    description?: string,
    deadline?: string,
    allowMultiple = false
  ): Promise<ServiceResult<Poll>> {
    const { data: poll, error: pollError } = await supabase
      .from('polls')
      .insert({
        trip_id: tripId,
        created_by: userId,
        question,
        description: description ?? null,
        status: 'active',
        deadline: deadline ?? null,
        allow_multiple: allowMultiple,
      })
      .select()
      .single();
    if (pollError) return { data: null, error: pollError.message };

    const optionRows = options.map((text) => ({
      poll_id: poll.id,
      trip_id: tripId,
      option_text: text,
      votes_count: 0,
    }));
    const { error: optError } = await supabase
      .from('poll_options')
      .insert(optionRows);
    if (optError) return { data: null, error: optError.message };

    const result = await pollService.getPollById(poll.id);

    // Notify all other trip members
    const notify = await notificationService.notifyTripMembers(
      tripId, userId, 'poll',
      '🗳️ New Poll',
      question,
      { poll_id: poll.id }
    );
    if (notify.error) {
      console.warn(`[polls] notification failed for ${poll.id}: ${notify.error}`);
    }

    return result;
  },

  async getActivePolls(tripId: string, limit = 3): Promise<ServiceResult<Poll[]>> {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('polls')
      .select('*, options:poll_options(*, votes:poll_votes(*)), creator:profiles!polls_created_by_fkey(*)')
      .eq('trip_id', tripId)
      .eq('status', 'active')
      .eq('is_deleted', false)
      .eq('options.is_deleted', false)
      .or(`deadline.is.null,deadline.gt.${now}`)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return { data: null, error: error.message };
    return { data: data as Poll[], error: null };
  },

  async getPolls(tripId: string): Promise<ServiceResult<Poll[]>> {
    const { data, error } = await supabase
      .from('polls')
      .select('*, options:poll_options(*, votes:poll_votes(*)), creator:profiles!polls_created_by_fkey(*)')
      .eq('trip_id', tripId)
      .eq('is_deleted', false)
      .eq('options.is_deleted', false)
      .order('created_at', { ascending: false });
    if (error) return { data: null, error: error.message };
    return { data: data as Poll[], error: null };
  },

  async getPollById(pollId: string): Promise<ServiceResult<Poll>> {
    const { data, error } = await supabase
      .from('polls')
      .select('*, options:poll_options(*, votes:poll_votes(*)), creator:profiles!polls_created_by_fkey(*)')
      .eq('id', pollId)
      .eq('is_deleted', false)
      .eq('options.is_deleted', false)
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as Poll, error: null };
  },

  async vote(
    pollId: string,
    optionId: string,
    tripId: string,
    userId: string,
    familyId?: string,
    _allowMultiple?: boolean
  ): Promise<ServiceResult<Poll>> {
    const { error } = await supabase.rpc('cast_poll_vote', {
      p_poll_id: pollId,
      p_option_id: optionId,
      p_trip_id: tripId,
      p_user_id: userId,
      p_family_id: familyId ?? null,
    });
    if (error) return { data: null, error: error.message };
    return pollService.getPollById(pollId);
  },

  async updatePollSettings(
    pollId: string,
    updates: { allow_multiple?: boolean }
  ): Promise<ServiceResult<Poll>> {
    const { data, error } = await supabase
      .from('polls')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', pollId)
      .select()
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as Poll, error: null };
  },

  async updatePollWithOptions(
    pollId: string,
    input: {
      question: string;
      description?: string | null;
      allow_multiple: boolean;
      options: { id?: string; option_text: string }[];
    }
  ): Promise<ServiceResult<Poll>> {
    const { error } = await supabase.rpc('update_poll_with_options', {
      p_poll_id: pollId,
      p_question: input.question,
      p_description: input.description ?? null,
      p_allow_multiple: input.allow_multiple,
      p_options: input.options,
    });
    if (error) return { data: null, error: error.message };
    return pollService.getPollById(pollId);
  },

  async _decrementOption(optionId: string): Promise<void> {
    await supabase.rpc('decrement_poll_votes', { option_id: optionId });
  },

  async closePoll(pollId: string): Promise<ServiceResult<Poll>> {
    const { data, error } = await supabase
      .from('polls')
      .update({ status: 'closed', updated_at: new Date().toISOString() })
      .eq('id', pollId)
      .select()
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as Poll, error: null };
  },

  async deletePoll(pollId: string): Promise<ServiceResult<null>> {
    const { error } = await supabase
      .from('polls')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', pollId);
    return { data: null, error: error?.message ?? null };
  },

  async getPollResults(pollId: string): Promise<ServiceResult<PollOption[]>> {
    const { data, error } = await supabase
      .from('poll_options')
      .select('*, votes:poll_votes(*, voter:profiles(*))')
      .eq('poll_id', pollId)
      .eq('is_deleted', false)
      .order('votes_count', { ascending: false });
    if (error) return { data: null, error: error.message };
    return { data: data as PollOption[], error: null };
  },

  async getPollVersions(pollId: string): Promise<ServiceResult<PollVersion[]>> {
    const { data, error } = await supabase
      .from('poll_versions')
      .select('*')
      .eq('poll_id', pollId)
      .order('version_number', { ascending: false });
    if (error) return { data: null, error: error.message };
    return { data: data as PollVersion[], error: null };
  },
};
