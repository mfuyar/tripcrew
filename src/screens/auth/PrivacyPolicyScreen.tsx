import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LEGAL_LAST_UPDATED, PRIVACY_POLICY_SECTIONS } from '../../constants/legal';
import { Colors, FontSize, FontWeight, Spacing } from '../../constants/theme';

export function PrivacyPolicyScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Privacy Policy and Disclosure</Text>
      <Text style={styles.updated}>Last updated: {LEGAL_LAST_UPDATED}</Text>
      <Text style={styles.intro}>
        Please read this carefully before using Travel Crew. By creating an account,
        signing in, or entering demo mode, you agree to this privacy policy and disclosure.
      </Text>

      {PRIVACY_POLICY_SECTIONS.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          {section.body.map((paragraph) => (
            <View key={paragraph} style={styles.bulletRow}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.paragraph}>{paragraph}</Text>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xl },
  title: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  updated: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.md },
  intro: {
    fontSize: FontSize.md,
    color: Colors.text,
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  section: { marginBottom: Spacing.lg },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  bulletRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  bullet: { fontSize: FontSize.md, color: Colors.primary, lineHeight: 21 },
  paragraph: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 21 },
});
