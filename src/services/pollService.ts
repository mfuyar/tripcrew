import { supabase } from '../lib/supabaseClient';
import { Poll, PollOption, ServiceResult } from '../types';
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
    notificationService.notifyTripMembers(
      tripId, userId, 'poll',
      '🗳️ New Poll',
      question,
      { poll_id: poll.id }
    );

    return result;
  },

  async getPolls(tripId: string): Promise<ServiceResult<Poll[]>> {
    const { data, error } = await supabase
      .from('polls')
      .select('*, options:poll_options(*, votes:poll_votes(*)), creator:profiles(*)')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false });
    if (error) return { data: null, error: error.message };
    return { data: data as Poll[], error: null };
  },

  async getPollById(pollId: string): Promise<ServiceResult<Poll>> {
    const { data, error } = await supabase
      .from('polls')
      .select('*, options:poll_options(*, votes:poll_votes(*)), creator:profiles(*)')
      .eq('id', pollId)
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
      .delete()
      .eq('id', pollId);
    return { data: null, error: error?.message ?? null };
  },

  async getPollResults(pollId: string): Promise<ServiceResult<PollOption[]>> {
    const { data, error } = await supabase
      .from('poll_options')
      .select('*, votes:poll_votes(*, voter:profiles(*))')
      .eq('poll_id', pollId)
      .order('votes_count', { ascending: false });
    if (error) return { data: null, error: error.message };
    return { data: data as PollOption[], error: null };
  },
};
