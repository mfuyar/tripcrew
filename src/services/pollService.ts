import { supabase } from '../lib/supabaseClient';
import { Poll, PollOption, PollVote, ServiceResult } from '../types';
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
    familyId?: string
  ): Promise<ServiceResult<PollVote>> {
    // Check if user already voted on this option
    const { data: existing } = await supabase
      .from('poll_votes')
      .select('id')
      .eq('poll_id', pollId)
      .eq('poll_option_id', optionId)
      .eq('user_id', userId)
      .single();
    if (existing) return { data: null, error: 'Already voted on this option' };

    const { data, error } = await supabase
      .from('poll_votes')
      .insert({
        poll_id: pollId,
        poll_option_id: optionId,
        trip_id: tripId,
        user_id: userId,
        family_id: familyId ?? null,
      })
      .select()
      .single();
    if (error) return { data: null, error: error.message };

    // Increment votes_count
    await supabase.rpc('increment_poll_votes', { option_id: optionId });
    return { data: data as PollVote, error: null };
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
