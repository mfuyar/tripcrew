import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainStackParamList, Poll } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useTripContext } from '../../contexts/TripContext';
import { pollService } from '../../services/pollService';
import { LoadingView } from '../../components/LoadingView';
import { StatusBadge } from '../../components/StatusBadge';
import { AppButton } from '../../components/AppButton';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../constants/theme';

type Props = NativeStackScreenProps<MainStackParamList, 'PollDetail'>;

export function PollDetailScreen({ navigation, route }: Props) {
  const { tripId, pollId } = route.params;
  const { user, isDemoMode, isGlobalAdmin } = useAuth();
  const { userFamily, isTripOrganizer } = useTripContext();
  const [poll, setPoll] = useState<Poll | null>(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState<string | null>(null);

  async function load() {
    if (isDemoMode) { setLoading(false); return; }
    const { data } = await pollService.getPollById(pollId);
    setPoll(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, [pollId, isDemoMode]);

  const totalVotes = poll?.options?.reduce((s, o) => s + o.votes_count, 0) ?? 0;

  const userVotedOption = poll?.options?.find((o) =>
    o.votes?.some((v) => v.user_id === user?.id)
  );

  async function handleVote(optionId: string) {
    if (!user || !poll || poll.status === 'closed' || isDemoMode) {
      if (isDemoMode) Alert.alert('Demo Mode', 'Voting is disabled in demo.');
      return;
    }
    setVoting(optionId);
    const { data, error } = await pollService.vote(
      pollId, optionId, tripId, user.id, userFamily?.id, poll.allow_multiple
    );
    setVoting(null);
    if (error) Alert.alert('Error', error);
    else if (data) setPoll(data);
  }

  function timeLeft(deadline?: string): string | null {
    if (!deadline) return null;
    const ms = new Date(deadline).getTime() - Date.now();
    if (ms <= 0) return 'Ended';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (h >= 24) return `${Math.floor(h / 24)}d left`;
    if (h > 0) return `${h}h ${m}m left`;
    return `${m}m left`;
  }

  async function handleClose() {
    Alert.alert('Close Poll', 'This will stop accepting votes.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Close', onPress: async () => { await pollService.closePoll(pollId); load(); } },
    ]);
  }

  async function handleDelete() {
    Alert.alert('Delete Poll', 'This will permanently delete the poll and its votes.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await pollService.deletePoll(pollId);
          if (error) {
            Alert.alert('Delete failed', error);
            return;
          }
          navigation.goBack();
        },
      },
    ]);
  }

  if (loading) return <LoadingView />;
  if (!poll) return null;

  // Only poll creator, trip organizer, or global admin can close/delete
  const canManagePoll = poll.created_by === user?.id || isTripOrganizer || isGlobalAdmin;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <StatusBadge status={poll.status} />
        <Text style={styles.question}>{poll.question}</Text>
        {poll.description ? <Text style={styles.desc}>{poll.description}</Text> : null}
        <Text style={styles.meta}>{totalVotes} total vote{totalVotes !== 1 ? 's' : ''}</Text>
        {userVotedOption && poll.status === 'active' && (
          <Text style={styles.changeHint}>Tap another option to change your vote</Text>
        )}
        {poll.deadline && (
          <Text style={[styles.deadline, timeLeft(poll.deadline) === 'Ended' && styles.deadlineEnded]}>
            ⏱ {timeLeft(poll.deadline) ?? ''}
          </Text>
        )}
      </View>

      {/* Options */}
      <View style={styles.options}>
        {poll.options?.map((opt) => {
          const pct = totalVotes > 0 ? (opt.votes_count / totalVotes) * 100 : 0;
          const isVoted = opt.votes?.some((v) => v.user_id === user?.id);
          return (
            <TouchableOpacity
              key={opt.id}
              style={[styles.optionCard, isVoted && styles.optionCardVoted]}
              onPress={() => handleVote(opt.id)}
              disabled={poll.status === 'closed' || voting !== null}
            >
              <View style={styles.optionTop}>
                <Text style={[styles.optionText, isVoted && styles.optionTextVoted]}>
                  {opt.option_text}
                </Text>
                <Text style={styles.optionVotes}>{opt.votes_count}</Text>
                {isVoted && <Text style={styles.votedIcon}>✓</Text>}
              </View>
              {/* Progress bar */}
              <View style={styles.barBg}>
                <View style={[styles.barFill, { width: `${pct}%` as any, backgroundColor: isVoted ? Colors.primary : Colors.border }]} />
              </View>
              <Text style={styles.pct}>{pct.toFixed(0)}%</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Creator controls */}
      {canManagePoll && (
        <View style={styles.creatorCard}>
          <Text style={styles.creatorTitle}>Poll Controls</Text>
          {poll.status === 'active' ? (
            <AppButton
              title="Close Poll"
              onPress={handleClose}
              variant="outline"
              fullWidth
            />
          ) : (
            <Text style={styles.settingDesc}>This poll is closed.</Text>
          )}
          <View style={styles.deleteWrap}>
            <AppButton
              title="Delete Poll"
              onPress={handleDelete}
              variant="danger"
              fullWidth
            />
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md },
  header: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.lg, ...Shadow.sm, gap: Spacing.sm },
  question: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.text },
  desc: { fontSize: FontSize.md, color: Colors.textSecondary },
  meta: { fontSize: FontSize.sm, color: Colors.textSecondary },
  deadline: { fontSize: FontSize.sm, color: Colors.warning, fontWeight: FontWeight.semiBold },
  deadlineEnded: { color: Colors.textSecondary },
  options: { gap: Spacing.sm },
  optionCard: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 2, borderColor: 'transparent', ...Shadow.sm },
  optionCardVoted: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  optionTop: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  optionText: { flex: 1, fontSize: FontSize.md, color: Colors.text, fontWeight: FontWeight.medium },
  optionTextVoted: { color: Colors.primary, fontWeight: FontWeight.semiBold },
  optionVotes: { fontSize: FontSize.sm, color: Colors.textSecondary, marginRight: Spacing.xs },
  votedIcon: { color: Colors.primary, fontSize: 16, fontWeight: FontWeight.bold },
  barBg: { height: 6, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
  barFill: { height: '100%', borderRadius: 3 },
  pct: { fontSize: FontSize.xs, color: Colors.textSecondary, textAlign: 'right' },
  changeHint: { fontSize: FontSize.xs, color: Colors.primary, fontStyle: 'italic' },
  creatorCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginTop: Spacing.md,
    ...Shadow.sm,
  },
  creatorTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semiBold,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingInfo: { flex: 1, marginRight: Spacing.md },
  settingLabel: { fontSize: FontSize.md, fontWeight: FontWeight.medium, color: Colors.text },
  settingDesc: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  deleteWrap: { marginTop: Spacing.sm },
});
