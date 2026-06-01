import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainStackParamList } from '../../types';
import { useTripContext } from '../../contexts/TripContext';
import { useAuth } from '../../contexts/AuthContext';
import { tripService } from '../../services/tripService';
import { AppTextInput } from '../../components/AppTextInput';
import { AppButton } from '../../components/AppButton';
import { FamilyAvatar } from '../../components/FamilyAvatar';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../constants/theme';

type Props = NativeStackScreenProps<MainStackParamList, 'TripSettings'>;

export function TripSettingsScreen({ navigation, route }: Props) {
  const { tripId } = route.params;
  const { currentTrip, members, isTripOrganizer, setCurrentTrip } = useTripContext();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(currentTrip?.name ?? '');
  const [destination, setDestination] = useState(currentTrip?.destination ?? '');

  async function handleSave() {
    setSaving(true);
    const { data, error } = await tripService.updateTrip(tripId, { name, destination });
    setSaving(false);
    if (error) {
      Alert.alert('Error', error);
    } else if (data) {
      setCurrentTrip(data);
      Alert.alert('Saved', 'Trip settings updated.');
    }
  }

  async function handleLeave() {
    if (!user) return;
    Alert.alert('Leave Trip', 'Are you sure you want to leave this trip?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          await tripService.removeMember(tripId, user.id);
          setCurrentTrip(null);
          navigation.navigate('Tabs');
        },
      },
    ]);
  }

  async function handleDelete() {
    Alert.alert(
      'Delete Trip',
      'This will permanently delete the trip and all its data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await tripService.deleteTrip(tripId);
            setCurrentTrip(null);
            navigation.navigate('Tabs');
          },
        },
      ]
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Invite Code */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Invite Code</Text>
        <View style={styles.codeBox}>
          <Text style={styles.inviteCode}>{currentTrip?.invite_code}</Text>
          <Text style={styles.codeHint}>Share this code for others to join</Text>
        </View>
      </View>

      {/* Edit Trip */}
      {isTripOrganizer && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trip Details</Text>
          <AppTextInput label="Trip Name" value={name} onChangeText={setName} />
          <AppTextInput label="Destination" value={destination} onChangeText={setDestination} />
          <AppButton title="Save Changes" onPress={handleSave} loading={saving} fullWidth />
        </View>
      )}

      {/* Members */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Members ({members.length})</Text>
        {members.map((m) => (
          <View key={m.id} style={styles.memberRow}>
            <FamilyAvatar name={m.profile?.full_name ?? '?'} size={36} />
            <View style={styles.memberInfo}>
              <Text style={styles.memberName}>{m.profile?.full_name ?? 'Unknown'}</Text>
              <Text style={styles.memberRole}>{m.role.replace('_', ' ')}</Text>
            </View>
            {isTripOrganizer && m.user_id !== user?.id && (
              <TouchableOpacity
                onPress={() =>
                  Alert.alert('Remove Member', `Remove ${m.profile?.full_name}?`, [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Remove',
                      style: 'destructive',
                      onPress: () => tripService.removeMember(tripId, m.user_id),
                    },
                  ])
                }
              >
                <Text style={styles.removeText}>Remove</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>

      {/* Danger Zone */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Danger Zone</Text>
        <AppButton title="Leave Trip" onPress={handleLeave} variant="outline" fullWidth />
        {isTripOrganizer && (
          <AppButton
            title="Delete Trip"
            onPress={handleDelete}
            variant="danger"
            fullWidth
            style={{ marginTop: Spacing.sm }}
          />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md },
  section: { marginBottom: Spacing.lg },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semiBold,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  codeBox: {
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  inviteCode: {
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    letterSpacing: 8,
    marginBottom: Spacing.xs,
  },
  codeHint: { fontSize: FontSize.sm, color: Colors.textSecondary },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadow.sm,
  },
  memberInfo: { flex: 1, marginLeft: Spacing.md },
  memberName: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
    color: Colors.text,
  },
  memberRole: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textTransform: 'capitalize',
  },
  removeText: { fontSize: FontSize.sm, color: Colors.danger },
});
