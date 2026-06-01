import React, { useState, useCallback } from 'react';
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

  const loadMedia = useCallback(async () => {
    if (isDemoMode) { setMedia([]); setLoading(false); setRefreshing(false); return; }
    const { data } = await mediaService.getMedia(tripId);
    setMedia(data ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [tripId, isDemoMode]);

  useFocusEffect(useCallback(() => { loadMedia(); }, [loadMedia]));

  async function handleUpload() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets.length > 0 && user) {
      setUploading(true);
      for (const asset of result.assets) {
        await mediaService.uploadMedia(
          tripId, user.id, userFamily?.id, asset.uri, 'photo'
        );
      }
      setUploading(false);
      loadMedia();
    }
  }

  if (loading) return <LoadingView />;

  return (
    <View style={styles.container}>
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
