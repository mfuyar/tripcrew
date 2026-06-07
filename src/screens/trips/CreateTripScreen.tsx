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
import { DatePickerField } from '../../components/DatePickerField';
import { todayDate, todayStr, parseDate, isBefore } from '../../utils/dateUtils';
import { currencySymbol } from '../../utils/currency';
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
    if (!startDate) e.startDate = 'Start date is required';
    else if (isBefore(startDate, todayStr())) e.startDate = 'Start date cannot be in the past';
    if (!endDate) e.endDate = 'End date is required';
    else if (startDate && isBefore(endDate, startDate)) e.endDate = 'End date must be on or after start date';
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
          label="Trip Name" required
          value={name}
          onChangeText={setName}
          placeholder="Summer Vacation 2025"
          error={errors.name}
        />
        <AppTextInput
          label="Destination / Address" required
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
        <DatePickerField
          label="Start Date"
          value={startDate}
          onChange={(d) => { setStartDate(d); if (endDate && isBefore(endDate, d)) setEndDate(''); }}
          required
          minimumDate={todayDate()}
        />
        {errors.startDate ? <Text style={styles.fieldError}>{errors.startDate}</Text> : null}
        <DatePickerField
          label="End Date"
          value={endDate}
          onChange={setEndDate}
          required
          minimumDate={startDate ? parseDate(startDate) : todayDate()}
        />
        {errors.endDate ? <Text style={styles.fieldError}>{errors.endDate}</Text> : null}

        {/* Currency Picker */}
        <Text style={styles.label}>Currency</Text>
        <View style={styles.currencyRow}>
          {CURRENCIES.map((c) => (
            <TouchableOpacity
              key={c}
              style={[styles.currencyChip, currency === c && styles.currencyChipActive]}
              onPress={() => setCurrency(c)}
              accessibilityLabel={`Use ${c}`}
            >
              <Text style={[styles.currencyText, currency === c && styles.currencyTextActive]}>
                {currencySymbol(c)}
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
  fieldError: { fontSize: FontSize.xs, color: Colors.danger, marginTop: -Spacing.sm, marginBottom: Spacing.sm, marginLeft: Spacing.xs },
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
