import React, { useState } from 'react';
import {
  View, Text, StyleSheet,
  TouchableOpacity, Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainStackParamList } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useTripContext } from '../../contexts/TripContext';
import { pollService } from '../../services/pollService';
import { tripEmailService } from '../../services/tripEmailService';
import { whatsappService } from '../../services/whatsappService';
import { AppTextInput } from '../../components/AppTextInput';
import { AppButton } from '../../components/AppButton';
import { FormKeyboardView } from '../../components/FormKeyboardView';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../constants/theme';

type Props = NativeStackScreenProps<MainStackParamList, 'CreatePoll'>;

const DURATIONS: { label: string; hours: number | null }[] = [
  { label: 'No limit', hours: null },
  { label: '1h', hours: 1 },
  { label: '2h', hours: 2 },
  { label: '6h', hours: 6 },
  { label: '12h', hours: 12 },
  { label: '24h', hours: 24 },
  { label: '3 days', hours: 72 },
  { label: '7 days', hours: 168 },
];

export function CreatePollScreen({ navigation, route }: Props) {
  const { tripId } = route.params;
  const { user } = useAuth();
  const { currentTrip } = useTripContext();
  const [question, setQuestion] = useState('');
  const [description, setDescription] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [durationHours, setDurationHours] = useState<number | null>(24);
  const [emailEveryone, setEmailEveryone] = useState(false);
  const [whatsappEveryone, setWhatsappEveryone] = useState(false);
  const [loading, setLoading] = useState(false);

  function updateOption(idx: number, value: string) {
    setOptions((prev) => prev.map((o, i) => (i === idx ? value : o)));
  }

  function addOption() { setOptions((prev) => [...prev, '']); }
  function removeOption(idx: number) {
    if (options.length <= 2) return;
    setOptions((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleCreate() {
    if (!question.trim()) { Alert.alert('Error', 'Question is required'); return; }
    const validOptions = options.filter((o) => o.trim());
    if (validOptions.length < 2) { Alert.alert('Error', 'At least 2 options required'); return; }
    if (!user) return;

    const deadline = durationHours
      ? new Date(Date.now() + durationHours * 3600 * 1000).toISOString()
      : undefined;

    setLoading(true);
    const { data: createdPoll, error } = await pollService.createPoll(
      tripId, user.id, question.trim(), validOptions, description.trim() || undefined,
      deadline,
    );
    setLoading(false);
    if (error) Alert.alert('Error', error);
    else {
      if (emailEveryone) {
        const email = await tripEmailService.emailPoll(
          tripId,
          currentTrip,
          question.trim(),
          validOptions.map((option) => option.trim()),
          description.trim() || undefined,
          createdPoll?.id
        );
        if (email.error) Alert.alert('Email not sent', email.error);
      }
      if (whatsappEveryone && createdPoll?.id) {
        const wa = await whatsappService.sendPollWhatsApp(tripId, createdPoll.id, question.trim());
        if (wa.error) Alert.alert('WhatsApp not sent', wa.error);
      }
      navigation.goBack();
    }
  }

  return (
    <FormKeyboardView contentContainerStyle={styles.container}>
        <AppTextInput label="Question" required value={question} onChangeText={setQuestion} placeholder="Where should we have dinner?" />
        <AppTextInput label="Description" value={description} onChangeText={setDescription} placeholder="Optional details..." multiline />

        <Text style={styles.label}>Options</Text>
        {options.map((opt, idx) => (
          <View key={idx} style={styles.optionRow}>
            <AppTextInput
              value={opt}
              onChangeText={(v) => updateOption(idx, v)}
              placeholder={`Option ${idx + 1}`}
              containerStyle={styles.optionInput}
            />
            {options.length > 2 && (
              <TouchableOpacity onPress={() => removeOption(idx)} style={styles.removeBtn}>
                <Text style={styles.removeBtnText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
        <TouchableOpacity onPress={addOption} style={styles.addOptionBtn}>
          <Text style={styles.addOptionText}>+ Add option</Text>
        </TouchableOpacity>

        <Text style={styles.label}>Closes in <Text style={styles.labelNote}>(optional)</Text></Text>
        <View style={styles.durationRow}>
          {DURATIONS.map((d) => (
            <TouchableOpacity
              key={d.label}
              style={[styles.durationChip, durationHours === d.hours && styles.durationChipActive]}
              onPress={() => setDurationHours(d.hours)}
            >
              <Text style={[styles.durationText, durationHours === d.hours && styles.durationTextActive]}>
                {d.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={styles.emailToggle}
          onPress={() => setEmailEveryone((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: emailEveryone }}
        >
          <View style={[styles.emailCheckbox, emailEveryone && styles.emailCheckboxActive]}>
            {emailEveryone && <Text style={styles.emailCheckmark}>✓</Text>}
          </View>
          <View style={styles.emailToggleCopy}>
            <Text style={styles.emailToggleTitle}>Email everyone</Text>
            <Text style={styles.emailToggleText}>Sends automatically to trip members after creating.</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.emailToggle}
          onPress={() => setWhatsappEveryone((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: whatsappEveryone }}
        >
          <View style={[styles.emailCheckbox, whatsappEveryone && styles.emailCheckboxActive]}>
            {whatsappEveryone && <Text style={styles.emailCheckmark}>✓</Text>}
          </View>
          <View style={styles.emailToggleCopy}>
            <Text style={styles.emailToggleTitle}>WhatsApp everyone</Text>
            <Text style={styles.emailToggleText}>Sends a WhatsApp message to members with a phone number.</Text>
          </View>
        </TouchableOpacity>

        <AppButton title="Create Poll" onPress={handleCreate} loading={loading} fullWidth style={styles.createBtn} />
    </FormKeyboardView>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.md },
  label: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.text, marginBottom: Spacing.sm },
  labelNote: { fontWeight: FontWeight.regular, color: Colors.textSecondary },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  optionInput: { flex: 1, marginBottom: 0 },
  removeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.danger + '20', alignItems: 'center', justifyContent: 'center' },
  removeBtnText: { color: Colors.danger, fontSize: 14 },
  addOptionBtn: { padding: Spacing.md, alignItems: 'center', marginBottom: Spacing.md },
  addOptionText: { color: Colors.primary, fontSize: FontSize.md, fontWeight: FontWeight.semiBold },
  durationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg },
  durationChip: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  durationChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  durationText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  durationTextActive: { color: Colors.primary, fontWeight: FontWeight.semiBold },
  emailToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    backgroundColor: Colors.surface,
  },
  emailCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emailCheckboxActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  emailCheckmark: {
    color: Colors.surface,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  emailToggleCopy: { flex: 1 },
  emailToggleTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold, color: Colors.text },
  emailToggleText: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  createBtn: { marginTop: Spacing.sm },
});
