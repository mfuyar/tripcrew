import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Message } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useTripContext } from '../../contexts/TripContext';
import { chatService } from '../../services/chatService';
import { mediaService } from '../../services/mediaService';
import { demoMessages } from '../../lib/mockData';
import { MessageBubble } from '../../components/MessageBubble';
import { LoadingView } from '../../components/LoadingView';
import { Colors, FontSize, Spacing, Radius, Shadow } from '../../constants/theme';

export function TripChatScreen({ route }: { route: { params: { tripId: string } } }) {
  const { tripId } = route.params;
  const { user, isDemoMode } = useAuth();
  const { userFamily } = useTripContext();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordingInProgress, setRecordingInProgress] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const listRef = useRef<FlatList>(null);

  const loadMessages = useCallback(async () => {
    if (isDemoMode) {
      setMessages(demoMessages);
      setLoading(false);
      return;
    }
    const { data } = await chatService.getMessages(tripId);
    setMessages(data ?? []);
    setLoading(false);
  }, [tripId, isDemoMode]);

  useEffect(() => {
    loadMessages();

    if (isDemoMode) return;

    // Subscribe to real-time messages
    channelRef.current = chatService.subscribeToMessages(tripId, (msg) => {
      setMessages((prev) => {
        // Avoid duplicates
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    });

    return () => {
      if (channelRef.current) {
        chatService.unsubscribe(channelRef.current);
      }
    };
  }, [tripId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  async function handleSend() {
    const content = text.trim();
    if (!content || !user || sending) return;
    setText('');
    setSending(true);
    await chatService.sendMessage(tripId, user.id, content, userFamily?.id, 'text');
    setSending(false);
  }

  async function handlePickPhoto() {
    if (!user) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access to upload an image.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: false,
      quality: 0.7,
    });

    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    setUploadingMedia(true);

    const { data, error } = await mediaService.uploadMedia(
      tripId,
      user.id,
      userFamily?.id,
      asset.uri,
      'photo'
    );

    if (error || !data) {
      Alert.alert('Upload failed', error ?? 'Unable to upload photo.');
      setUploadingMedia(false);
      return;
    }

    await chatService.sendMessage(
      tripId,
      user.id,
      '',
      userFamily?.id,
      'image',
      data.url,
      asset.type === 'image' ? `image/${asset.uri.split('.').pop() ?? 'jpeg'}` : undefined
    );
    setUploadingMedia(false);
  }

  async function startRecording() {
    if (!user) return;
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow microphone access to record audio.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      const recordingInstance = new Audio.Recording();
      await recordingInstance.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recordingInstance.startAsync();
      setRecording(recordingInstance);
      setRecordingInProgress(true);
    } catch (error) {
      Alert.alert('Recording failed', 'Could not start audio recording.');
    }
  }

  async function stopRecording() {
    if (!recording || !user) return;
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      const durationMillis = recording.getStatusAsync ? (await recording.getStatusAsync()).durationMillis : null;
      setRecording(null);
      setRecordingInProgress(false);

      if (!uri) {
        Alert.alert('Recording failed', 'No audio was recorded.');
        return;
      }

      setUploadingMedia(true);
      const { data, error } = await mediaService.uploadMedia(
        tripId,
        user.id,
        userFamily?.id,
        uri,
        'audio'
      );

      if (error || !data) {
        Alert.alert('Upload failed', error ?? 'Unable to upload audio.');
        setUploadingMedia(false);
        return;
      }

      await chatService.sendMessage(
        tripId,
        user.id,
        'Audio message',
        userFamily?.id,
        'audio',
        data.url,
        'audio/m4a',
        durationMillis ? durationMillis / 1000 : undefined,
        true
      );
    } catch (error) {
      Alert.alert('Recording failed', 'Could not stop or upload the recording.');
    } finally {
      setUploadingMedia(false);
    }
  }

  if (loading) return <LoadingView />;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <MessageBubble message={item} isOwn={item.user_id === user?.id} />
        )}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyText}>No messages yet. Say hello!</Text>
          </View>
        }
      />
      <View style={styles.attachmentBar}>
        <TouchableOpacity style={styles.attachmentButton} onPress={handlePickPhoto} disabled={uploadingMedia}>
          <Text style={styles.attachmentText}>📷 Photo</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.attachmentButton, recordingInProgress && styles.recordingActive]}
          onPress={recordingInProgress ? stopRecording : startRecording}
          disabled={uploadingMedia}
        >
          <Text style={styles.attachmentText}>{recordingInProgress ? '⏹️ Stop' : '🎙️ Record'}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Type a message..."
          placeholderTextColor={Colors.textSecondary}
          multiline
          maxLength={1000}
          returnKeyType="send"
          onSubmitEditing={handleSend}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
        >
          {sending || uploadingMedia ? (
            <ActivityIndicator size="small" color={Colors.surface} />
          ) : (
            <Text style={styles.sendIcon}>↑</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  messageList: { paddingVertical: Spacing.md, flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  emptyIcon: { fontSize: 48, marginBottom: Spacing.md },
  emptyText: { fontSize: FontSize.md, color: Colors.textSecondary },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: Spacing.sm,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: Radius.xl,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    fontSize: FontSize.md,
    color: Colors.text,
    maxHeight: 120,
    minHeight: 44,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.sm,
  },
  sendBtnDisabled: { backgroundColor: Colors.textSecondary },
  sendIcon: { color: Colors.surface, fontSize: 20, fontWeight: 'bold' },
  attachmentBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing.sm,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing.sm,
  },
  attachmentButton: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: Radius.xl,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  recordingActive: {
    backgroundColor: Colors.danger,
  },
  attachmentText: {
    color: Colors.text,
    fontSize: FontSize.sm,
  },
});
