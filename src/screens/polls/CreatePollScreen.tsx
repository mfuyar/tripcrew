import React, { useState } from 'react';
import {
  View, Text, StyleSheet,
  TouchableOpacity, Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainStackParamList } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { pollService } from '../../services/pollService';
import { AppTextInput } from '../../components/AppTextInput';
import { AppButton } from '../../components/AppButton';
import { FormKeyboardView } from '../../components/FormKeyboardView';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../constants/theme';

type Props = NativeStackScreenProps<MainStackParamList, 'CreatePoll'>;

export function CreatePollScreen({ navigation, route }: Props) {
  const { tripId } = route.params;
  const { user } = useAuth();
  const [question, setQuestion] = useState('');
  const [description, setDescription] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [deadline, setDeadline] = useState('');
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
    setLoading(true);
    const { error } = await pollService.createPoll(
      tripId, user.id, question.trim(), validOptions, description.trim() || undefined,
      deadline || undefined,
    );
    setLoading(false);
    if (error) Alert.alert('Error', error);
    else navigation.goBack();
  }

  return (
    <FormKeyboardView contentContainerStyle={styles.container}>
        <AppTextInput label="Question *" value={question} onChangeText={setQuestion} placeholder="Where should we have dinner?" />
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

        <AppTextInput
          label="Deadline"
          value={deadline}
          onChangeText={setDeadline}
          placeholder="YYYY-MM-DD (optional)"
          keyboardType="numbers-and-punctuation"
        />

        <AppButton title="Create Poll" onPress={handleCreate} loading={loading} fullWidth style={styles.createBtn} />
    </FormKeyboardView>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.md },
  label: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.text, marginBottom: Spacing.sm },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  optionInput: { flex: 1, marginBottom: 0 },
  removeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.danger + '20', alignItems: 'center', justifyContent: 'center' },
  removeBtnText: { color: Colors.danger, fontSize: 14 },
  addOptionBtn: { padding: Spacing.md, alignItems: 'center', marginBottom: Spacing.md },
  addOptionText: { color: Colors.primary, fontSize: FontSize.md, fontWeight: FontWeight.semiBold },
  createBtn: { marginTop: Spacing.sm },
});
