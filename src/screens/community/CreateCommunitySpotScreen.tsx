import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Image,
  TextInput,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CommunitySpotCategory, MainStackParamList } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { communitySpotService } from '../../services/communitySpotService';
import { AppButton } from '../../components/AppButton';
import { FormKeyboardView } from '../../components/FormKeyboardView';
import { AddressAutocomplete } from '../../components/AddressAutocomplete';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';

type Props = NativeStackScreenProps<MainStackParamList, 'CreateCommunitySpot'>;

const CATEGORIES: { value: CommunitySpotCategory; label: string; icon: string }[] = [
  { value: 'outdoor', label: 'Outdoor', icon: '🌿' },
  { value: 'food', label: 'Food', icon: '🍽️' },
  { value: 'culture', label: 'Culture', icon: '🏛️' },
  { value: 'hidden_gem', label: 'Hidden gem', icon: '✨' },
  { value: 'other', label: 'Other', icon: '📍' },
];

export function CreateCommunitySpotScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<CommunitySpotCategory>('hidden_gem');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [photoUri, setPhotoUri] = useState<string | undefined>();
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handlePickPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Photo permission needed', 'Allow photo access to attach a spot photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  }

  async function handleUseCurrentLocation() {
    setLocating(true);
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      setLocating(false);
      Alert.alert('Location needed', 'Allow location access to pin this spot.');
      return;
    }
    const position = await Location.getCurrentPositionAsync({});
    setLatitude(String(position.coords.latitude));
    setLongitude(String(position.coords.longitude));
    setLocating(false);
  }

  async function handleSave() {
    if (!user) return;
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!name.trim() || !description.trim()) {
      Alert.alert('Missing info', 'Add a spot name and description.');
      return;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      Alert.alert('Pin needed', 'Use your current location or enter latitude and longitude.');
      return;
    }

    setSaving(true);
    const { error } = await communitySpotService.create(user.id, {
      name: name.trim(),
      category,
      description: description.trim(),
      address: address.trim() || undefined,
      latitude: lat,
      longitude: lng,
      photoUri,
    });
    setSaving(false);
    if (error) {
      Alert.alert('Unable to post spot', error);
      return;
    }
    navigation.goBack();
  }

  return (
    <FormKeyboardView contentContainerStyle={styles.container}>
      <TouchableOpacity style={styles.photoBox} onPress={handlePickPhoto}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.photo} />
        ) : (
          <Text style={styles.photoText}>Add Photo</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.label}>Spot Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Best sunset overlook" placeholderTextColor={Colors.textSecondary} />

      <Text style={styles.label}>Category</Text>
      <View style={styles.categoryRow}>
        {CATEGORIES.map((item) => (
          <TouchableOpacity
            key={item.value}
            style={[styles.categoryChip, category === item.value && styles.categoryChipActive]}
            onPress={() => setCategory(item.value)}
          >
            <Text style={styles.categoryText}>{item.icon} {item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.descriptionInput]}
        value={description}
        onChangeText={setDescription}
        placeholder="What makes this place special?"
        placeholderTextColor={Colors.textSecondary}
        multiline
      />

      <AddressAutocomplete
        label="Address"
        value={address}
        onChangeText={setAddress}
        onSelect={(suggestion) => {
          setAddress(suggestion.label);
          setLatitude(String(suggestion.latitude));
          setLongitude(String(suggestion.longitude));
        }}
        placeholder="Street, trailhead, landmark..."
      />

      <AppButton title="Use Current Location" onPress={handleUseCurrentLocation} loading={locating} variant="outline" fullWidth style={styles.locationButton} />

      <View style={styles.coordRow}>
        <View style={styles.coordInput}>
          <Text style={styles.label}>Latitude</Text>
          <TextInput style={styles.input} value={latitude} onChangeText={setLatitude} keyboardType="numbers-and-punctuation" placeholder="40.7128" placeholderTextColor={Colors.textSecondary} />
        </View>
        <View style={styles.coordInput}>
          <Text style={styles.label}>Longitude</Text>
          <TextInput style={styles.input} value={longitude} onChangeText={setLongitude} keyboardType="numbers-and-punctuation" placeholder="-74.0060" placeholderTextColor={Colors.textSecondary} />
        </View>
      </View>

      <AppButton title="Post Spot" onPress={handleSave} loading={saving} fullWidth style={styles.saveButton} />
    </FormKeyboardView>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.md },
  photoBox: {
    height: 190,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  photo: { width: '100%', height: '100%' },
  photoText: { fontSize: FontSize.md, color: Colors.primary, fontWeight: FontWeight.semiBold },
  label: { fontSize: FontSize.sm, color: Colors.text, fontWeight: FontWeight.semiBold, marginBottom: Spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.text,
    backgroundColor: Colors.surface,
    marginBottom: Spacing.md,
  },
  descriptionInput: { minHeight: 110, textAlignVertical: 'top' },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  categoryChip: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
  },
  categoryChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  categoryText: { fontSize: FontSize.sm, color: Colors.text },
  locationButton: { marginBottom: Spacing.md },
  coordRow: { flexDirection: 'row', gap: Spacing.sm },
  coordInput: { flex: 1 },
  saveButton: { marginTop: Spacing.sm },
});
