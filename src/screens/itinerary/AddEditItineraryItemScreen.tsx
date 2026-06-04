import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet,
  TouchableOpacity, Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainStackParamList, ItineraryType } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { itineraryService } from '../../services/itineraryService';
import { AppTextInput } from '../../components/AppTextInput';
import { AppButton } from '../../components/AppButton';
import { FormKeyboardView } from '../../components/FormKeyboardView';
import { AddressAutocomplete } from '../../components/AddressAutocomplete';
import { DatePickerField, TimePickerField } from '../../components/DatePickerField';
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

function splitDatetime(iso: string): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const [datePart, timePart] = iso.split('T');
  return { date: datePart ?? '', time: timePart ? timePart.slice(0, 5) : '' };
}

function buildDatetime(date: string, time: string): string {
  if (!date) return '';
  return `${date}T${time || '00:00'}:00`;
}

export function AddEditItineraryItemScreen({ navigation, route }: Props) {
  const { tripId, itemId, prefill } = route.params;
  const { user, isDemoMode } = useAuth();
  const isEdit = !!itemId;

  const [title, setTitle] = useState(prefill?.title ?? '');
  const [type, setType] = useState<ItineraryType>(prefill?.itemType ?? 'activity');
  const [location, setLocation] = useState(prefill?.location ?? '');
  const [startDate, setStartDate] = useState(prefill?.startDate ?? '');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [costEstimate, setCostEstimate] = useState('');
  const [notes, setNotes] = useState(prefill?.notes ?? '');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isDemoMode || !isEdit || !itemId) return;
    itineraryService.getItems(tripId).then(({ data }) => {
      const item = data?.find((i) => i.id === itemId);
      if (item) {
        setTitle(item.title);
        setType(item.item_type);
        setLocation(item.location ?? '');
        const s = splitDatetime(item.start_datetime);
        setStartDate(s.date);
        setStartTime(s.time);
        const e = splitDatetime(item.end_datetime ?? '');
        setEndDate(e.date);
        setEndTime(e.time);
        setCostEstimate(item.cost_estimate ? String(item.cost_estimate) : '');
        setNotes(item.notes ?? '');
      }
    });
  }, [itemId]);

  async function handleSave() {
    if (!title.trim()) { Alert.alert('Error', 'Title is required'); return; }
    if (!startDate) { Alert.alert('Error', 'Start date is required'); return; }
    if (!user || isDemoMode) { Alert.alert('Demo Mode', 'Editing itinerary is disabled in demo.'); return; }
    setLoading(true);
    const payload = {
      title: title.trim(),
      item_type: type,
      location: location.trim() || undefined,
      start_datetime: buildDatetime(startDate, startTime),
      end_datetime: endDate ? buildDatetime(endDate, endTime) : undefined,
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
    <FormKeyboardView contentContainerStyle={styles.container}>
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

        <AddressAutocomplete
          label="Location"
          value={location}
          onChangeText={setLocation}
          onSelect={(suggestion) => setLocation(suggestion.label)}
          placeholder="Rosemary Beach"
        />

        <DatePickerField label="Start Date" value={startDate} onChange={setStartDate} required />
        <TimePickerField label="Start Time" value={startTime} onChange={setStartTime} />

        <DatePickerField label="End Date" value={endDate} onChange={setEndDate} minimumDate={startDate ? new Date(startDate + 'T12:00:00') : undefined} />
        <TimePickerField label="End Time" value={endTime} onChange={setEndTime} />

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
    </FormKeyboardView>
  );
}

const styles = StyleSheet.create({
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
