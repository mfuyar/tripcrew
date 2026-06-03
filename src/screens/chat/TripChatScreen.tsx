import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  useAudioRecorder,
  useAudioPlayer,
  useAudioPlayerStatus,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  RecordingPresets,
} from 'expo-audio';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Message } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useTripContext } from '../../contexts/TripContext';
import { chatService } from '../../services/chatService';
import { mediaService } from '../../services/mediaService';
import { demoMessages } from '../../lib/mockData';
import { MessageBubble } from '../../components/MessageBubble';
import { LoadingView } from '../../components/LoadingView';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../constants/theme';

export function TripChatScreen({ route }: { route: { params: { tripId: string } } }) {
  const { tripId } = route.params;
  const { user, isDemoMode } = useAuth();
  const { userFamily } = useTripContext();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [recordingInProgress, setRecordingInProgress] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [pendingPushTalks, setPendingPushTalks] = useState<{ id: string; url: string }[]>([]);
  const [playingPushTalk, setPlayingPushTalk] = useState<{ id: string; url: string } | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const pushTalkPlayer = useAudioPlayer(null, { updateInterval: 250 });
  const pushTalkStatus = useAudioPlayerStatus(pushTalkPlayer);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const listRef = useRef<FlatList>(null);
  const holdingPushTalkRef = useRef(false);
  const recordingRef = useRef(false);
  const stoppingRecordingRef = useRef(false);
  const queuedPushTalkIdsRef = useRef<Set<string>>(new Set());

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

    channelRef.current = chatService.subscribeToMessages(tripId, (msg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });

      if (msg.is_push_talk && msg.media_url && msg.user_id !== user?.id && !queuedPushTalkIdsRef.current.has(msg.id)) {
        queuedPushTalkIdsRef.current.add(msg.id);
        setPendingPushTalks((prev) => [...prev, { id: msg.id, url: msg.media_url! }]);
      }
    });

    return () => {
      if (channelRef.current) {
        chatService.unsubscribe(channelRef.current);
      }
    };
  }, [tripId, loadMessages, isDemoMode, user?.id]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  useEffect(() => {
    if (playingPushTalk || recordingInProgress || pendingPushTalks.length === 0) return;

    const [next, ...rest] = pendingPushTalks;
    setPendingPushTalks(rest);
    setPlayingPushTalk(next);
  }, [pendingPushTalks, playingPushTalk, recordingInProgress]);

  useEffect(() => {
    if (!playingPushTalk) return;

    let canceled = false;
    const pushTalk = playingPushTalk;
    async function playIncomingPushTalk() {
      try {
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        if (canceled) return;
        pushTalkPlayer.replace(pushTalk.url);
        pushTalkPlayer.play();
      } catch {
        setPlayingPushTalk(null);
        // Keep chat quiet; the message still appears with a manual play button.
      }
    }

    playIncomingPushTalk();
    return () => {
      canceled = true;
    };
  }, [playingPushTalk, pushTalkPlayer]);

  useEffect(() => {
    if (playingPushTalk && pushTalkStatus.didJustFinish) {
      setPlayingPushTalk(null);
    }
  }, [playingPushTalk, pushTalkStatus.didJustFinish]);

  async function handleSend() {
    const content = text.trim();
    if (!content || !user || sending) return;
    setText('');
    setSending(true);
    const { data } = await chatService.sendMessage(tripId, user.id, content, userFamily?.id, 'text');
    // Optimistic: add sender's own message immediately (broadcast echo handles other users)
    if (data) {
      setMessages((prev) => prev.some((m) => m.id === data.id) ? prev : [...prev, data]);
    }
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
      mediaTypes: ['images'],
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

  async function startPushTalk() {
    if (!user || recordingRef.current || uploadingMedia) return;
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert('Permission needed', 'Please allow microphone access to record audio.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordingRef.current = true;
      setRecordingInProgress(true);
      if (!holdingPushTalkRef.current) {
        setTimeout(() => sendPushTalk(), 0);
      }
    } catch (e: any) {
      recordingRef.current = false;
      setRecordingInProgress(false);
      Alert.alert('Recording failed', e?.message ?? 'Could not start audio recording.');
    }
  }

  async function sendPushTalk() {
    if (!user || !recordingRef.current || stoppingRecordingRef.current) return;
    stoppingRecordingRef.current = true;
    try {
      await recorder.stop();
      recordingRef.current = false;
      setRecordingInProgress(false);
      const uri = recorder.uri;
      const duration = recorder.currentTime; // seconds

      if (!uri) {
        Alert.alert('Recording failed', 'No audio was recorded.');
        return;
      }

      if (duration > 0 && duration < 0.35) {
        return;
      }

      setUploadingMedia(true);
      const { data, error } = await mediaService.uploadChatAudio(
        tripId, user.id, uri, 'audio'
      );
      if (error || !data) {
        Alert.alert('Upload failed', error ?? 'Unable to upload audio.');
        return;
      }
      const { data: message, error: messageError } = await chatService.sendMessage(
        tripId, user.id, 'Push talk', userFamily?.id,
        'audio', data.url, data.mime_type ?? 'audio/mp4', duration > 0 ? duration : undefined, true
      );
      if (messageError || !message) {
        Alert.alert('Message failed', messageError ?? 'Unable to send audio message.');
        return;
      }
      setMessages((prev) => prev.some((m) => m.id === message.id) ? prev : [...prev, message]);
    } catch (e: any) {
      recordingRef.current = false;
      setRecordingInProgress(false);
      Alert.alert('Recording failed', e?.message ?? 'Could not stop or upload the recording.');
    } finally {
      setUploadingMedia(false);
      stoppingRecordingRef.current = false;
    }
  }

  function handlePushTalkPressIn() {
    holdingPushTalkRef.current = true;
    startPushTalk();
  }

  function handlePushTalkPressOut() {
    holdingPushTalkRef.current = false;
    sendPushTalk();
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
        <Pressable
          style={({ pressed }) => [
            styles.attachmentButton,
            styles.pushTalkButton,
            (pressed || recordingInProgress) && styles.recordingActive,
            uploadingMedia && styles.attachmentButtonDisabled,
          ]}
          onPressIn={handlePushTalkPressIn}
          onPressOut={handlePushTalkPressOut}
          disabled={uploadingMedia}
          accessibilityRole="button"
          accessibilityLabel="Hold to talk"
        >
          <Text style={[styles.attachmentText, recordingInProgress && styles.recordingText]}>
            {recordingInProgress ? 'Live - release' : 'Hold to Talk'}
          </Text>
        </Pressable>
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
  attachmentButtonDisabled: {
    opacity: 0.6,
  },
  pushTalkButton: {
    borderColor: Colors.primary,
  },
  attachmentText: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
  },
  recordingText: {
    color: Colors.surface,
  },
});
