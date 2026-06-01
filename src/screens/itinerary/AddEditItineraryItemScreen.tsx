import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform,
  TouchableOpacity, Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainStackParamList, ItineraryType } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { itineraryService } from '../../services/itineraryService';
import { AppTextInput } from '../../components/AppTextInput';
import { AppButton } from '../../components/AppButton';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../constants/theme';

type Props = NativeStackScreenProps<MainStackParamList, 'AddEditItineraryItem'>;

const TYPES: { value: ItineraryType; label: string; emoji: string }[] = [
  { value: 'activity', label: 'Activity', emoji: '🎯' },
  { value: 'meal', label: 'Meal', emoji: '🍽️' },
  { value: 'transport', label: 'Transport', emoji: '🚗' },
  { value: 'accommodation', label: 'Accommodation', emoji: '🏨' },
  { value: 'free_time', label: 'Free Time', emoji: '☀️' },
  { value: 'other', label: 'Other', emoji: '📌' },
];

export function AddEditItineraryItemScreen({ navigation, route }: Props) {
  const { tripId, itemId } = route.params;
  const { user } = useAuth();
  const isEdit = !!itemId;

  const [title, setTitle] = useState('');
  const [type, setType] = useState<ItineraryType>('activity');
  const [location, setLocation] = useState('');
  const [startDatetime, setStartDatetime] = useState('');
  const [endDatetime, setEndDatetime] = useState('');
  const [costEstimate, setCostEstimate] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isEdit && itemId) {
      itineraryService.getItems(tripId).then(({ data }) => {
        const item = data?.find((i) => i.id === itemId);
        if (item) {
          setTitle(item.title);
          setType(item.item_type);
          setLocation(item.location ?? '');
          setStartDatetime(item.start_datetime);
          setEndDatetime(item.end_datetime ?? '');
          setCostEstimate(item.cost_estimate ? String(item.cost_estimate) : '');
          setNotes(item.notes ?? '');
        }
      });
    }
  }, [itemId]);

  async function handleSave() {
    if (!title.trim()) { Alert.alert('Error', 'Title is required'); return; }
    if (!startDatetime) { Alert.alert('Error', 'Start date/time is required'); return; }
    if (!user) return;
    setLoading(true);
    const payload = {
      title: title.trim(),
      item_type: type,
      location: location.trim() || undefined,
      start_datetime: startDatetime,
      end_datetime: endDatetime || undefined,
      cost_estimate: costEstimate ? parseFloat(costEstimate) : undefined,
      notes: notes.trim() || undefined,
    };
    if (isEdit && itemId) {
      const { error } = await itineraryService.updateItem(itemId, payload);
      if (error) { Alert.alert('Error', error); } else { navigation.goBack(); }
    } else {
      const { error } = await itineraryService.createItem(tripId, user.id, payload);
      if (error) { Alert.alert('Error', error); } else { navigation.goBack(); }
    }
    setLoading(false);
  }

  async function handleDelete() {
    if (!itemId) return;
    Alert.alert('Delete Item', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await itineraryService.deleteItem(itemId);
        navigation.goBack();
      }},
    ]);
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <AppTextInput label="Title *" value={title} onChangeText={setTitle} placeholder="Beach picnic..." />

        <Text style={styles.label}>Type</Text>
        <View style={styles.typeRow}>
          {TYPES.map((t) => (
            <TouchableOpacity
              key={t.value}
              style={[styles.typeChip, type === t.value && styles.typeChipActive]}
              onPress={() => setType(t.value)}
            >
              <Text style={styles.typeEmoji}>{t.emoji}</Text>
              <Text style={[styles.typeLabel, type === t.value && styles.typeLabelActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <AppTextInput label="Location" value={location} onChangeText={setLocation} placeholder="Barceloneta Beach" />
        <AppTextInput
          label="Start Date & Time *"
          value={startDatetime}
          onChangeText={setStartDatetime}
          placeholder="2025-07-15T10:00:00"
          keyboardType="numbers-and-punctuation"
        />
        <AppTextInput
          label="End Date & Time"
          value={endDatetime}
          onChangeText={setEndDatetime}
          placeholder="2025-07-15T14:00:00"
          keyboardType="numbers-and-punctuation"
        />
        <AppTextInput
          label="Cost Estimate"
          value={costEstimate}
          onChangeText={setCostEstimate}
          placeholder="25.00"
          keyboardType="decimal-pad"
        />
        <AppTextInput label="Notes" value={notes} onChangeText={setNotes} placeholder="Bring sunscreen..." multiline />

        <AppButton title={isEdit ? 'Save Changes' : 'Add to Itinerary'} onPress={handleSave} loading={loading} fullWidth />
        {isEdit && (
          <AppButton title="Delete Item" onPress={handleDelete} variant="danger" fullWidth style={{ marginTop: Spacing.sm }} />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
  container: { padding: Spacing.md },
  label: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.text, marginBottom: Spacing.sm },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  typeChip: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  typeChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  typeEmoji: { fontSize: 14 },
  typeLabel: { fontSize: FontSize.sm, color: Colors.textSecondary },
  typeLabelActive: { color: Colors.primary, fontWeight: FontWeight.semiBold },
});
