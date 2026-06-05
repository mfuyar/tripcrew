import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Image,
  TouchableOpacity,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainStackParamList } from '../../types';
import { receiptService } from '../../services/receiptService';
import { useAuth } from '../../contexts/AuthContext';
import { AppButton } from '../../components/AppButton';
import { AppTextInput } from '../../components/AppTextInput';
import { FormKeyboardView } from '../../components/FormKeyboardView';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../constants/theme';

type Props = NativeStackScreenProps<MainStackParamList, 'ReceiptScanner'>;

export function ReceiptScannerScreen({ navigation, route }: Props) {
  const { tripId, returnToExpense } = route.params;
  const { user } = useAuth();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<{
    amount?: number; merchant?: string; date?: string;
    items?: Array<{ description: string; amount: number }>;
  } | null>(null);
  const [splitScope, setSplitScope] = useState<'group' | 'personal'>('group');
  const [personalItemIndexes, setPersonalItemIndexes] = useState<number[]>([]);
  const [personalAmount, setPersonalAmount] = useState('');
  const [personalNote, setPersonalNote] = useState('');

  const personalItemTotal = result?.items?.reduce(
    (sum, item, index) => personalItemIndexes.includes(index) ? sum + item.amount : sum,
    0
  ) ?? 0;
  const typedPersonalAmount = Number.parseFloat(personalAmount);
  const personalTotal =
    splitScope === 'personal'
      ? personalItemTotal + (Number.isFinite(typedPersonalAmount) ? typedPersonalAmount : 0)
      : 0;
  const groupAmount =
    result?.amount !== undefined
      ? Math.max(0, Math.round((result.amount - personalTotal) * 100) / 100)
      : undefined;

  function resetScanReview() {
    setResult(null);
    setSplitScope('group');
    setPersonalItemIndexes([]);
    setPersonalAmount('');
    setPersonalNote('');
  }

  async function pickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo access to scan receipts.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!res.canceled && res.assets[0]) {
      setImageUri(res.assets[0].uri);
      resetScanReview();
    }
  }

  async function takePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow camera access to scan receipts.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!res.canceled && res.assets[0]) {
      setImageUri(res.assets[0].uri);
      resetScanReview();
    }
  }

  async function handleScan() {
    if (!imageUri || !user) return;
    setScanning(true);
    const { data: receipt, error } = await receiptService.uploadReceipt(tripId, user.id, imageUri);
    if (error) {
      Alert.alert('Upload Error', error);
      setScanning(false);
      return;
    }
    if (receipt) {
      const { data: scanned, error: scanError } = await receiptService.scanReceipt(receipt.id, receipt.image_url);
      if (scanError) {
        Alert.alert('Receipt not scanned', scanError);
      } else if (scanned) {
        setResult({
          amount: scanned.parsed_amount,
          merchant: scanned.parsed_merchant,
          date: scanned.parsed_date,
          items: scanned.parsed_items,
        });
      }
    }
    setScanning(false);
  }

  function handleCreateExpense() {
    if (!result) return;
    if (splitScope === 'personal' && personalTotal <= 0) {
      Alert.alert('Personal Items', 'Select personal line items or enter a personal amount.');
      return;
    }
    if (result.amount !== undefined && personalTotal >= result.amount) {
      Alert.alert('Personal Items', 'Personal items cannot be the full receipt total.');
      return;
    }

    const personalItems = result.items?.filter((_, index) => personalItemIndexes.includes(index)) ?? [];
    const noteLines = ['Prefilled from scanned receipt. Review details before saving.'];
    if (splitScope === 'personal') {
      noteLines.push(`Group amount after personal items: $${(groupAmount ?? 0).toFixed(2)}`);
      if (personalItems.length > 0) {
        noteLines.push(
          `Personal items: ${personalItems
            .map((item) => `${item.description} $${item.amount.toFixed(2)}`)
            .join(', ')}`
        );
      }
      if (Number.isFinite(typedPersonalAmount) && typedPersonalAmount > 0) {
        noteLines.push(`Additional personal amount: $${typedPersonalAmount.toFixed(2)}`);
      }
      if (personalNote.trim()) noteLines.push(`Personal note: ${personalNote.trim()}`);
    }

    navigation.navigate('AddEditExpense', {
      tripId,
      scannedExpense: {
        title: result?.merchant ? `${result.merchant} receipt` : undefined,
        amount: splitScope === 'personal' ? groupAmount : result?.amount,
        date: result?.date,
        notes: noteLines.join('\n'),
        receiptImageUri: imageUri ?? undefined,
      },
    });
  }

  return (
    <FormKeyboardView contentContainerStyle={styles.content}>
      {/* Image picker area */}
      <TouchableOpacity style={styles.imageArea} onPress={pickImage}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="contain" />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderIcon}>📄</Text>
            <Text style={styles.placeholderText}>Tap to choose a receipt photo</Text>
          </View>
        )}
      </TouchableOpacity>

      <View style={styles.btnRow}>
        <AppButton title="📷 Camera" onPress={takePhoto} variant="outline" style={styles.halfBtn} />
        <AppButton title="🖼️ Gallery" onPress={pickImage} variant="outline" style={styles.halfBtn} />
      </View>

      {imageUri && !result && (
        <AppButton
          title="Scan Receipt"
          onPress={handleScan}
          loading={scanning}
          fullWidth
          style={styles.scanBtn}
        />
      )}

      {/* Scan Result */}
      {result && (
        <View style={styles.resultCard}>
          <Text style={styles.resultTitle}>Scan Result</Text>
          {result.merchant && (
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Merchant</Text>
              <Text style={styles.resultValue}>{result.merchant}</Text>
            </View>
          )}
          {result.date && (
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Date</Text>
              <Text style={styles.resultValue}>{result.date}</Text>
            </View>
          )}
          {result.amount !== undefined && (
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Total</Text>
              <Text style={[styles.resultValue, styles.amount]}>${result.amount.toFixed(2)}</Text>
            </View>
          )}
          {result.items && result.items.length > 0 && (
            <View style={styles.itemsList}>
              <Text style={styles.itemsTitle}>Items</Text>
              {result.items.map((item, i) => (
                <TouchableOpacity
                  key={i}
                  style={[
                    styles.itemRow,
                    splitScope === 'personal' && personalItemIndexes.includes(i) && styles.itemRowSelected,
                  ]}
                  disabled={splitScope !== 'personal'}
                  onPress={() =>
                    setPersonalItemIndexes((prev) =>
                      prev.includes(i) ? prev.filter((index) => index !== i) : [...prev, i]
                    )
                  }
                  activeOpacity={0.75}
                >
                  <Text style={styles.itemDesc}>{item.description}</Text>
                  <Text style={styles.itemAmount}>${item.amount.toFixed(2)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={styles.scopePanel}>
            <Text style={styles.itemsTitle}>Who should pay?</Text>
            <View style={styles.scopeButtons}>
              <TouchableOpacity
                style={[styles.scopeButton, splitScope === 'group' && styles.scopeButtonActive]}
                onPress={() => setSplitScope('group')}
                activeOpacity={0.8}
              >
                <Text style={[styles.scopeButtonText, splitScope === 'group' && styles.scopeButtonTextActive]}>
                  All group
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.scopeButton, splitScope === 'personal' && styles.scopeButtonActive]}
                onPress={() => setSplitScope('personal')}
                activeOpacity={0.8}
              >
                <Text style={[styles.scopeButtonText, splitScope === 'personal' && styles.scopeButtonTextActive]}>
                  Some personal
                </Text>
              </TouchableOpacity>
            </View>

            {splitScope === 'personal' && (
              <View style={styles.personalBox}>
                {result.items && result.items.length > 0 ? (
                  <Text style={styles.personalHint}>Tap personal line items above.</Text>
                ) : null}
                <AppTextInput
                  label="Other personal amount"
                  value={personalAmount}
                  onChangeText={setPersonalAmount}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                />
                <AppTextInput
                  label="Who / note"
                  value={personalNote}
                  onChangeText={setPersonalNote}
                  placeholder="e.g. Ahmed snacks, Sarah medicine"
                />
                <View style={styles.resultRow}>
                  <Text style={styles.resultLabel}>Personal</Text>
                  <Text style={styles.resultValue}>${personalTotal.toFixed(2)}</Text>
                </View>
                <View style={styles.resultRow}>
                  <Text style={styles.resultLabel}>Group expense</Text>
                  <Text style={[styles.resultValue, styles.amount]}>${(groupAmount ?? 0).toFixed(2)}</Text>
                </View>
              </View>
            )}
          </View>
          <AppButton
            title={returnToExpense ? 'Use These Details' : 'Create Expense from Scan'}
            onPress={handleCreateExpense}
            fullWidth
            style={styles.createBtn}
          />
        </View>
      )}
    </FormKeyboardView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.md },
  imageArea: {
    height: 240,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderIcon: { fontSize: 48, marginBottom: Spacing.sm },
  placeholderText: { fontSize: FontSize.md, color: Colors.textSecondary },
  previewImage: { flex: 1, width: '100%' },
  btnRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  halfBtn: { flex: 1 },
  scanBtn: { marginBottom: Spacing.md },
  resultCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    ...Shadow.md,
  },
  resultTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  resultLabel: { fontSize: FontSize.sm, color: Colors.textSecondary },
  resultValue: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.text },
  amount: { fontSize: FontSize.lg, color: Colors.primary, fontWeight: FontWeight.bold },
  itemsList: { marginTop: Spacing.md },
  itemsTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold, color: Colors.text, marginBottom: Spacing.sm },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.sm,
  },
  itemRowSelected: {
    backgroundColor: Colors.warning + '20',
  },
  itemDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, flex: 1 },
  itemAmount: { fontSize: FontSize.sm, color: Colors.text },
  scopePanel: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
  },
  scopeButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  scopeButton: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
  },
  scopeButtonActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  scopeButtonText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  scopeButtonTextActive: {
    color: Colors.primary,
    fontWeight: FontWeight.semiBold,
  },
  personalBox: {
    marginTop: Spacing.md,
  },
  personalHint: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  createBtn: { marginTop: Spacing.md },
});
