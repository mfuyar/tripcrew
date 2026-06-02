import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Switch, Platform,
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

export function PollDetailScreen({ route }: Props) {
  const { tripId, pollId } = route.params;
  const { user, isDemoMode } = useAuth();
  const { userFamily } = useTripContext();
  const [poll, setPoll] = useState<Poll | null>(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState<string | null>(null);
  const [togglingMultiple, setTogglingMultiple] = useState(false);

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
    const { error } = await pollService.vote(
      pollId, optionId, tripId, user.id, userFamily?.id, poll.allow_multiple
    );
    setVoting(null);
    if (error) Alert.alert('Error', error);
    else load();
  }

  async function handleToggleMultiple(value: boolean) {
    if (!poll || isDemoMode) return;
    setTogglingMultiple(true);
    const { data } = await pollService.updatePollSettings(pollId, { allow_multiple: value });
    if (data) setPoll({ ...poll, allow_multiple: value });
    setTogglingMultiple(false);
  }

  async function handleClose() {
    Alert.alert('Close Poll', 'This will stop accepting votes.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Close', onPress: async () => { await pollService.closePoll(pollId); load(); } },
    ]);
  }

  if (loading) return <LoadingView />;
  if (!poll) return null;

  const isCreator = poll.created_by === user?.id;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <StatusBadge status={poll.status} />
        <Text style={styles.question}>{poll.question}</Text>
        {poll.description ? <Text style={styles.desc}>{poll.description}</Text> : null}
        <Text style={styles.meta}>{totalVotes} total vote{totalVotes !== 1 ? 's' : ''}</Text>
        {!poll.allow_multiple && userVotedOption && poll.status === 'active' && (
          <Text style={styles.changeHint}>Tap another option to change your vote</Text>
        )}
        {poll.allow_multiple && poll.status === 'active' && (
          <Text style={styles.changeHint}>Tap a selected option again to remove your vote</Text>
        )}
        {poll.deadline && (
          <Text style={styles.deadline}>Deadline: {new Date(poll.deadline).toLocaleDateString()}</Text>
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
      {isCreator && poll.status === 'active' && (
        <View style={styles.creatorCard}>
          <Text style={styles.creatorTitle}>Poll Settings</Text>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Allow multiple choices</Text>
              <Text style={styles.settingDesc}>Members can select more than one option</Text>
            </View>
            <Switch
              value={poll.allow_multiple}
              onValueChange={handleToggleMultiple}
              disabled={togglingMultiple}
              trackColor={{ false: Colors.border, true: Colors.primary }}
              thumbColor={Colors.surface}
            />
          </View>
          <AppButton
            title="Close Poll"
            onPress={handleClose}
            variant="outline"
            fullWidth
            style={{ marginTop: Spacing.sm }}
          />
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
  deadline: { fontSize: FontSize.sm, color: Colors.warning },
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
});
