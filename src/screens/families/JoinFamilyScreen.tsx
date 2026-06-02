import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainStackParamList, Family } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useTripContext } from '../../contexts/TripContext';
import { familyService } from '../../services/familyService';
import { FamilyAvatar } from '../../components/FamilyAvatar';
import { AppButton } from '../../components/AppButton';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../constants/theme';

type Props = NativeStackScreenProps<MainStackParamList, 'JoinFamily'>;

export function JoinFamilyScreen({ navigation, route }: Props) {
  const { tripId } = route.params;
  const { user } = useAuth();
  const { families, members, setMembers, userFamily } = useTripContext();
  const [joining, setJoining] = useState<string | null>(null);

  // Families the user is NOT already a member of
  const joinableFamilies = families.filter(
    (f) => !members.some((m) => m.user_id === user?.id && m.family_id === f.id)
  );

  async function handleJoin(family: Family) {
    if (!user) return;
    const confirmed = Platform.OS === 'web'
      ? window.confirm(`Join "${family.name}"?`)
      : await new Promise<boolean>((resolve) =>
          Alert.alert('Join Family', `Join "${family.name}"?`, [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Join', onPress: () => resolve(true) },
          ])
        );
    if (!confirmed) return;

    setJoining(family.id);
    const { error } = await familyService.addFamilyMember(family.id, tripId, user.id);
    setJoining(null);

    if (error) {
      Alert.alert('Error', error);
      return;
    }

    // Update members in context so userFamily resolves immediately
    const { data: updatedMembers } = await familyService.getFamilyMembers(family.id);
    setMembers([
      ...members.filter((m) => m.user_id !== user.id),
      {
        id: `temp-${user.id}`,
        trip_id: tripId,
        user_id: user.id,
        family_id: family.id,
        role: 'member' as const,
        joined_at: new Date().toISOString(),
        family,
      },
    ]);
    navigation.goBack();
  }

  return (
    <View style={styles.container}>
      <Text style={styles.subtitle}>
        Select your family so expenses, messages and photos are attributed correctly.
      </Text>

      {userFamily && (
        <View style={styles.alreadyCard}>
          <Text style={styles.alreadyText}>
            ✅ You are already in <Text style={styles.alreadyBold}>{userFamily.name}</Text>
          </Text>
        </View>
      )}

      <FlatList
        data={joinableFamilies}
        keyExtractor={(f) => f.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const currentMembers = members.filter((m) => m.family_id === item.id);
          const memberNames = currentMembers
            .map((m) => m.profile?.full_name?.split(' ')[0])
            .filter(Boolean)
            .join(', ');

          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => handleJoin(item)}
              disabled={joining !== null}
              activeOpacity={0.75}
            >
              <FamilyAvatar name={item.name} color={item.color} size={48} />
              <View style={styles.info}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.counts}>
                  {item.adults_count} adult{item.adults_count !== 1 ? 's' : ''}
                  {item.children_count > 0 ? `, ${item.children_count} child${item.children_count !== 1 ? 'ren' : ''}` : ''}
                </Text>
                {memberNames ? (
                  <Text style={styles.memberNames}>Members: {memberNames}</Text>
                ) : (
                  <Text style={styles.memberNames}>No one has joined yet</Text>
                )}
              </View>
              {joining === item.id ? (
                <Text style={styles.joining}>Joining…</Text>
              ) : (
                <Text style={styles.joinArrow}>Join →</Text>
              )}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              No other families to join. Create a new family below.
            </Text>
          </View>
        }
      />

      <View style={styles.footer}>
        <AppButton
          title="+ Create a New Family"
          onPress={() => navigation.replace('AddEditFamily', { tripId })}
          variant="outline"
          fullWidth
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    padding: Spacing.md,
    paddingBottom: 0,
    lineHeight: 20,
  },
  alreadyCard: {
    margin: Spacing.md,
    backgroundColor: Colors.success + '18',
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  alreadyText: { fontSize: FontSize.sm, color: Colors.success },
  alreadyBold: { fontWeight: FontWeight.bold },
  list: { padding: Spacing.md, flexGrow: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadow.sm,
  },
  info: { flex: 1, marginLeft: Spacing.md },
  name: { fontSize: FontSize.md, fontWeight: FontWeight.semiBold, color: Colors.text },
  counts: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  memberNames: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  joining: { fontSize: FontSize.sm, color: Colors.textSecondary },
  joinArrow: { fontSize: FontSize.md, color: Colors.primary, fontWeight: FontWeight.bold },
  empty: { padding: Spacing.xl, alignItems: 'center' },
  emptyText: { fontSize: FontSize.md, color: Colors.textSecondary, textAlign: 'center' },
  footer: { padding: Spacing.md, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border },
});
