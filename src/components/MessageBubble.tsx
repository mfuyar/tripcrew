import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { Message } from '../types';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme';

interface Props {
  message: Message;
  isOwn: boolean;
}

export function MessageBubble({ message, isOwn }: Props) {
  const time = new Date(message.created_at).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View style={[styles.wrapper, isOwn ? styles.wrapperOwn : styles.wrapperOther]}>
      {!isOwn && (
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarText}>
            {(message.profile?.full_name ?? '?').charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
      <View style={styles.contentWrapper}>
        {!isOwn && (
          <Text style={styles.senderName}>
            {message.profile?.full_name ?? 'Unknown'}
            {message.family ? ` · ${message.family.name}` : ''}
          </Text>
        )}
        <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
          {message.message_type === 'image' && message.media_url ? (
            <Image source={{ uri: message.media_url }} style={styles.image} resizeMode="cover" />
          ) : message.message_type === 'audio' && message.media_url ? (
            <View style={styles.audioCard}>
              <Text style={[styles.audioLabel, isOwn ? styles.textOwn : styles.textOther]}>🎙️ Audio message</Text>
              {message.duration_seconds ? (
                <Text style={[styles.audioMeta, isOwn ? styles.textOwn : styles.textOther]}>
                  {`${message.duration_seconds.toFixed(1)} sec`}
                </Text>
              ) : null}
            </View>
          ) : (
            <Text style={[styles.text, isOwn ? styles.textOwn : styles.textOther]}>
              {message.content}
            </Text>
          )}
        </View>
        <Text style={[styles.time, isOwn ? styles.timeOwn : styles.timeOther]}>
          {time}
        </Text>
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
    padding: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: Radius.md,
  },
  audioLabel: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  audioMeta: {
    fontSize: FontSize.xs,
    marginTop: 4,
    color: Colors.textSecondary,
  },
  time: {
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  timeOwn: {
    color: Colors.textSecondary,
    textAlign: 'right',
  },
  timeOther: {
    color: Colors.textSecondary,
    marginLeft: Spacing.xs,
  },
});
