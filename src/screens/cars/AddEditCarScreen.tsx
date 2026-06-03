import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet,
  TouchableOpacity, Alert, Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainStackParamList, Car, CarPassenger } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useTripContext } from '../../contexts/TripContext';
import { carService } from '../../services/carService';
import { AppTextInput } from '../../components/AppTextInput';
import { AppButton } from '../../components/AppButton';
import { FormKeyboardView } from '../../components/FormKeyboardView';
import { FamilyAvatar } from '../../components/FamilyAvatar';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../constants/theme';

type Props = NativeStackScreenProps<MainStackParamList, 'AddEditCar'>;

export function AddEditCarScreen({ navigation, route }: Props) {
  const { tripId, carId } = route.params;
  const { user, isDemoMode } = useAuth();
  const { families } = useTripContext();
  const isEdit = !!carId;

  const [name, setName] = useState('');
  const [driverFamilyId, setDriverFamilyId] = useState(families[0]?.id ?? '');
  const [totalSeats, setTotalSeats] = useState('5');
  const [notes, setNotes] = useState('');
  const [passengers, setPassengers] = useState<CarPassenger[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddPassenger, setShowAddPassenger] = useState(false);
  const [passengerName, setPassengerName] = useState('');
  const [passengerFamilyId, setPassengerFamilyId] = useState(families[0]?.id ?? '');

  useEffect(() => {
    if (isDemoMode || !isEdit || !carId) return;
    if (isEdit && carId) {
      carService.getCars(tripId).then(({ data }) => {
        const car = data?.find((c) => c.id === carId);
        if (car) {
          setName(car.name);
          setDriverFamilyId(car.driver_family_id);
          setTotalSeats(String(car.total_seats));
          setNotes(car.notes ?? '');
          setPassengers(car.passengers ?? []);
        }
      });
    }
  }, [carId]);

  async function handleSave() {
    if (!name.trim() || !user || isDemoMode) { Alert.alert('Demo Mode', 'Editing cars is disabled in demo.'); return; }
    setLoading(true);
    const seats = parseInt(totalSeats, 10) || 5;
    if (isEdit && carId) {
      const { error } = await carService.updateCar(carId, { name: name.trim(), driver_family_id: driverFamilyId, total_seats: seats, notes: notes.trim() || undefined });
      if (error) Alert.alert('Error', error);
      else navigation.goBack();
    } else {
      const { error } = await carService.createCar(tripId, user.id, { name: name.trim(), driver_family_id: driverFamilyId, total_seats: seats, notes: notes.trim() || undefined, driver_user_id: user.id });
      if (error) Alert.alert('Error', error);
      else navigation.goBack();
    }
    setLoading(false);
  }

  async function handleAddPassenger() {
    if (!passengerName.trim() || !carId) return;
    const { error } = await carService.addPassenger(carId, tripId, passengerFamilyId, passengerName.trim());
    if (error) { Alert.alert('Error', error); return; }
    setPassengerName('');
    setShowAddPassenger(false);
    // Refresh
    carService.getCars(tripId).then(({ data }) => {
      const car = data?.find((c) => c.id === carId);
      if (car) setPassengers(car.passengers ?? []);
    });
  }

  return (
    <FormKeyboardView contentContainerStyle={styles.container}>
        <AppTextInput label="Car Name *" value={name} onChangeText={setName} placeholder="Blue Honda" />
        <AppTextInput label="Total Seats" value={totalSeats} onChangeText={setTotalSeats} keyboardType="number-pad" placeholder="5" />

        <Text style={styles.label}>Driver Family</Text>
        <View style={styles.famRow}>
          {families.map((f) => (
            <TouchableOpacity
              key={f.id}
              style={[styles.famChip, driverFamilyId === f.id && styles.famChipActive]}
              onPress={() => setDriverFamilyId(f.id)}
            >
              <View style={[styles.famDot, { backgroundColor: f.color ?? Colors.primary }]} />
              <Text style={[styles.famText, driverFamilyId === f.id && styles.famTextActive]}>{f.name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <AppTextInput label="Notes" value={notes} onChangeText={setNotes} placeholder="Meeting point, etc." multiline />
        <AppButton title={isEdit ? 'Save Changes' : 'Create Car'} onPress={handleSave} loading={loading} fullWidth />

        {isEdit && (
          <View style={styles.passSection}>
            <View style={styles.passSectionHeader}>
              <Text style={styles.label}>Passengers ({passengers.length}/{totalSeats})</Text>
              <TouchableOpacity onPress={() => setShowAddPassenger(true)}>
                <Text style={styles.addPass}>+ Add</Text>
              </TouchableOpacity>
            </View>
            {passengers.map((p) => (
              <View key={p.id} style={styles.passCard}>
                <FamilyAvatar name={p.passenger_name} color={p.family?.color} size={32} />
                <View style={styles.passInfo}>
                  <Text style={styles.passName}>{p.passenger_name}</Text>
                  <Text style={styles.passFam}>{p.family?.name ?? ''}</Text>
                </View>
                <TouchableOpacity onPress={async () => { await carService.removePassenger(p.id); setPassengers((prev) => prev.filter((pp) => pp.id !== p.id)); }}>
                  <Text style={styles.removeText}>Remove</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      

      <Modal visible={showAddPassenger} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={24}>
            <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Add Passenger</Text>
            <TextInput
              style={styles.modalInput}
              value={passengerName}
              onChangeText={setPassengerName}
              placeholder="Passenger name"
              placeholderTextColor={Colors.textSecondary}
              autoFocus
            />
            <Text style={styles.label}>Family</Text>
            <View style={styles.famRow}>
              {families.map((f) => (
                <TouchableOpacity
                  key={f.id}
                  style={[styles.famChip, passengerFamilyId === f.id && styles.famChipActive]}
                  onPress={() => setPassengerFamilyId(f.id)}
                >
                  <Text style={[styles.famText, passengerFamilyId === f.id && styles.famTextActive]}>{f.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <AppButton title="Add Passenger" onPress={handleAddPassenger} fullWidth />
            <AppButton title="Cancel" onPress={() => setShowAddPassenger(false)} variant="outline" fullWidth style={{ marginTop: Spacing.sm }} />
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </FormKeyboardView>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.md },
  label: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.text, marginBottom: Spacing.sm },
  famRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  famChip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  famChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  famDot: { width: 10, height: 10, borderRadius: 5 },
  famText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  famTextActive: { color: Colors.primary, fontWeight: FontWeight.semiBold },
  passSection: { marginTop: Spacing.lg },
  passSectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  addPass: { fontSize: FontSize.md, color: Colors.primary, fontWeight: FontWeight.semiBold },
  passCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm, gap: Spacing.md, ...Shadow.sm },
  passInfo: { flex: 1 },
  passName: { fontSize: FontSize.md, fontWeight: FontWeight.medium, color: Colors.text },
  passFam: { fontSize: FontSize.xs, color: Colors.textSecondary },
  removeText: { fontSize: FontSize.sm, color: Colors.danger },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.xl },
  modalTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.text, marginBottom: Spacing.lg },
  modalInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing.md, fontSize: FontSize.md, color: Colors.text, marginBottom: Spacing.md },
});
