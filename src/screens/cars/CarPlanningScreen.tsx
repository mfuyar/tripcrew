import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MainStackParamList, Car } from '../../types';
import { carService } from '../../services/carService';
import { FamilyAvatar } from '../../components/FamilyAvatar';
import { LoadingView } from '../../components/LoadingView';
import { EmptyState } from '../../components/EmptyState';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../constants/theme';

type Nav = NativeStackNavigationProp<MainStackParamList>;

export function CarPlanningScreen({ route }: { route: { params: { tripId: string } } }) {
  const navigation = useNavigation<Nav>();
  const { tripId } = route.params;
  const [cars, setCars] = useState<Car[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data } = await carService.getCars(tripId);
    setCars(data ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [tripId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <LoadingView />;

  return (
    <FlatList
      data={cars}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />
      }
      ListHeaderComponent={
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => navigation.navigate('AddEditCar', { tripId })}
        >
          <Text style={styles.addBtnText}>+ Add Car</Text>
        </TouchableOpacity>
      }
      ListEmptyComponent={
        <EmptyState icon="🚗" title="No cars yet" subtitle="Coordinate who rides in which car." actionLabel="Add Car" onAction={() => navigation.navigate('AddEditCar', { tripId })} />
      }
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.carCard}
          onPress={() => navigation.navigate('AddEditCar', { tripId, carId: item.id })}
        >
          <View style={styles.carHeader}>
            <Text style={styles.carIcon}>🚗</Text>
            <View style={styles.carInfo}>
              <Text style={styles.carName}>{item.name}</Text>
              <Text style={styles.carDriver}>Driver: {item.driver_family?.name ?? 'Unknown'}</Text>
            </View>
            <Text style={styles.seats}>
              {item.passengers?.length ?? 0}/{item.total_seats} seats
            </Text>
          </View>
          {item.passengers && item.passengers.length > 0 && (
            <View style={styles.passengers}>
              {item.passengers.map((p) => (
                <View key={p.id} style={styles.passenger}>
                  <FamilyAvatar name={p.passenger_name} color={p.family?.color} size={28} />
                  <Text style={styles.passengerName} numberOfLines={1}>{p.passenger_name}</Text>
                </View>
              ))}
            </View>
          )}
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.md, flexGrow: 1, backgroundColor: Colors.background },
  addBtn: { backgroundColor: Colors.primary, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', marginBottom: Spacing.md },
  addBtnText: { color: Colors.surface, fontWeight: FontWeight.semiBold, fontSize: FontSize.md },
  carCard: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.md, ...Shadow.sm },
  carHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  carIcon: { fontSize: 28, marginRight: Spacing.md },
  carInfo: { flex: 1 },
  carName: { fontSize: FontSize.lg, fontWeight: FontWeight.semiBold, color: Colors.text },
  carDriver: { fontSize: FontSize.sm, color: Colors.textSecondary },
  seats: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold, color: Colors.primary },
  passengers: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.sm },
  passenger: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, backgroundColor: Colors.primaryLight, borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 4 },
  passengerName: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.medium, maxWidth: 80 },
});
