import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MainStackParamList } from '../../types';
import { useTripContext } from '../../contexts/TripContext';
import { useAuth } from '../../contexts/AuthContext';
import { familyService } from '../../services/familyService';
import { FamilyAvatar } from '../../components/FamilyAvatar';
import { EmptyState } from '../../components/EmptyState';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../constants/theme';

type Nav = NativeStackNavigationProp<MainStackParamList>;

export function FamiliesScreen({ route }: { route: { params: { tripId: string } } }) {
  const navigation = useNavigation<Nav>();
  const { tripId } = route.params;
  const { families, setFamilies } = useTripContext();
  const { isDemoMode } = useAuth();
  const [refreshing, setRefreshing] = React.useState(false);

  const loadFamilies = useCallback(async () => {
    if (isDemoMode) { setRefreshing(false); return; }
    const { data } = await familyService.getFamilies(tripId);
    setFamilies(data ?? []);
    setRefreshing(false);
  }, [tripId, isDemoMode]);

  useFocusEffect(useCallback(() => { loadFamilies(); }, [loadFamilies]));

  return (
    <View style={styles.container}>
      <FlatList
        data={families}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadFamilies(); }} tintColor={Colors.primary} />
        }
        ListHeaderComponent={
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => navigation.navigate('AddEditFamily', { tripId })}
          >
            <Text style={styles.addBtnText}>+ Add Family</Text>
          </TouchableOpacity>
        }
        ListEmptyComponent={
          <EmptyState
            icon="👨‍👩‍👧‍👦"
            title="No families yet"
            subtitle="Add your family to start tracking expenses."
            actionLabel="Add Family"
            onAction={() => navigation.navigate('AddEditFamily', { tripId })}
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('FamilyDetail', { tripId, familyId: item.id })}
          >
            <FamilyAvatar name={item.name} color={item.color} size={48} />
            <View style={styles.info}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.members}>
                {item.adults_count} adult{item.adults_count !== 1 ? 's' : ''}
                {item.children_count > 0 ? `, ${item.children_count} kid${item.children_count !== 1 ? 's' : ''}` : ''}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  list: { padding: Spacing.md, flexGrow: 1 },
  addBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  addBtnText: { color: Colors.surface, fontWeight: FontWeight.semiBold, fontSize: FontSize.md },
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
  name: { fontSize: FontSize.lg, fontWeight: FontWeight.semiBold, color: Colors.text },
  members: { fontSize: FontSize.sm, color: Colors.textSecondary },
  chevron: { fontSize: 20, color: Colors.textSecondary },
});
