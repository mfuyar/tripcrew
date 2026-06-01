import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainStackParamList } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useTripContext } from '../../contexts/TripContext';
import { familyService } from '../../services/familyService';
import { AppTextInput } from '../../components/AppTextInput';
import { AppButton } from '../../components/AppButton';
import { Colors, FontSize, FontWeight, Spacing, Radius, FAMILY_COLORS } from '../../constants/theme';

type Props = NativeStackScreenProps<MainStackParamList, 'AddEditFamily'>;

export function AddEditFamilyScreen({ navigation, route }: Props) {
  const { tripId, familyId } = route.params;
  const { user, isDemoMode } = useAuth();
  const { families, setFamilies } = useTripContext();
  const isEdit = !!familyId;
  const existing = families.find((f) => f.id === familyId);

  const [name, setName] = useState(existing?.name ?? '');
  const [adults, setAdults] = useState(String(existing?.adults_count ?? 2));
  const [children, setChildren] = useState(String(existing?.children_count ?? 0));
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [color, setColor] = useState(existing?.color ?? FAMILY_COLORS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!name.trim()) { setError('Family name is required'); return; }
    const adultsNum = parseInt(adults, 10);
    const childrenNum = parseInt(children, 10);
    if (isNaN(adultsNum) || adultsNum < 1) { setError('At least 1 adult required'); return; }
    if (isNaN(childrenNum) || childrenNum < 0) { setError('Children count cannot be negative'); return; }
    setError('');

    // Demo mode: update local context only, no Supabase
    if (isDemoMode) {
      const now = new Date().toISOString();
      if (isEdit && familyId && existing) {
        setFamilies(families.map((f) =>
          f.id === familyId
            ? { ...f, name: name.trim(), adults_count: adultsNum, children_count: childrenNum, notes: notes.trim() || undefined, color, updated_at: now }
            : f
        ));
      } else {
        setFamilies([...families, {
          id: `demo-fam-${Date.now()}`, trip_id: tripId, name: name.trim(),
          adults_count: adultsNum, children_count: childrenNum,
          notes: notes.trim() || undefined, color,
          created_by: 'demo-user-1', created_at: now, updated_at: now,
        }]);
      }
      navigation.goBack();
      return;
    }

    if (!user) return;
    setLoading(true);
    if (isEdit && familyId) {
      const { data, error: e } = await familyService.updateFamily(familyId, {
        name: name.trim(), adults_count: adultsNum, children_count: childrenNum,
        notes: notes.trim() || undefined, color,
      });
      setLoading(false);
      if (e) { setError(e); return; }
      if (data) {
        setFamilies(families.map((f) => (f.id === familyId ? data : f)));
      }
    } else {
      const { data, error: e } = await familyService.createFamily(tripId, user.id, {
        name: name.trim(), adults_count: adultsNum, children_count: childrenNum,
        notes: notes.trim() || undefined, color,
      });
      setLoading(false);
      if (e) { setError(e); return; }
      if (data) setFamilies([...families, data]);
    }
    navigation.goBack();
  }

  async function handleDelete() {
    if (!familyId) return;
    Alert.alert('Delete Family', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await familyService.deleteFamily(familyId);
          setFamilies(families.filter((f) => f.id !== familyId));
          navigation.goBack();
        },
      },
    ]);
  }

  function CountPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
    const num = parseInt(value, 10) || 0;
    return (
      <View style={styles.countRow}>
        <Text style={styles.countLabel}>{label}</Text>
        <View style={styles.counter}>
          <TouchableOpacity
            style={styles.counterBtn}
            onPress={() => onChange(String(Math.max(0, num - 1)))}
          >
            <Text style={styles.counterBtnText}>−</Text>
          </TouchableOpacity>
          <Text style={styles.counterValue}>{num}</Text>
          <TouchableOpacity
            style={styles.counterBtn}
            onPress={() => onChange(String(num + 1))}
          >
            <Text style={styles.counterBtnText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}

        <AppTextInput
          label="Family Name *"
          value={name}
          onChangeText={setName}
          placeholder="The Smith Family"
        />

        <CountPicker label="Adults" value={adults} onChange={setAdults} />
        <CountPicker label="Children" value={children} onChange={setChildren} />

        <AppTextInput
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Dietary restrictions, etc."
          multiline
        />

        {/* Color picker */}
        <Text style={styles.label}>Family Color</Text>
        <View style={styles.colorRow}>
          {FAMILY_COLORS.map((c) => (
            <TouchableOpacity
              key={c}
              style={[styles.colorDot, { backgroundColor: c }, color === c && styles.colorDotActive]}
              onPress={() => setColor(c)}
            />
          ))}
        </View>

        <AppButton title={isEdit ? 'Save Changes' : 'Create Family'} onPress={handleSave} loading={loading} fullWidth style={styles.saveBtn} />
        {isEdit && (
          <AppButton title="Delete Family" onPress={handleDelete} variant="danger" fullWidth style={{ marginTop: Spacing.sm }} />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
  container: { padding: Spacing.md },
  errorBox: { backgroundColor: Colors.danger + '15', borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.md },
  errorText: { color: Colors.danger, fontSize: FontSize.sm },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  countLabel: { fontSize: FontSize.md, color: Colors.text, fontWeight: FontWeight.medium },
  counter: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  counterBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  counterBtnText: { fontSize: 20, color: Colors.primary, fontWeight: FontWeight.bold },
  counterValue: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.text, minWidth: 28, textAlign: 'center' },
  label: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.text, marginBottom: Spacing.sm },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginBottom: Spacing.lg },
  colorDot: { width: 36, height: 36, borderRadius: 18 },
  colorDotActive: { borderWidth: 3, borderColor: Colors.text },
  saveBtn: { marginTop: Spacing.sm },
});
