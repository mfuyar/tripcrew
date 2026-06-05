import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, ActivityIndicator,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainStackParamList, ExpenseVersion } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useTripContext } from '../../contexts/TripContext';
import { expenseService } from '../../services/expenseService';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../constants/theme';

type Props = NativeStackScreenProps<MainStackParamList, 'ExpenseHistory'>;

const CHANGE_ICON: Record<string, string> = {
  create:  '✅',
  update:  '✏️',
  delete:  '🗑',
  restore: '↩️',
};

const CHANGE_COLOR: Record<string, string> = {
  create:  Colors.success,
  update:  Colors.primary,
  delete:  Colors.danger,
  restore: Colors.warning,
};

export function ExpenseHistoryScreen({ navigation, route }: Props) {
  const { expenseId, tripId } = route.params;
  const { user, profile } = useAuth();
  const { canManageTrip, currentTrip } = useTripContext();
  const [versions, setVersions] = useState<ExpenseVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);

  useEffect(() => {
    expenseService.getVersions(expenseId).then(({ data }) => {
      setVersions(data ?? []);
      setLoading(false);
    });
  }, [expenseId]);

  const currency = currentTrip?.currency ?? '$';
  // Current version is the highest version_number
  const currentVersionNum = versions.length > 0 ? versions[0].version_number : 1;

  async function handleRestore(version: ExpenseVersion) {
    if (!user) return;
    const editorName = profile?.full_name ?? user.email ?? 'Unknown';
    Alert.alert(
      `Restore v${version.version_number}`,
      `Restore this expense to the state from ${new Date(version.created_at).toLocaleString()}?\n\n"${version.snapshot.title}" — ${currency}${version.snapshot.amount}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: async () => {
            setRestoring(version.id);
            const { data, error } = await expenseService.restoreVersion(version, user.id, editorName);
            setRestoring(null);
            if (error) { Alert.alert('Error', error); return; }
            Alert.alert('Restored', `Expense restored to v${version.version_number}.`);
            // Reload versions
            const { data: fresh } = await expenseService.getVersions(expenseId);
            setVersions(fresh ?? []);
            navigation.goBack();
          },
        },
      ]
    );
  }

  async function handlePurgeAll() {
    Alert.alert(
      'Permanently Delete',
      'This will permanently delete the expense and ALL its version history. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            setPurging(true);
            await expenseService.deleteExpense(expenseId);
            setPurging(false);
            navigation.goBack();
          },
        },
      ]
    );
  }

  if (loading) return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color={Colors.primary} />
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={versions}
        keyExtractor={v => v.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Version History</Text>
            <Text style={styles.headerSub}>{versions.length} version{versions.length !== 1 ? 's' : ''} · current is v{currentVersionNum}</Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.empty}>No version history found.</Text>
        }
        renderItem={({ item }) => {
          const isCurrent = item.version_number === currentVersionNum;
          const color = CHANGE_COLOR[item.change_type] ?? Colors.textSecondary;
          return (
            <View style={[styles.card, isCurrent && styles.cardCurrent]}>
              <View style={styles.cardHeader}>
                <Text style={[styles.versionBadge, { color }]}>
                  {CHANGE_ICON[item.change_type]} v{item.version_number}
                </Text>
                {isCurrent && <View style={styles.currentBadge}><Text style={styles.currentBadgeText}>Current</Text></View>}
                <Text style={styles.cardDate}>
                  {new Date(item.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>

              {/* Snapshot summary */}
              <Text style={styles.snapTitle}>{item.snapshot.title}</Text>
              <Text style={styles.snapAmount}>{currency}{item.snapshot.amount?.toFixed(2)} · {item.snapshot.category} · {item.snapshot.date}</Text>
              {item.snapshot.notes ? <Text style={styles.snapNotes}>{item.snapshot.notes}</Text> : null}

              {/* Change summary */}
              {item.change_summary ? (
                <Text style={[styles.changeSummary, { color }]}>{item.change_summary}</Text>
              ) : null}

              {/* Changed by */}
              <Text style={styles.changedBy}>
                {item.changed_by_name ? `by ${item.changed_by_name}` : ''}
              </Text>

              {/* Restore button — admins only, not current version */}
              {canManageTrip && !isCurrent && (
                <TouchableOpacity
                  style={[styles.restoreBtn, restoring === item.id && styles.restoreBtnDisabled]}
                  onPress={() => handleRestore(item)}
                  disabled={restoring === item.id}
                >
                  <Text style={styles.restoreBtnText}>
                    {restoring === item.id ? 'Restoring...' : '↩️ Restore this version'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
        ListFooterComponent={
          canManageTrip ? (
            <TouchableOpacity
              style={[styles.purgeBtn, purging && styles.purgeBtnDisabled]}
              onPress={handlePurgeAll}
              disabled={purging}
            >
              <Text style={styles.purgeBtnText}>
                {purging ? 'Deleting...' : '🗑 Permanently Delete Expense & All History'}
              </Text>
            </TouchableOpacity>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: Spacing.md },
  header: { marginBottom: Spacing.md },
  headerTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.text },
  headerSub: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  empty: { textAlign: 'center', color: Colors.textSecondary, padding: Spacing.xl },
  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.md, marginBottom: Spacing.sm, ...Shadow.sm,
    borderLeftWidth: 3, borderLeftColor: Colors.border,
  },
  cardCurrent: { borderLeftColor: Colors.primary },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.xs, gap: Spacing.sm },
  versionBadge: { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  currentBadge: { backgroundColor: Colors.primary + '20', borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  currentBadgeText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semiBold },
  cardDate: { fontSize: FontSize.xs, color: Colors.textSecondary, marginLeft: 'auto' },
  snapTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semiBold, color: Colors.text },
  snapAmount: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  snapNotes: { fontSize: FontSize.xs, color: Colors.textSecondary, fontStyle: 'italic', marginTop: 2 },
  changeSummary: { fontSize: FontSize.xs, fontWeight: FontWeight.medium, marginTop: Spacing.xs },
  changedBy: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  restoreBtn: {
    marginTop: Spacing.sm, borderWidth: 1, borderColor: Colors.primary,
    borderRadius: Radius.md, padding: Spacing.sm, alignItems: 'center',
  },
  restoreBtnDisabled: { opacity: 0.5 },
  restoreBtnText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.semiBold },
  purgeBtn: {
    marginTop: Spacing.lg, borderWidth: 1, borderColor: Colors.danger,
    borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center',
  },
  purgeBtnDisabled: { opacity: 0.5 },
  purgeBtnText: { fontSize: FontSize.sm, color: Colors.danger, fontWeight: FontWeight.semiBold },
});
