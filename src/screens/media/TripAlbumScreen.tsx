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
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../constants/theme';

type Nav = NativeStackNavigationProp<MainStackParamList>;
const COLS = 3;
const CELL = (Dimensions.get('window').width - Spacing.sm * (COLS + 1)) / COLS;

const MEDIA_ICON: Record<string, string> = {
  audio: '🎵',
  video: '🎬',
  document: '📄',
};

export function TripAlbumScreen({ route }: { route: { params: { tripId: string } } }) {
  const navigation = useNavigation<Nav>();
  const { tripId } = route.params;
  const { user, isDemoMode, isGlobalAdmin } = useAuth();
  const { currentTrip, userFamily, isTripOrganizer } = useTripContext();
  const [media, setMedia] = useState<TripMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const webFileInputRef = useRef<any>(null);

  const loadMedia = useCallback(async () => {
    if (isDemoMode) { setMedia([]); setLoading(false); setRefreshing(false); return; }
    await mediaService.purgeClosedTripMedia(tripId, currentTrip?.closed_at);
    const { data } = await mediaService.getMedia(tripId);
    setMedia(data ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [tripId, isDemoMode, currentTrip?.closed_at]);

  useFocusEffect(useCallback(() => { loadMedia(); }, [loadMedia]));

  function enterSelectMode() {
    setSelectMode(true);
    setSelectedIds(new Set());
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleSelectAll() {
    const deletableIds = media.filter(canDelete).map((m) => m.id);
    if (selectedIds.size === deletableIds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(deletableIds));
    }
  }

  async function handleDeleteSelected() {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    const confirmed = Platform.OS === 'web'
      ? window.confirm(`Delete ${count} item${count > 1 ? 's' : ''}? This cannot be undone.`)
      : await new Promise<boolean>((resolve) =>
          Alert.alert(
            'Delete Items',
            `Remove ${count} item${count > 1 ? 's' : ''}? This cannot be undone.`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
            ]
          )
        );
    if (!confirmed) return;
    setDeleting(true);
    const toDelete = media.filter((m) => selectedIds.has(m.id) && canDelete(m));
    if (toDelete.length === 0) {
      setDeleting(false);
      Alert.alert('No permission', 'You can delete your own uploads, or the trip organizer can delete any upload.');
      return;
    }
    const { error } = await mediaService.deleteMultipleMedia(toDelete);
    setDeleting(false);
    if (error) {
      Alert.alert('Error', error);
    } else {
      exitSelectMode();
      loadMedia();
    }
  }

  async function processUploads(assets: { uri: string; width?: number; height?: number }[]) {
    if (!user || !assets.length) return;
    setUploading(true);
    try {
      const errors: string[] = [];
      for (const asset of assets) {
        const { error } = await mediaService.uploadMedia(
          tripId, user.id, userFamily?.id, asset.uri, 'photo'
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

  async function handleWebFileChange(e: any) {
    const files: File[] = Array.from(e.target.files ?? []);
    e.target.value = '';
    // Web: no dimension info available, service will always resize
    const assets = files.map((f) => ({ uri: URL.createObjectURL(f) }));
    await processUploads(assets);
    assets.forEach((a) => URL.revokeObjectURL(a.uri));
  }

  function handleUploadWeb() {
    if (isDemoMode) { Alert.alert('Demo Mode', 'Photo upload is disabled in demo.'); return; }
    webFileInputRef.current?.click();
  }

  async function handleUploadNative() {
    if (isDemoMode) { Alert.alert('Demo Mode', 'Photo upload is disabled in demo.'); return; }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.7,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
    });
    if (!result.canceled && result.assets.length > 0) {
      await processUploads(result.assets.map((a) => ({ uri: a.uri })));
    }
  }

  const handleUpload = Platform.OS === 'web' ? handleUploadWeb : handleUploadNative;

  const canDelete = (item: TripMedia) =>
    item.uploaded_by === user?.id || isTripOrganizer || isGlobalAdmin;

  async function handleDownload(item: TripMedia) {
    setDownloadingId(item.id);
    const { error } = await mediaService.saveMediaToLibrary(item);
    setDownloadingId(null);
    if (error) {
      Alert.alert('Download failed', error);
    } else if (Platform.OS !== 'web') {
      Alert.alert('Saved', 'Photo saved to your library.');
    }
  }

  async function handleDownloadAll() {
    const photos = media.filter((m) => m.media_type === 'photo');
    if (photos.length === 0) return;
    const confirmed = Platform.OS === 'web'
      ? window.confirm(`Download all ${photos.length} photo${photos.length > 1 ? 's' : ''} to your device?`)
      : await new Promise<boolean>((resolve) =>
          Alert.alert(
            'Download All Photos',
            `Save all ${photos.length} photo${photos.length > 1 ? 's' : ''} to your library?`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Download', onPress: () => resolve(true) },
            ]
          )
        );
    if (!confirmed) return;
    setDownloadingAll(true);
    let failures = 0;
    for (const photo of photos) {
      const { error } = await mediaService.saveMediaToLibrary(photo);
      if (error) failures += 1;
    }
    setDownloadingAll(false);
    const succeeded = photos.length - failures;
    if (failures === 0) {
      Alert.alert('Done', `Saved ${succeeded} photo${succeeded > 1 ? 's' : ''} to your library.`);
    } else {
      Alert.alert('Done with errors', `Saved ${succeeded} of ${photos.length} photos. ${failures} failed.`);
    }
  }

  if (loading) return <LoadingView />;

  const deletableCount = media.filter(canDelete).length;
  const allSelected = deletableCount > 0 && selectedIds.size === deletableCount;

  return (
    <View style={styles.container}>
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

      {/* Header */}
      <View style={styles.header}>
        {selectMode ? (
          <View style={styles.headerRow}>
            <Text style={styles.count}>
              {selectedIds.size} selected
            </Text>
            <TouchableOpacity onPress={exitSelectMode} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.count}>{media.length} photos</Text>
            <View style={styles.headerActions}>
              {media.some((m) => m.media_type === 'photo') && (
                <TouchableOpacity
                  onPress={handleDownloadAll}
                  style={[styles.selectBtn, downloadingAll && styles.uploadBtnDisabled]}
                  disabled={downloadingAll}
                >
                  <Text style={styles.selectBtnText}>
                    {downloadingAll ? 'Downloading...' : 'Download All'}
                  </Text>
                </TouchableOpacity>
              )}
              {deletableCount > 0 && (
                <TouchableOpacity onPress={enterSelectMode} style={styles.selectBtn}>
                  <Text style={styles.selectBtnText}>Select</Text>
                </TouchableOpacity>
              )}
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
          </>
        )}
      </View>

      <FlatList
        data={media}
        keyExtractor={(item) => item.id}
        numColumns={COLS}
        removeClippedSubviews
        initialNumToRender={12}
        maxToRenderPerBatch={9}
        windowSize={5}
        refreshControl={
          !selectMode
            ? <RefreshControl
                refreshing={refreshing}
                onRefresh={() => { setRefreshing(true); loadMedia(); }}
                tintColor={Colors.primary}
              />
            : undefined
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
        renderItem={({ item }) => {
          const isSelected = selectedIds.has(item.id);
          const isPhoto = item.media_type === 'photo';

          return (
            <TouchableOpacity
              style={[styles.cell, isSelected && styles.cellSelected]}
              onPress={() => {
                if (selectMode) {
                  toggleSelect(item.id);
                } else {
                  navigation.navigate('MediaDetail', { tripId, mediaId: item.id });
                }
              }}
              onLongPress={() => {
                if (!selectMode) {
                  enterSelectMode();
                  toggleSelect(item.id);
                }
              }}
              activeOpacity={0.8}
            >
              {isPhoto ? (
                <Image source={{ uri: item.url }} style={styles.thumbnail} resizeMode="cover" />
              ) : (
                <View style={styles.mediaPlaceholder}>
                  <Text style={styles.mediaIcon}>{MEDIA_ICON[item.media_type] ?? '📎'}</Text>
                  <Text style={styles.mediaTypeLabel}>{item.media_type}</Text>
                </View>
              )}

              {!selectMode ? (
                <View style={styles.captionOverlay}>
                  {item.caption ? <Text style={styles.captionText} numberOfLines={1}>{item.caption}</Text> : null}
                  <Text style={styles.uploaderText} numberOfLines={1}>By {item.uploader?.full_name ?? 'Unknown'}</Text>
                </View>
              ) : null}

              {/* Download button — normal mode */}
              {!selectMode && isPhoto && (
                <TouchableOpacity
                  style={[styles.downloadBtn, downloadingId === item.id && styles.downloadBtnDisabled]}
                  onPress={() => handleDownload(item)}
                  disabled={downloadingId === item.id}
                  hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                >
                  <Text style={styles.downloadBtnText}>
                    {downloadingId === item.id ? '…' : '↓'}
                  </Text>
                </TouchableOpacity>
              )}

              {!selectMode && canDelete(item) && (
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={async () => {
                    const confirmed = Platform.OS === 'web'
                      ? window.confirm('Delete this item?')
                      : await new Promise<boolean>((resolve) =>
                          Alert.alert('Delete', 'Remove this item?', [
                            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                            { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
                          ])
                        );
                    if (!confirmed) return;
                    const { error } = await mediaService.deleteMedia(item);
                    if (error) {
                      Alert.alert('Unable to delete photo', error);
                    } else {
                      loadMedia();
                    }
                  }}
                  hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                >
                  <Text style={styles.deleteBtnText}>✕</Text>
                </TouchableOpacity>
              )}

              {/* Selection checkmark */}
              {selectMode && (
                <View style={[styles.checkCircle, isSelected && styles.checkCircleSelected]}>
                  {isSelected && <Text style={styles.checkMark}>✓</Text>}
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />

      {/* Bottom bar in select mode */}
      {selectMode && (
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={styles.bottomBarBtn}
            onPress={handleSelectAll}
          >
            <Text style={styles.bottomBarBtnText}>
              {allSelected ? 'Deselect All' : 'Select All'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.bottomBarBtn,
              styles.deleteBarBtn,
              (selectedIds.size === 0 || deleting) && styles.bottomBarBtnDisabled,
            ]}
            onPress={handleDeleteSelected}
            disabled={selectedIds.size === 0 || deleting}
          >
            <Text style={[styles.bottomBarBtnText, styles.deleteBarBtnText]}>
              {deleting ? 'Deleting...' : `Delete${selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}`}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  count: { fontSize: FontSize.sm, color: Colors.textSecondary },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  selectBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  selectBtnText: { color: Colors.primary, fontWeight: FontWeight.semiBold, fontSize: FontSize.sm },
  cancelBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  cancelBtnText: { color: Colors.primary, fontWeight: FontWeight.semiBold, fontSize: FontSize.sm },
  uploadBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
  },
  uploadBtnDisabled: { opacity: 0.5 },
  uploadBtnText: { color: Colors.surface, fontWeight: FontWeight.semiBold, fontSize: FontSize.sm },
  grid: { padding: Spacing.sm, flexGrow: 1 },
  cell: {
    width: CELL,
    height: CELL,
    margin: Spacing.sm / 2,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    backgroundColor: Colors.border,
  },
  cellSelected: {
    opacity: 0.75,
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  thumbnail: { width: '100%', height: '100%' },
  mediaPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F0F5',
    gap: 4,
  },
  mediaIcon: { fontSize: 28 },
  mediaTypeLabel: { fontSize: 10, color: Colors.textSecondary, textTransform: 'capitalize' },
  deleteBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: { fontSize: 11, color: '#fff', fontWeight: '700', lineHeight: 14 },
  downloadBtn: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadBtnDisabled: { opacity: 0.5 },
  downloadBtnText: { fontSize: 14, color: '#fff', fontWeight: '700', lineHeight: 16 },
  captionOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 4,
  },
  captionText: { color: '#fff', fontSize: 10 },
  uploaderText: { color: '#fff', fontSize: 9, opacity: 0.95, marginTop: 1 },
  checkCircle: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  checkMark: { color: '#fff', fontSize: 13, fontWeight: '700', lineHeight: 16 },
  bottomBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  bottomBarBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBarBtnDisabled: { opacity: 0.4 },
  deleteBarBtn: { borderLeftWidth: 1, borderLeftColor: Colors.border },
  bottomBarBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
    color: Colors.primary,
  },
  deleteBarBtnText: { color: Colors.danger },
});
