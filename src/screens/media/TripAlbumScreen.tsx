import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Dimensions,
  Alert,
  RefreshControl,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MainStackParamList, TripMedia } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useTripContext } from '../../contexts/TripContext';
import { mediaService } from '../../services/mediaService';
import { LoadingView } from '../../components/LoadingView';
import { EmptyState } from '../../components/EmptyState';
import { Colors, Spacing, Radius } from '../../constants/theme';

type Nav = NativeStackNavigationProp<MainStackParamList>;
const COLS = 3;
const CELL = (Dimensions.get('window').width - Spacing.sm * (COLS + 1)) / COLS;

export function TripAlbumScreen({ route }: { route: { params: { tripId: string } } }) {
  const navigation = useNavigation<Nav>();
  const { tripId } = route.params;
  const { user, isDemoMode } = useAuth();
  const { userFamily } = useTripContext();
  const [media, setMedia] = useState<TripMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Web-only ref to a hidden <input type="file"> — bypasses expo-image-picker's
  // dispatchEvent(new MouseEvent) which Chrome blocks for file inputs (isTrusted:false)
  const webFileInputRef = useRef<any>(null);

  const loadMedia = useCallback(async () => {
    if (isDemoMode) { setMedia([]); setLoading(false); setRefreshing(false); return; }
    const { data } = await mediaService.getMedia(tripId);
    setMedia(data ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [tripId, isDemoMode]);

  useFocusEffect(useCallback(() => { loadMedia(); }, [loadMedia]));

  // Shared upload logic used by both web and native paths
  async function processUploads(uris: string[]) {
    if (!user || !uris.length) return;
    setUploading(true);
    try {
      const errors: string[] = [];
      for (const uri of uris) {
        const { error } = await mediaService.uploadMedia(
          tripId, user.id, userFamily?.id, uri, 'photo'
        );
        if (error) errors.push(error);
      }
      if (errors.length > 0) {
        Alert.alert('Upload failed', errors[0]);
      } else {
        loadMedia();
      }
    } catch (e: any) {
      Alert.alert('Upload error', e?.message ?? 'Something went wrong');
    } finally {
      setUploading(false);
    }
  }

  // Web: called from onChange on the hidden <input type="file">
  async function handleWebFileChange(e: any) {
    const files: File[] = Array.from(e.target.files ?? []);
    e.target.value = ''; // allow re-selecting the same file
    const uris = files.map((f) => URL.createObjectURL(f));
    await processUploads(uris);
    uris.forEach((u) => URL.revokeObjectURL(u));
  }

  // Web: called when Upload button is pressed — directly clicks the hidden input
  // (synchronous .click() from user gesture = trusted = file dialog opens)
  function handleUploadWeb() {
    if (isDemoMode) { Alert.alert('Demo Mode', 'Photo upload is disabled in demo.'); return; }
    webFileInputRef.current?.click();
  }

  // Native: uses expo-image-picker
  async function handleUploadNative() {
    if (isDemoMode) { Alert.alert('Demo Mode', 'Photo upload is disabled in demo.'); return; }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images' as any,
      allowsMultipleSelection: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets.length > 0) {
      await processUploads(result.assets.map((a) => a.uri));
    }
  }

  const handleUpload = Platform.OS === 'web' ? handleUploadWeb : handleUploadNative;

  if (loading) return <LoadingView />;

  return (
    <View style={styles.container}>
      {/* Hidden native file input for web — clicked directly so isTrusted=true */}
      {Platform.OS === 'web' && (
        <input
          ref={webFileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' } as any}
          onChange={handleWebFileChange}
        />
      )}
      <View style={styles.header}>
        <Text style={styles.count}>{media.length} photos</Text>
        <TouchableOpacity
          style={[styles.uploadBtn, uploading && styles.uploadBtnDisabled]}
          onPress={handleUpload}
          disabled={uploading}
        >
          <Text style={styles.uploadBtnText}>
            {uploading ? 'Uploading...' : '+ Upload'}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={media}
        keyExtractor={(item) => item.id}
        numColumns={COLS}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadMedia(); }} tintColor={Colors.primary} />
        }
        contentContainerStyle={styles.grid}
        ListEmptyComponent={
          <EmptyState
            icon="📷"
            title="No photos yet"
            subtitle="Upload your first trip photo!"
            actionLabel="Upload Photo"
            onAction={handleUpload}
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.cell}
            onPress={() => navigation.navigate('MediaDetail', { tripId, mediaId: item.id })}
          >
            <Image source={{ uri: item.url }} style={styles.thumbnail} />
            {item.caption ? (
              <View style={styles.captionOverlay}>
                <Text style={styles.captionText} numberOfLines={1}>{item.caption}</Text>
              </View>
            ) : null}
            {/* Delete button — visible for uploader's own photos */}
            {item.uploaded_by === user?.id && (
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={async () => {
                  const confirmed = Platform.OS === 'web'
                    ? window.confirm('Delete this photo?')
                    : await new Promise<boolean>((resolve) =>
                        Alert.alert('Delete Photo', 'Remove this photo?', [
                          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                          { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
                        ])
                      );
                  if (!confirmed) return;
                  await mediaService.deleteMedia(item.id);
                  loadMedia();
                }}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <Text style={styles.deleteBtnText}>🗑</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  count: { fontSize: 14, color: Colors.textSecondary },
  uploadBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
  },
  uploadBtnDisabled: { opacity: 0.5 },
  uploadBtnText: { color: Colors.surface, fontWeight: '600', fontSize: 14 },
  grid: { padding: Spacing.sm, flexGrow: 1 },
  cell: {
    width: CELL,
    height: CELL,
    margin: Spacing.sm / 2,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    backgroundColor: Colors.border,
  },
  thumbnail: { width: '100%', height: '100%' },
  deleteBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: { fontSize: 12 },
  captionOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 4,
  },
  captionText: { color: '#fff', fontSize: 10 },
});
