import React, { useEffect } from 'react';
import { Alert, Image, Text, StyleSheet, TouchableOpacity, View } from 'react-native';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Message } from '../types';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme';

interface Props {
  message: Message;
  isOwn: boolean;
  onEdit?: (message: Message) => void;
}

function formatDuration(seconds?: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const rounded = Math.round(seconds);
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
}

function AudioMessageContent({ message, isOwn }: Props) {
  const player = useAudioPlayer(message.media_url ?? null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const duration = formatDuration(message.duration_seconds ?? status.duration);

  // Set audio mode once on mount — doing it on every tap adds 100–200ms latency
  useEffect(() => {
    setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
  }, []);

  function handleTogglePlayback() {
    try {
      if (status.playing) {
        player.pause();
        return;
      }
      if (status.didJustFinish) player.seekTo(0);
      player.play();
    } catch (e: any) {
      Alert.alert('Playback failed', e?.message ?? 'Could not play this audio message.');
    }
  }

  return (
    <View style={styles.audioCard}>
      <TouchableOpacity
        style={[styles.audioPlayButton, isOwn ? styles.audioPlayButtonOwn : styles.audioPlayButtonOther]}
        onPress={handleTogglePlayback}
      >
        <Text style={[styles.audioPlayIcon, isOwn ? styles.textOwn : styles.textOther]}>
          {status.playing ? 'Pause' : 'Play'}
        </Text>
      </TouchableOpacity>
      <View style={styles.audioTextBlock}>
        <Text style={[styles.audioLabel, isOwn ? styles.textOwn : styles.textOther]}>
          {message.is_push_talk ? 'Push talk' : 'Audio message'}
        </Text>
        {duration ? (
          <Text style={[styles.audioMeta, isOwn ? styles.audioMetaOwn : styles.audioMetaOther]}>
            {duration}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function MessageBubble({ message, isOwn, onEdit }: Props) {
  const time = new Date(message.created_at).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View style={[styles.wrapper, isOwn ? styles.wrapperOwn : styles.wrapperOther]}>
      {!isOwn && (
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarText}>
            {(message.family?.name ?? message.profile?.full_name ?? '?').charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
      <View style={styles.contentWrapper}>
        {!isOwn && (
          <Text style={styles.senderName}>
            {message.family
              ? `${message.family.name} (${message.profile?.full_name?.split(' ')[0] ?? '?'})`
              : (message.profile?.full_name ?? 'Unknown')}
          </Text>
        )}
        <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
          {message.message_type === 'image' && message.media_url ? (
            <Image source={{ uri: message.media_url }} style={styles.image} resizeMode="cover" />
          ) : message.message_type === 'audio' && message.media_url ? (
            <AudioMessageContent message={message} isOwn={isOwn} />
          ) : (
            <Text style={[styles.text, isOwn ? styles.textOwn : styles.textOther]}>
              {message.content}
            </Text>
          )}
        </View>
        <View style={[styles.metaRow, isOwn ? styles.metaRowOwn : styles.metaRowOther]}>
          {isOwn && message.message_type === 'text' && onEdit ? (
            <TouchableOpacity onPress={() => onEdit(message)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.editAction}>Edit</Text>
            </TouchableOpacity>
          ) : null}
          <Text style={[styles.time, isOwn ? styles.timeOwn : styles.timeOther]}>
            {message.edited_at ? `${time} · edited` : time}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    maxWidth: '85%',
  },
  wrapperOwn: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
  },
  wrapperOther: {
    alignSelf: 'flex-start',
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
    marginTop: 2,
    flexShrink: 0,
  },
  avatarText: {
    color: Colors.surface,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  contentWrapper: {
    flexShrink: 1,
  },
  senderName: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginBottom: 2,
    marginLeft: Spacing.xs,
  },
  bubble: {
    borderRadius: Radius.lg,
    padding: Spacing.sm + 2,
    maxWidth: '100%',
  },
  bubbleOwn: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: Colors.surface,
    borderBottomLeftRadius: 4,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.8,
    shadowRadius: 2,
    elevation: 1,
  },
  text: {
    fontSize: FontSize.md,
    lineHeight: 20,
  },
  textOwn: {
    color: Colors.surface,
  },
  textOther: {
    color: Colors.text,
  },
  image: {
    width: 200,
    height: 150,
    borderRadius: Radius.md,
  },
  audioCard: {
    minWidth: 190,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: Radius.md,
  },
  audioPlayButton: {
    minWidth: 58,
    minHeight: 36,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
  audioPlayButtonOwn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  audioPlayButtonOther: {
    backgroundColor: Colors.background,
  },
  audioPlayIcon: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  audioTextBlock: {
    flex: 1,
  },
  audioLabel: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  audioMeta: {
    fontSize: FontSize.xs,
    marginTop: 4,
  },
  audioMetaOwn: {
    color: Colors.surface,
    opacity: 0.9,
  },
  audioMetaOther: {
    color: Colors.textSecondary,
  },
  time: {
    fontSize: FontSize.xs,
  },
  timeOwn: {
    color: Colors.textSecondary,
    textAlign: 'right',
  },
  timeOther: {
    color: Colors.textSecondary,
    marginLeft: Spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: 2,
  },
  metaRowOwn: {
    justifyContent: 'flex-end',
  },
  metaRowOther: {
    justifyContent: 'flex-start',
  },
  editAction: {
    color: Colors.primary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
  },
});
