import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { addressSearchService, AddressSuggestion } from '../services/addressSearchService';
import { Colors, FontSize, FontWeight, Radius, Shadow, Spacing } from '../constants/theme';

interface Props {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  onSelect?: (suggestion: AddressSuggestion) => void;
  placeholder?: string;
  required?: boolean;
}

export function AddressAutocomplete({ label, value, onChangeText, onSelect, placeholder, required }: Props) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const selectedValueRef = useRef('');

  useEffect(() => {
    const query = value.trim();
    if (!focused || query.length < 3 || selectedValueRef.current === value) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timeout = setTimeout(async () => {
      const { data } = await addressSearchService.search(query);
      if (!cancelled) {
        setSuggestions(data ?? []);
        setLoading(false);
      }
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [focused, value]);

  function handleSelect(suggestion: AddressSuggestion) {
    selectedValueRef.current = suggestion.label;
    onChangeText(suggestion.label);
    setSuggestions([]);
    setFocused(false);
    onSelect?.(suggestion);
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}{required ? <Text style={styles.requiredStar}> *</Text> : null}</Text>
      <View style={[styles.inputWrap, focused && styles.inputWrapFocused]}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={(next) => {
            selectedValueRef.current = '';
            onChangeText(next);
          }}
          placeholder={placeholder}
          placeholderTextColor={Colors.textSecondary}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 180)}
          autoCorrect={false}
        />
        {loading ? <ActivityIndicator size="small" color={Colors.primary} /> : null}
      </View>
      {focused && suggestions.length > 0 ? (
        <View style={styles.suggestionBox}>
          {suggestions.map((suggestion) => (
            <TouchableOpacity
              key={suggestion.id}
              style={styles.suggestionRow}
              onPress={() => handleSelect(suggestion)}
            >
              <Text style={styles.suggestionIcon}>📍</Text>
              <Text style={styles.suggestionText} numberOfLines={2}>{suggestion.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: Spacing.md },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  requiredStar: { color: Colors.danger, fontWeight: FontWeight.bold },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingRight: Spacing.md,
    backgroundColor: Colors.surface,
  },
  inputWrapFocused: { borderColor: Colors.primary },
  input: {
    flex: 1,
    padding: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.text,
  },
  suggestionBox: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    marginTop: Spacing.xs,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  suggestionIcon: { fontSize: 16 },
  suggestionText: { flex: 1, fontSize: FontSize.sm, color: Colors.text },
});
