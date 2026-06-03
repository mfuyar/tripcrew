import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainStackParamList } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { tripService } from '../../services/tripService';
import { AppTextInput } from '../../components/AppTextInput';
import { AppButton } from '../../components/AppButton';
import { FormKeyboardView } from '../../components/FormKeyboardView';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../constants/theme';

type Props = NativeStackScreenProps<MainStackParamList, 'CreateTrip'>;

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'TRY'];

export function CreateTripScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Trip name is required';
    if (!destination.trim()) e.destination = 'Destination is required';
    if (!startDate.trim()) e.startDate = 'Start date is required';
    if (!endDate.trim()) e.endDate = 'End date is required';
    if (startDate && endDate && startDate > endDate) {
      e.endDate = 'End date must be after start date';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleCreate() {
    if (!validate() || !user) return;
    setLoading(true);
    const { data, error } = await tripService.createTrip(user.id, {
      name: name.trim(),
      destination: destination.trim(),
      description: description.trim() || undefined,
      start_date: startDate,
      end_date: endDate,
      currency,
    });
    setLoading(false);
    if (error) {
      setErrors({ general: error });
    } else if (data) {
      navigation.replace('TripStack', { tripId: data.id });
    }
  }

  return (
    <FormKeyboardView contentContainerStyle={styles.container}>
        {errors.general ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errors.general}</Text>
          </View>
        ) : null}

        <AppTextInput
          label="Trip Name *"
          value={name}
          onChangeText={setName}
          placeholder="Summer Vacation 2025"
          error={errors.name}
        />
        <AppTextInput
          label="Destination / Address *"
          value={destination}
          onChangeText={setDestination}
          placeholder="Hotel, venue, street address, or city"
          error={errors.destination}
        />
        <AppTextInput
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="A week at the beach..."
          multiline
        />
        <AppTextInput
          label="Start Date *"
          value={startDate}
          onChangeText={setStartDate}
          placeholder="YYYY-MM-DD"
          error={errors.startDate}
          keyboardType="numbers-and-punctuation"
        />
        <AppTextInput
          label="End Date *"
          value={endDate}
          onChangeText={setEndDate}
          placeholder="YYYY-MM-DD"
          error={errors.endDate}
          keyboardType="numbers-and-punctuation"
        />

        {/* Currency Picker */}
        <Text style={styles.label}>Currency</Text>
        <View style={styles.currencyRow}>
          {CURRENCIES.map((c) => (
            <TouchableOpacity
              key={c}
              style={[styles.currencyChip, currency === c && styles.currencyChipActive]}
              onPress={() => setCurrency(c)}
            >
              <Text style={[styles.currencyText, currency === c && styles.currencyTextActive]}>
                {c}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <AppButton
          title="Create Trip"
          onPress={handleCreate}
          loading={loading}
          fullWidth
          style={styles.createBtn}
        />
    </FormKeyboardView>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.lg },
  errorBox: {
    backgroundColor: Colors.danger + '15',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  errorText: { color: Colors.danger, fontSize: FontSize.sm },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  currencyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  currencyChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  currencyChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  currencyText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  currencyTextActive: { color: Colors.primary },
  createBtn: { marginTop: Spacing.sm },
});
