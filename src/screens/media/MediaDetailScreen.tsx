import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Alert,
  TextInput,
  Dimensions,
  ScrollView,
  KeyboardAvoidingView,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainStackParamList, TripMedia } from '../../types';
import { Platform } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useTripContext } from '../../contexts/TripContext';
import { mediaService } from '../../services/mediaService';
import { LoadingView } from '../../components/LoadingView';
import { AppButton } from '../../components/AppButton';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../constants/theme';

type Props = NativeStackScreenProps<MainStackParamList, 'MediaDetail'>;

export function MediaDetailScreen({ navigation, route }: Props) {
  const { tripId, mediaId } = route.params;
  const { user, isDemoMode, isGlobalAdmin } = useAuth();
  const { isTripOrganizer } = useTripContext();
  const [media, setMedia] = useState<TripMedia | null>(null);
  const [loading, setLoading] = useState(true);
  const [caption, setCaption] = useState('');
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    // We'll load the full media list and find the one we need
    loadMedia();
  }, [mediaId]);

  async function loadMedia() {
    if (isDemoMode) { setLoading(false); return; }
    const { data } = await mediaService.getMedia(tripId);
    const item = data?.find((m) => m.id === mediaId) ?? null;
    setMedia(item);
    setCaption(item?.caption ?? '');
    setLoading(false);
  }

  async function handleSaveCaption() {
    if (!media) return;
    setSaving(true);
    await mediaService.updateCaption(media.id, caption);
    setSaving(false);
    Alert.alert('Saved', 'Caption updated.');
  }

  async function handleDelete() {
    if (!media) return;
    const confirmed = Platform.OS === 'web'
      ? window.confirm('Delete this photo? This cannot be undone.')
      : await new Promise<boolean>((resolve) =>
          Alert.alert('Delete Photo', 'This cannot be undone.', [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
          ])
        );
    if (!confirmed) return;
    const { error } = await mediaService.deleteMedia(media);
    if (error) {
      Alert.alert('Unable to delete photo', error);
    } else {
      navigation.goBack();
    }
  }

  async function handleDownload() {
    if (!media) return;
    setDownloading(true);
    const { error } = await mediaService.saveMediaToLibrary(media);
    setDownloading(false);
    if (error) {
      Alert.alert('Download failed', error);
    } else if (Platform.OS !== 'web') {
      Alert.alert('Saved', 'Photo saved to your library.');
    }
  }

  if (loading) return <LoadingView />;
  if (!media) return null;

  const canModify = media.uploaded_by === user?.id || isTripOrganizer || isGlobalAdmin;
  const { width } = Dimensions.get('window');

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={96}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Image
        source={{ uri: media.url }}
        style={[styles.image, { width, height: width }]}
        resizeMode="contain"
      />
      <View style={styles.meta}>
        <Text style={styles.uploader}>
          Uploaded by {media.uploader?.full_name ?? 'Unknown'}
          {media.family ? ` (${media.family.name})` : ''}
        </Text>
        <Text style={styles.date}>
          {new Date(media.created_at).toLocaleDateString('en-US', {
            month: 'long', day: 'numeric', year: 'numeric',
          })}
        </Text>
      </View>

      {media.media_type === 'photo' ? (
        <View style={styles.actionSection}>
          <AppButton title="Download Photo" onPress={handleDownload} loading={downloading} fullWidth />
          <Text style={styles.downloadWarning}>
            ⚠️ Trip photos are deleted 7 days after the trip closes — download anything you want to keep.
          </Text>
        </View>
      ) : null}

      {canModify && (
        <View style={styles.captionSection}>
          <Text style={styles.label}>Caption</Text>
          <TextInput
            style={styles.captionInput}
            value={caption}
            onChangeText={setCaption}
            placeholder="Add a caption..."
            placeholderTextColor={Colors.textSecondary}
            multiline
          />
          <AppButton title="Save Caption" onPress={handleSaveCaption} loading={saving} fullWidth />
          <AppButton
            title="Delete Photo"
            onPress={handleDelete}
            variant="danger"
            fullWidth
            style={{ marginTop: Spacing.sm }}
          />
        </View>
      )}

      {!canModify && media.caption ? (
        <View style={styles.captionSection}>
          <Text style={styles.label}>Caption</Text>
          <Text style={styles.captionDisplay}>{media.caption}</Text>
        </View>
      ) : null}
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingBottom: Spacing.xl },
  image: { backgroundColor: Colors.border },
  meta: { backgroundColor: Colors.surface, padding: Spacing.md },
  uploader: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.text },
  date: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  actionSection: { padding: Spacing.md, paddingBottom: 0, backgroundColor: Colors.surface },
  downloadWarning: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  captionSection: { padding: Spacing.md, backgroundColor: Colors.surface },
  label: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.text, marginBottom: Spacing.sm },
  captionInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.text,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: Spacing.md,
  },
  captionDisplay: { fontSize: FontSize.md, color: Colors.text, lineHeight: 22 },
});
