import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
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

  async function pickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo access to scan receipts.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!res.canceled && res.assets[0]) {
      setImageUri(res.assets[0].uri);
      setResult(null);
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
      setResult(null);
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
        Alert.alert('Scan Error', scanError);
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
    navigation.navigate('AddEditExpense', {
      tripId,
      scannedExpense: {
        title: result?.merchant ? `${result.merchant} receipt` : undefined,
        amount: result?.amount,
        date: result?.date,
        notes: imageUri ? 'Prefilled from scanned receipt. Review details before saving.' : undefined,
      },
    });
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
                <View key={i} style={styles.itemRow}>
                  <Text style={styles.itemDesc}>{item.description}</Text>
                  <Text style={styles.itemAmount}>${item.amount.toFixed(2)}</Text>
                </View>
              ))}
            </View>
          )}
          <AppButton
            title={returnToExpense ? 'Use These Details' : 'Create Expense from Scan'}
            onPress={handleCreateExpense}
            fullWidth
            style={styles.createBtn}
          />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
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
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.xs },
  itemDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, flex: 1 },
  itemAmount: { fontSize: FontSize.sm, color: Colors.text },
  createBtn: { marginTop: Spacing.md },
});
