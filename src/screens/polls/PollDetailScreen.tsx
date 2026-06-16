import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainStackParamList, Poll } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useTripContext } from '../../contexts/TripContext';
import { pollService } from '../../services/pollService';
import { tripEmailService } from '../../services/tripEmailService';
import { whatsappService } from '../../services/whatsappService';
import { LoadingView } from '../../components/LoadingView';
import { StatusBadge } from '../../components/StatusBadge';
import { AppButton } from '../../components/AppButton';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../constants/theme';

type Props = NativeStackScreenProps<MainStackParamList, 'PollDetail'>;

export function PollDetailScreen({ navigation, route }: Props) {
  const { tripId, pollId } = route.params;
  const { user, isDemoMode, isGlobalAdmin } = useAuth();
  const { userFamily, isTripOrganizer, canManageTrip } = useTripContext();
  const [poll, setPoll] = useState<Poll | null>(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState<string | null>(null);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editQuestion, setEditQuestion] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editOptions, setEditOptions] = useState<{ id?: string; option_text: string }[]>([]);

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

  async function handleSendReminder() {
    if (!poll) return;
    Alert.alert(
      'Send Reminder Email',
      'This will email all trip members asking them to vote on this poll.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            setSendingReminder(true);
            const { data: count, error } = await tripEmailService.emailPollReminder(
              tripId,
              poll.question,
              (poll.options ?? []).map((o) => o.option_text),
              poll.description ?? undefined,
              poll.id
            );
            setSendingReminder(false);
            if (error) {
              Alert.alert('Failed to send', error);
            } else {
              Alert.alert('Reminder sent', `Emailed ${count} trip member${count === 1 ? '' : 's'}.`);
            }
          },
        },
      ]
    );
  }

  async function handleWhatsAppReminder() {
    if (!poll) return;
    Alert.alert(
      'WhatsApp Reminder',
      'Send a WhatsApp reminder to all trip members who have a phone number?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            setSendingWhatsApp(true);
            const { data, error } = await whatsappService.sendPollReminderWhatsApp(tripId, poll.id, poll.question);
            setSendingWhatsApp(false);
            if (error) Alert.alert('WhatsApp failed', error);
            else Alert.alert('Sent!', `WhatsApp reminder sent to ${data!.sent} of ${data!.total} members.`);
          },
        },
      ]
    );
  }

  async function handleClose() {
    Alert.alert('Close Poll', 'This will stop accepting votes.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Close', onPress: async () => { await pollService.closePoll(pollId); load(); } },
    ]);
  }

  async function handleDelete() {
    Alert.alert('Delete Poll', 'This will hide the poll and keep its audit history.', [
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

  function openEdit() {
    if (!poll) return;
    setEditQuestion(poll.question);
    setEditDescription(poll.description ?? '');
    setEditOptions((poll.options ?? []).map((option) => ({
      id: option.id,
      option_text: option.option_text,
    })));
    setShowEdit(true);
  }

  function updateDraftOption(index: number, optionText: string) {
    setEditOptions((current) => current.map((option, i) => (
      i === index ? { ...option, option_text: optionText } : option
    )));
  }

  function removeDraftOption(index: number) {
    if (editOptions.length <= 2) {
      Alert.alert('Keep two choices', 'A poll needs at least two choices.');
      return;
    }
    setEditOptions((current) => current.filter((_, i) => i !== index));
  }

  async function saveEdit() {
    if (!poll) return;
    const cleanedOptions = editOptions
      .map((option) => ({ ...option, option_text: option.option_text.trim() }))
      .filter((option) => option.option_text.length > 0);

    if (!editQuestion.trim()) {
      Alert.alert('Question required', 'Add a poll question.');
      return;
    }
    if (cleanedOptions.length < 2) {
      Alert.alert('Choices required', 'A poll needs at least two choices.');
      return;
    }

    setSavingEdit(true);
    const { data, error } = await pollService.updatePollWithOptions(poll.id, {
      question: editQuestion.trim(),
      description: editDescription.trim() || null,
      allow_multiple: poll.allow_multiple,
      options: cleanedOptions,
    });
    setSavingEdit(false);

    if (error) {
      Alert.alert('Unable to save poll', error);
      return;
    }

    if (data) setPoll(data);
    setShowEdit(false);
  }

  if (loading) return <LoadingView />;
  if (!poll) return null;

  const canEditPoll = poll.created_by === user?.id || canManageTrip || isGlobalAdmin;
  const canDeletePoll = isTripOrganizer || isGlobalAdmin;

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
      {canEditPoll && (
        <View style={styles.creatorCard}>
          <Text style={styles.creatorTitle}>Poll Controls</Text>
          <AppButton
            title="Edit Choices"
            onPress={openEdit}
            variant="outline"
            fullWidth
          />
          {poll.status === 'active' ? (
            <>
              <AppButton
                title="📧 Send Reminder Email"
                onPress={handleSendReminder}
                loading={sendingReminder}
                variant="outline"
                fullWidth
                style={styles.controlButton}
              />
              <AppButton
                title="💬 Send WhatsApp Reminder"
                onPress={handleWhatsAppReminder}
                loading={sendingWhatsApp}
                variant="outline"
                fullWidth
                style={styles.controlButton}
              />
              <AppButton
                title="Close Poll"
                onPress={handleClose}
                variant="outline"
                fullWidth
                style={styles.controlButton}
              />
            </>
          ) : (
            <Text style={styles.settingDesc}>This poll is closed.</Text>
          )}
          {canDeletePoll && (
            <View style={styles.deleteWrap}>
              <AppButton
                title="Delete Poll"
                onPress={handleDelete}
                variant="danger"
                fullWidth
              />
            </View>
          )}
        </View>
      )}

      <Modal visible={showEdit} transparent animationType="slide" onRequestClose={() => setShowEdit(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            style={styles.keyboardAvoider}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalContent}>
              <View style={styles.modalBox}>
                <Text style={styles.modalTitle}>Edit Poll</Text>
                <TextInput
                  style={styles.modalInput}
                  value={editQuestion}
                  onChangeText={setEditQuestion}
                  placeholder="Question"
                  placeholderTextColor={Colors.textSecondary}
                />
                <TextInput
                  style={[styles.modalInput, styles.descriptionInput]}
                  value={editDescription}
                  onChangeText={setEditDescription}
                  placeholder="Description"
                  placeholderTextColor={Colors.textSecondary}
                  multiline
                  textAlignVertical="top"
                />
                <Text style={styles.optionEditTitle}>Choices</Text>
                {editOptions.map((option, index) => (
                  <View key={option.id ?? `new-${index}`} style={styles.optionEditRow}>
                    <TextInput
                      style={[styles.modalInput, styles.optionEditInput]}
                      value={option.option_text}
                      onChangeText={(text) => updateDraftOption(index, text)}
                      placeholder={`Choice ${index + 1}`}
                      placeholderTextColor={Colors.textSecondary}
                    />
                    <TouchableOpacity
                      style={styles.removeChoiceButton}
                      onPress={() => removeDraftOption(index)}
                    >
                      <Text style={styles.removeChoiceText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity
                  style={styles.addChoiceButton}
                  onPress={() => setEditOptions((current) => [...current, { option_text: '' }])}
                >
                  <Text style={styles.addChoiceText}>+ Add Choice</Text>
                </TouchableOpacity>
                <AppButton title="Save Changes" onPress={saveEdit} loading={savingEdit} fullWidth />
                <AppButton
                  title="Cancel"
                  onPress={() => setShowEdit(false)}
                  variant="outline"
                  fullWidth
                  style={styles.cancelButton}
                />
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
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
  controlButton: { marginTop: Spacing.sm },
  deleteWrap: { marginTop: Spacing.sm },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  keyboardAvoider: { flex: 1 },
  modalContent: { flexGrow: 1, justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.xl,
    paddingBottom: Spacing.xl + Spacing.md,
  },
  modalTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.text, marginBottom: Spacing.lg },
  modalInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.text,
    marginBottom: Spacing.md,
    minHeight: 52,
  },
  descriptionInput: { minHeight: 86 },
  optionEditTitle: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.semiBold, marginBottom: Spacing.sm },
  optionEditRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  optionEditInput: { flex: 1 },
  removeChoiceButton: { paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm, marginBottom: Spacing.md },
  removeChoiceText: { color: Colors.danger, fontSize: FontSize.sm, fontWeight: FontWeight.semiBold },
  addChoiceButton: {
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  addChoiceText: { color: Colors.primary, fontSize: FontSize.md, fontWeight: FontWeight.semiBold },
  cancelButton: { marginTop: Spacing.sm },
});
