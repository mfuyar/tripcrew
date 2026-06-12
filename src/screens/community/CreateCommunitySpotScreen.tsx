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
import { addressSearchService } from '../../services/addressSearchService';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';

type Props = NativeStackScreenProps<MainStackParamList, 'CreateCommunitySpot'>;

import { CATEGORY_META } from '../../services/placesService';

const CATEGORIES = Object.entries(CATEGORY_META).map(([value, meta]) => ({
  value: value as CommunitySpotCategory,
  label: meta.label,
  icon: meta.icon,
}));

const SPOT_TAGS = [
  { id: 'family-friendly', label: '👨‍👩‍👧 Family Friendly' },
  { id: 'kids', label: '🧒 Kids' },
  { id: 'free', label: '🆓 Free' },
  { id: 'outdoor', label: '☀️ Outdoor' },
  { id: 'indoor', label: '🏠 Indoor' },
  { id: 'hidden-gem', label: '✨ Hidden Gem' },
  { id: 'halal-friendly', label: '✅ Halal Friendly*' },
  { id: 'low-walking', label: '🪑 Low Walking' },
  { id: 'pet-friendly', label: '🐾 Pet Friendly' },
  { id: 'wheelchair', label: '♿ Wheelchair Access' },
  { id: 'historical', label: '🏰 Historical' },
  { id: 'religious', label: '🕌 Religious' },
];

function cleanText(value: string): string {
  return value.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
}

function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

export function CreateCommunitySpotScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const editSpot = route.params?.editSpot;
  const isEditing = Boolean(editSpot);
  const [name, setName] = useState(editSpot?.name ?? '');
  const [category, setCategory] = useState<CommunitySpotCategory>(editSpot?.category ?? 'hidden_gem');
  const [description, setDescription] = useState(editSpot?.description ?? '');
  const [address, setAddress] = useState(editSpot?.address ?? '');
  const [latitude, setLatitude] = useState(editSpot ? String(editSpot.latitude) : '');
  const [longitude, setLongitude] = useState(editSpot ? String(editSpot.longitude) : '');
  const [photoUri, setPhotoUri] = useState<string | undefined>();
  const [website, setWebsite] = useState(editSpot?.website ?? '');
  const [selectedTags, setSelectedTags] = useState<string[]>(editSpot?.tags ?? []);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

  function toggleTag(id: string) {
    setSelectedTags(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  }

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
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  }

  async function handleUseCurrentLocation() {
    setLocating(true);
    const servicesEnabled = await Location.hasServicesEnabledAsync().catch(() => true);
    if (!servicesEnabled) {
      setLocating(false);
      Alert.alert('Location unavailable', 'Turn on Location Services or select an address above to set the pin.');
      return;
    }

    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      setLocating(false);
      Alert.alert('Location needed', 'Allow location access or select an address above to set the pin.');
      return;
    }

    try {
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLatitude(String(position.coords.latitude));
      setLongitude(String(position.coords.longitude));
    } catch {
      const lastKnown = await Location.getLastKnownPositionAsync({
        maxAge: 15 * 60 * 1000,
        requiredAccuracy: 5000,
      }).catch(() => null);
      if (lastKnown) {
        setLatitude(String(lastKnown.coords.latitude));
        setLongitude(String(lastKnown.coords.longitude));
      } else {
        Alert.alert('Location unavailable', 'Select an address above or enter latitude and longitude manually.');
      }
    } finally {
      setLocating(false);
    }
  }

  async function handleSave() {
    if (!user) return;
    const spotName = cleanText(name);
    const spotDescription = cleanText(description);
    const spotAddress = cleanText(address);
    const spotWebsite = cleanText(website);
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!spotName) {
      Alert.alert('Spot name needed', 'Add the name of the place you want to post.');
      return;
    }
    if (!spotDescription) {
      Alert.alert('Description needed', 'Add a short description so trip members know why this spot is useful.');
      return;
    }

    let finalLat = lat;
    let finalLng = lng;
    const hasAnyCoordinateText = cleanText(latitude).length > 0 || cleanText(longitude).length > 0;
    const hasCoords = isValidLatitude(lat) && isValidLongitude(lng);
    const hasAddress = spotAddress.length > 0;
    if (hasAnyCoordinateText && !hasCoords) {
      Alert.alert('Location needs fixing', 'Enter a valid latitude and longitude, or clear them and use an address instead.');
      return;
    }
    if (!hasCoords && !hasAddress) {
      Alert.alert('Location required', 'Enter an address or use your current location so others can get directions.');
      return;
    }
    // If address provided but no pin set, geocode address to get coordinates
    if (!hasCoords && hasAddress) {
      const { data: geo } = await addressSearchService.search(spotAddress, 1);
      if (geo?.[0]) {
        finalLat = geo[0].latitude;
        finalLng = geo[0].longitude;
      } else {
        Alert.alert('Address not found', 'Could not locate this address. Try using your current location instead.');
        return;
      }
    }

    setSaving(true);
    if (editSpot) {
      const { data, error } = await communitySpotService.updateSpot(editSpot.id, {
        name: spotName,
        category,
        description: spotDescription,
        address: spotAddress || undefined,
      });
      setSaving(false);
      if (error) {
        Alert.alert('Unable to update spot', error);
        return;
      }
      if (data?.moderation_status === 'pending_review') {
        Alert.alert(
          'Sent for review',
          'This edit is waiting for moderator approval before everyone can see it.',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
        return;
      }
      navigation.goBack();
      return;
    }

    const { data, error } = await communitySpotService.create(user.id, {
      name: spotName,
      category,
      description: spotDescription,
      address: spotAddress || undefined,
      latitude: finalLat,
      longitude: finalLng,
      photoUri,
      website: spotWebsite || undefined,
      tags: selectedTags,
      source_type: 'member',
      source_name: 'Member Suggested',
    });
    setSaving(false);
    if (error) {
      Alert.alert('Unable to post spot', error);
      return;
    }
    if (data?.moderation_status === 'pending_review') {
      Alert.alert(
        'Sent for review',
        'This spot is waiting for moderator approval before everyone can see it.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
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
        label="Address" required
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

      {/* Website */}
      <Text style={styles.label}>Website <Text style={styles.optional}>(optional)</Text></Text>
      <TextInput style={styles.input} value={website} onChangeText={setWebsite} placeholder="https://..." placeholderTextColor={Colors.textSecondary} autoCapitalize="none" keyboardType="url" />

      {/* Tags */}
      <Text style={styles.label}>Tags <Text style={styles.optional}>(select all that apply)</Text></Text>
      <View style={styles.tagGrid}>
        {SPOT_TAGS.map(tag => (
          <TouchableOpacity
            key={tag.id}
            style={[styles.tagChip, selectedTags.includes(tag.id) && styles.tagChipActive]}
            onPress={() => toggleTag(tag.id)}
          >
            <Text style={[styles.tagChipText, selectedTags.includes(tag.id) && styles.tagChipTextActive]}>
              {tag.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {selectedTags.includes('halal-friendly') && (
        <Text style={styles.disclaimerText}>
          * Halal-friendly tag will be shown as "Suggested as halal-friendly by a member" — not as verified certification.
        </Text>
      )}

      <AppButton title={isEditing ? 'Save Spot' : 'Post Spot'} onPress={handleSave} loading={saving} fullWidth style={styles.saveButton} />
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
  optional: { fontWeight: '400', color: Colors.textSecondary },
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
  tagGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  tagChip: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, backgroundColor: Colors.surface },
  tagChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  tagChipText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  tagChipTextActive: { color: Colors.primary, fontWeight: FontWeight.semiBold },
  disclaimerText: { fontSize: FontSize.xs, color: Colors.warning, fontStyle: 'italic', marginBottom: Spacing.md },
});
