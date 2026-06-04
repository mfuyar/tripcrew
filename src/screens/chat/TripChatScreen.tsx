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
  useAudioRecorderState,
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
import { chatService, setActiveChatTrip } from '../../services/chatService';
import { mediaService } from '../../services/mediaService';
import { familyService } from '../../services/familyService';
import { demoMessages } from '../../lib/mockData';
import { MessageBubble } from '../../components/MessageBubble';
import { LoadingView } from '../../components/LoadingView';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../constants/theme';

export function TripChatScreen({ route }: { route: { params: { tripId: string } } }) {
  const { tripId } = route.params;
  const { user, profile, isDemoMode } = useAuth();
  const { userFamily } = useTripContext();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [recordingInProgress, setRecordingInProgress] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [liveAudioEnabled, setLiveAudioEnabled] = useState(false);
  const [updatingLiveAudio, setUpdatingLiveAudio] = useState(false);
  const [playingPushTalk, setPlayingPushTalk] = useState<{ id: string; url: string } | null>(null);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({}); // userId → name
  const typingTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const typingBroadcastRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 150);
  const pushTalkPlayer = useAudioPlayer(null, { updateInterval: 250 });
  const pushTalkStatus = useAudioPlayerStatus(pushTalkPlayer);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const listRef = useRef<FlatList>(null);
  const holdingPushTalkRef = useRef(false);
  const startingRecordingRef = useRef(false);
  const recordingRef = useRef(false);
  const stoppingRecordingRef = useRef(false);
  const pendingStopRef = useRef(false);
  const recordingStartedAtRef = useRef<number | null>(null);
  const queuedPushTalkIdsRef = useRef<Set<string>>(new Set());
  const pendingPushTalksRef = useRef<{ id: string; url: string }[]>([]);
  const playingPushTalkRef = useRef<{ id: string; url: string } | null>(null);
  // Ref-backed upload guard so startPushTalk never reads a stale closure value
  const uploadingRef = useRef(false);
  // Tracks whether the push-talk player has actually started playing (isPlaying went true)
  // so we can detect the true→false transition rather than relying on didJustFinish
  const pushTalkHasPlayedRef = useRef(false);
  // Whether the current user opted in to receive push-talk audio auto-play.
  const pushTalkEnabledRef = useRef(false);
  const pushTalkMemberIdRef = useRef<string | null>(null);

  function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function resetRecordingState() {
    pendingStopRef.current = false;
    startingRecordingRef.current = false;
    stoppingRecordingRef.current = false;
    recordingRef.current = false;
    recordingStartedAtRef.current = null;
    setRecordingInProgress(false);
  }

  function showRecordingError(message?: string) {
    const isAudioSessionError = message?.includes('561210739') || message?.includes('!ses');
    Alert.alert(
      'Recording failed',
      isAudioSessionError
        ? 'Could not start the microphone. Wait a second and try again.'
        : message ?? 'Could not start audio recording.'
    );
  }

  async function playPushTalkNow(pushTalk: { id: string; url: string }) {
    playingPushTalkRef.current = pushTalk;
    pushTalkHasPlayedRef.current = false;
    setPlayingPushTalk(pushTalk);
    try {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      if (playingPushTalkRef.current?.id !== pushTalk.id) return;
      pushTalkPlayer.replace(pushTalk.url);
      pushTalkPlayer.seekTo(0);
      pushTalkPlayer.play();
    } catch {
      if (playingPushTalkRef.current?.id === pushTalk.id) {
        playingPushTalkRef.current = null;
        setPlayingPushTalk(null);
        playNextQueuedPushTalk();
      }
    }
  }

  function playNextQueuedPushTalk() {
    if (playingPushTalkRef.current || recordingRef.current || recordingInProgress) return;
    const next = pendingPushTalksRef.current.shift();
    if (next) void playPushTalkNow(next);
  }

  function enqueueIncomingPushTalk(pushTalk: { id: string; url: string }) {
    if (queuedPushTalkIdsRef.current.has(pushTalk.id)) return;
    queuedPushTalkIdsRef.current.add(pushTalk.id);
    if (!playingPushTalkRef.current && !recordingRef.current && !recordingInProgress) {
      void playPushTalkNow(pushTalk);
      return;
    }
    pendingPushTalksRef.current.push(pushTalk);
  }

  const loadMessages = useCallback(async () => {
    if (isDemoMode) {
      setMessages(demoMessages);
      setLoading(false);
      return;
    }
    await mediaService.deleteExpiredChatMedia(tripId);
    const { data } = await chatService.getMessages(tripId);
    setMessages(data ?? []);
    setLoading(false);

    // Load the current user's push-talk opt-in status so we know whether
    // to auto-play incoming audio. Re-read on every focus in case they toggled it.
    if (user?.id && userFamily?.id) {
      const { data: members } = await familyService.getFamilyMembers(userFamily.id);
      const me = members?.find((m) => m.user_id === user.id);
      if (me !== undefined) {
        pushTalkMemberIdRef.current = me.id;
        pushTalkEnabledRef.current = me.push_talk_enabled;
        setLiveAudioEnabled(me.push_talk_enabled);
      }
    } else {
      pushTalkMemberIdRef.current = null;
      pushTalkEnabledRef.current = false;
      setLiveAudioEnabled(false);
    }
  }, [tripId, isDemoMode, user?.id, userFamily?.id]);

  // Tell background player the chat screen is active so it skips auto-play
  useEffect(() => {
    setActiveChatTrip(tripId);
    return () => setActiveChatTrip(null);
  }, [tripId]);

  useEffect(() => {
    loadMessages();

    if (isDemoMode) return;

    channelRef.current = chatService.subscribeToMessages(tripId, (msg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) {
          return prev.map((m) => m.id === msg.id ? msg : m);
        }
        return [...prev, msg];
      });

      const shouldLivePlay =
        msg.is_push_talk &&
        msg.media_url &&
        msg.user_id !== user?.id &&
        (!msg.family_id || !userFamily?.id || msg.family_id === userFamily.id) &&
        (pushTalkEnabledRef.current || liveAudioEnabled);

      if (shouldLivePlay) {
        enqueueIncomingPushTalk({ id: msg.id, url: msg.media_url! });
      }
    }, (typingUserId, typingName) => {
      // Ignore own typing events
      if (typingUserId === user?.id) return;
      setTypingUsers((prev) => ({ ...prev, [typingUserId]: typingName }));
      // Clear after 3s of silence
      clearTimeout(typingTimersRef.current[typingUserId]);
      typingTimersRef.current[typingUserId] = setTimeout(() => {
        setTypingUsers((prev) => {
          const next = { ...prev };
          delete next[typingUserId];
          return next;
        });
      }, 3000);
    });

    return () => {
      if (channelRef.current) {
        chatService.unsubscribe(channelRef.current);
      }
    };
  }, [tripId, loadMessages, isDemoMode, user?.id, userFamily?.id]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  useEffect(() => {
    if (!recordingInProgress) playNextQueuedPushTalk();
  }, [recordingInProgress]);

  // Detect finish via isPlaying transition (true→false) rather than the transient
  // didJustFinish flag which can be missed if React doesn't flush in the same 250ms poll.
  useEffect(() => {
    if (!playingPushTalk) { pushTalkHasPlayedRef.current = false; return; }
    if (pushTalkStatus.playing) {
      pushTalkHasPlayedRef.current = true;
    } else if (pushTalkHasPlayedRef.current) {
      pushTalkHasPlayedRef.current = false;
      playingPushTalkRef.current = null;
      setPlayingPushTalk(null);
      playNextQueuedPushTalk();
    }
  }, [playingPushTalk, pushTalkStatus.playing]);

  // Safety timeout: clear stuck playingPushTalk after 30s (e.g. URL load error)
  useEffect(() => {
    if (!playingPushTalk) return;
    const t = setTimeout(() => {
      pushTalkHasPlayedRef.current = false;
      playingPushTalkRef.current = null;
      setPlayingPushTalk(null);
      playNextQueuedPushTalk();
    }, 30000);
    return () => clearTimeout(t);
  }, [playingPushTalk]);

  async function handleSend() {
    const content = text.trim();
    if (!content || !user || sending) return;
    setText('');
    setSending(true);
    const { data, error } = await chatService.sendMessage(tripId, user.id, content, userFamily?.id, 'text');
    if (error || !data) {
      setText(content);
      Alert.alert('Message failed', error ?? 'Unable to send this message.');
    } else {
      // Optimistic: add sender's own message immediately (realtime echo handles other users)
      setMessages((prev) => prev.some((m) => m.id === data.id) ? prev : [...prev, data]);
    }
    setSending(false);
  }

  async function handleSaveEdit() {
    const content = text.trim();
    if (!content || !user || !editingMessage || sending) return;
    if (content === editingMessage.content) {
      setEditingMessage(null);
      setText('');
      return;
    }

    setSending(true);
    const { data, error } = await chatService.editMessage(editingMessage.id, user.id, content);
    if (error || !data) {
      Alert.alert('Edit failed', error ?? 'Unable to update this message.');
      setSending(false);
      return;
    }

    setMessages((prev) => prev.map((m) => m.id === data.id ? data : m));
    setEditingMessage(null);
    setText('');
    setSending(false);
  }

  function handleStartEdit(message: Message) {
    if (message.user_id !== user?.id || message.message_type !== 'text') return;
    setEditingMessage(message);
    setText(message.content);
  }

  function handleCancelEdit() {
    setEditingMessage(null);
    setText('');
  }

  async function handleSetLiveAudio(enabled: boolean) {
    if (enabled === liveAudioEnabled || updatingLiveAudio) return;
    setLiveAudioEnabled(enabled);
    pushTalkEnabledRef.current = enabled;
    if (enabled) playNextQueuedPushTalk();

    if (isDemoMode || !pushTalkMemberIdRef.current) return;

    setUpdatingLiveAudio(true);
    const { error } = await familyService.updateFamilyMemberPushTalk(pushTalkMemberIdRef.current, enabled);
    setUpdatingLiveAudio(false);

    if (error) {
      setLiveAudioEnabled(!enabled);
      pushTalkEnabledRef.current = !enabled;
      Alert.alert('Audio mode failed', error);
    }
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
    uploadingRef.current = true; setUploadingMedia(true);

    const { data, error } = await mediaService.uploadChatMedia(
      tripId,
      user.id,
      asset.uri,
      'photo'
    );

    if (error || !data) {
      Alert.alert('Upload failed', error ?? 'Unable to upload photo.');
      uploadingRef.current = false; setUploadingMedia(false);
      return;
    }

    const { data: message, error: messageError } = await chatService.sendMessage(
      tripId,
      user.id,
      '',
      userFamily?.id,
      'image',
      data.url,
      data.mime_type
    );
    if (messageError || !message) {
      Alert.alert('Message failed', messageError ?? 'Unable to send photo message.');
    } else {
      setMessages((prev) => prev.some((m) => m.id === message.id) ? prev : [...prev, message]);
    }
    uploadingRef.current = false; setUploadingMedia(false);
  }

  async function startPushTalk() {
    if (
      !user ||
      startingRecordingRef.current ||
      recordingRef.current ||
      recorderState.isRecording ||
      uploadingRef.current
    ) return;
    startingRecordingRef.current = true;
    pendingStopRef.current = false;
    stoppingRecordingRef.current = false;
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert('Permission needed', 'Please allow microphone access to record audio.');
        return;
      }

      if (pushTalkStatus.playing || playingPushTalk) {
        pushTalkPlayer.pause();   // don't call replace(null) — expo-audio rejects null AudioSource
        pushTalkHasPlayedRef.current = false;
        playingPushTalkRef.current = null;
        setPlayingPushTalk(null);
        await wait(150);
      }

      // setIsAudioActiveAsync can fail with "Session lookup failed" when the
      // session is already in playback mode. setAudioModeAsync alone is enough.
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await wait(150);

      setPlayingPushTalk(null);
      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: 60 });
      recordingStartedAtRef.current = Date.now();
      recordingRef.current = true;
      setRecordingInProgress(true);
      if (!holdingPushTalkRef.current || pendingStopRef.current) {
        setTimeout(() => sendPushTalk(), 0);
      }
    } catch (e: any) {
      resetRecordingState();
      showRecordingError(e?.message);
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    } finally {
      startingRecordingRef.current = false;
    }
  }

  async function sendPushTalk() {
    if (!user || stoppingRecordingRef.current) return;
    if (startingRecordingRef.current && !recordingRef.current) {
      pendingStopRef.current = true;
      return;
    }
    if (!recordingRef.current && !recorderState.isRecording) return;
    stoppingRecordingRef.current = true;
    try {
      if (recorderState.isRecording || recordingRef.current) {
        await recorder.stop();
      }
      recordingRef.current = false;
      setRecordingInProgress(false);
      const uri = recorder.uri ?? recorderState.url;
      const wallClockDuration = recordingStartedAtRef.current
        ? (Date.now() - recordingStartedAtRef.current) / 1000
        : 0;
      const recorderDuration = recorder.currentTime > 0
        ? recorder.currentTime
        : recorderState.durationMillis / 1000;
      const duration = recorderDuration > 0 ? recorderDuration : wallClockDuration;
      recordingStartedAtRef.current = null;

      if (!uri) {
        if (duration >= 0.35) {
          Alert.alert('Recording failed', 'No audio was recorded.');
        }
        return;
      }

      if (duration > 0 && duration < 0.35) {
        return;
      }

      uploadingRef.current = true; setUploadingMedia(true);
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
      resetRecordingState();
      showRecordingError(e?.message ?? 'Could not stop or upload the recording.');
    } finally {
      pendingStopRef.current = false;
      uploadingRef.current = false; setUploadingMedia(false);
      stoppingRecordingRef.current = false;
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
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
          <MessageBubble
            message={item}
            isOwn={item.user_id === user?.id}
            onEdit={handleStartEdit}
          />
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
      <View style={styles.listenModeBar}>
        <Pressable
          style={[
            styles.listenModeOption,
            liveAudioEnabled && styles.listenModeOptionActive,
            updatingLiveAudio && styles.attachmentButtonDisabled,
          ]}
          onPress={() => handleSetLiveAudio(true)}
          disabled={updatingLiveAudio}
          accessibilityRole="button"
          accessibilityLabel="Live audio"
        >
          <Text style={[styles.listenModeText, liveAudioEnabled && styles.listenModeTextActive]}>
            Live Audio
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.listenModeOption,
            !liveAudioEnabled && styles.listenModeOptionActive,
            updatingLiveAudio && styles.attachmentButtonDisabled,
          ]}
          onPress={() => handleSetLiveAudio(false)}
          disabled={updatingLiveAudio}
          accessibilityRole="button"
          accessibilityLabel="Play button"
        >
          <Text style={[styles.listenModeText, !liveAudioEnabled && styles.listenModeTextActive]}>
            Play Button
          </Text>
        </Pressable>
      </View>
      <View style={styles.attachmentBar}>
        <TouchableOpacity
          style={[styles.attachmentButton, (uploadingMedia || recordingInProgress) && styles.attachmentButtonDisabled]}
          onPress={handlePickPhoto}
          disabled={uploadingMedia || recordingInProgress}
        >
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
      {Object.keys(typingUsers).length > 0 && (
        <View style={styles.typingBar}>
          <Text style={styles.typingText}>
            {Object.values(typingUsers).join(', ')} {Object.keys(typingUsers).length === 1 ? 'is' : 'are'} typing…
          </Text>
        </View>
      )}
      <View style={styles.inputBar}>
        {editingMessage ? (
          <TouchableOpacity
            style={styles.cancelEditBtn}
            onPress={handleCancelEdit}
            disabled={sending}
          >
            <Text style={styles.cancelEditText}>Cancel</Text>
          </TouchableOpacity>
        ) : null}
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={(t) => {
            setText(t);
            // Throttle typing broadcasts to once per second
            if (typingBroadcastRef.current) return;
            typingBroadcastRef.current = setTimeout(() => {
              typingBroadcastRef.current = null;
            }, 1000);
            if (t.length > 0 && user) {
              chatService.broadcastTyping(tripId, user.id, profile?.full_name ?? 'Someone');
            }
          }}
          placeholder={editingMessage ? 'Edit message...' : 'Type a message...'}
          placeholderTextColor={Colors.textSecondary}
          multiline
          maxLength={1000}
          returnKeyType="send"
          onSubmitEditing={editingMessage ? handleSaveEdit : handleSend}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
          onPress={editingMessage ? handleSaveEdit : handleSend}
          disabled={!text.trim() || sending}
        >
          {sending || uploadingMedia ? (
            <ActivityIndicator size="small" color={Colors.surface} />
          ) : (
            <Text style={styles.sendIcon}>{editingMessage ? 'OK' : '↑'}</Text>
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
  typingBar: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    backgroundColor: Colors.surface,
  },
  typingText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
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
  cancelEditBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xs,
  },
  cancelEditText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
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
  listenModeBar: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
    paddingBottom: 0,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing.sm,
  },
  listenModeOption: {
    flex: 1,
    minHeight: 36,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  listenModeOptionActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  listenModeText: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
  },
  listenModeTextActive: {
    color: Colors.surface,
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
