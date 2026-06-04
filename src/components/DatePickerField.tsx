import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Modal, TextInput } from 'react-native';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../constants/theme';

// Lazy-load the native picker so a missing native module doesn't crash the app
let DateTimePicker: any = null;
try {
  DateTimePicker = require('@react-native-community/datetimepicker').default;
} catch {
  // Native module not linked yet — fall back to text input
}

interface Props {
  label: string;
  value: string;           // YYYY-MM-DD
  onChange: (date: string) => void;
  required?: boolean;
  minimumDate?: Date;
  maximumDate?: Date;
}

export function DatePickerField({ label, value, onChange, required, minimumDate, maximumDate }: Props) {
  const [show, setShow] = useState(false);

  const date = value ? new Date(value + 'T12:00:00') : new Date();

  const display = value
    ? new Date(value + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
      })
    : 'Select date';

  function handleChange(_: any, selected?: Date) {
    if (Platform.OS === 'android') setShow(false);
    if (selected) {
      const y = selected.getFullYear();
      const m = String(selected.getMonth() + 1).padStart(2, '0');
      const d = String(selected.getDate()).padStart(2, '0');
      onChange(`${y}-${m}-${d}`);
    }
  }

  // Fallback: simple text input when native module isn't linked
  if (!DateTimePicker) {
    return (
      <View style={styles.wrapper}>
        <Text style={styles.label}>
          {label}{required ? <Text style={styles.requiredStar}> *</Text> : null}
        </Text>
        <TextInput
          style={styles.textFallback}
          value={value}
          onChangeText={onChange}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={Colors.textSecondary}
          keyboardType="numbers-and-punctuation"
        />
        <Text style={styles.fallbackHint}>Rebuild the app to enable the calendar picker</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>
        {label}{required ? <Text style={styles.requiredStar}> *</Text> : null}
      </Text>
      <TouchableOpacity
        style={[styles.btn, !value && required && styles.btnRequired]}
        onPress={() => setShow(true)}
        activeOpacity={0.7}
      >
        <Text style={[styles.btnText, !value && styles.placeholder]}>📅  {display}</Text>
      </TouchableOpacity>

      {Platform.OS === 'ios' ? (
        <Modal visible={show} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{label}{required ? <Text style={styles.requiredStar}> *</Text> : null}</Text>
                <TouchableOpacity onPress={() => setShow(false)}>
                  <Text style={styles.doneBtn}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={date}
                mode="date"
                display="inline"
                onChange={handleChange}
                minimumDate={minimumDate}
                maximumDate={maximumDate}
                style={styles.picker}
              />
            </View>
          </View>
        </Modal>
      ) : (
        show && (
          <DateTimePicker
            value={date}
            mode="date"
            display="default"
            onChange={handleChange}
            minimumDate={minimumDate}
            maximumDate={maximumDate}
          />
        )
      )}
    </View>
  );
}

interface TimeProps {
  label: string;
  value: string;       // HH:MM
  onChange: (time: string) => void;
}

export function TimePickerField({ label, value, onChange }: TimeProps) {
  const [show, setShow] = useState(false);

  const timeDate = (() => {
    const d = new Date();
    if (value) {
      const [h, m] = value.split(':').map(Number);
      d.setHours(h, m, 0, 0);
    } else {
      d.setHours(10, 0, 0, 0);
    }
    return d;
  })();

  const display = value
    ? new Date(0, 0, 0, ...value.split(':').map(Number)).toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit',
      })
    : 'Optional time';

  function handleChange(_: any, selected?: Date) {
    if (Platform.OS === 'android') setShow(false);
    if (selected) {
      const h = String(selected.getHours()).padStart(2, '0');
      const m = String(selected.getMinutes()).padStart(2, '0');
      onChange(`${h}:${m}`);
    }
  }

  // Fallback
  if (!DateTimePicker) {
    return (
      <View style={styles.wrapper}>
        <Text style={styles.label}>{label} <Text style={styles.optional}>(optional)</Text></Text>
        <TextInput
          style={styles.textFallback}
          value={value}
          onChangeText={onChange}
          placeholder="HH:MM (optional)"
          placeholderTextColor={Colors.textSecondary}
          keyboardType="numbers-and-punctuation"
        />
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label} <Text style={styles.optional}>(optional)</Text></Text>
      <View style={styles.timeRow}>
        <TouchableOpacity style={[styles.btn, styles.timeBtnFlex]} onPress={() => setShow(true)} activeOpacity={0.7}>
          <Text style={[styles.btnText, !value && styles.placeholder]}>🕐  {display}</Text>
        </TouchableOpacity>
        {value ? (
          <TouchableOpacity style={styles.clearBtn} onPress={() => onChange('')}>
            <Text style={styles.clearBtnText}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {Platform.OS === 'ios' ? (
        <Modal visible={show} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{label}</Text>
                <TouchableOpacity onPress={() => setShow(false)}>
                  <Text style={styles.doneBtn}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={timeDate}
                mode="time"
                display="spinner"
                onChange={handleChange}
                style={styles.picker}
              />
            </View>
          </View>
        </Modal>
      ) : (
        show && (
          <DateTimePicker
            value={timeDate}
            mode="time"
            display="default"
            onChange={handleChange}
          />
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: Spacing.md },
  label: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.text, marginBottom: Spacing.sm },
  optional: { fontWeight: '400', color: Colors.textSecondary },
  requiredStar: { color: Colors.danger, fontWeight: FontWeight.bold },
  btn: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
  },
  btnRequired: { borderColor: Colors.danger + '80' },
  btnText: { fontSize: FontSize.md, color: Colors.text },
  placeholder: { color: Colors.textSecondary },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  timeBtnFlex: { flex: 1 },
  clearBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  clearBtnText: { fontSize: 13, color: Colors.textSecondary, fontWeight: FontWeight.semiBold },
  textFallback: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    fontSize: FontSize.md, color: Colors.text, backgroundColor: Colors.surface,
  },
  fallbackHint: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingBottom: Spacing.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semiBold, color: Colors.text },
  doneBtn: { fontSize: FontSize.md, color: Colors.primary, fontWeight: FontWeight.semiBold },
  picker: { alignSelf: 'stretch' },
});
