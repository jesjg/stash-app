import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { importText } from '../lib/importer';
import { colors, font, label } from '../theme';

/** Paste a host's message or check-in instructions; Stash reads it into a stay. */
export default function Paste() {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');

  const read = () => {
    try {
      importText(text);
      router.replace('/add');
    } catch (e) {
      Alert.alert("Couldn't read that", e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={12} style={styles.topBtn}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
        <Text style={styles.heading}>Check-in details</Text>
        <View style={styles.topBtn} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={label}>Paste below</Text>
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          autoFocus
          placeholder="Paste the host's message, the check-in instructions or the booking email…"
          placeholderTextColor="#A8A8A0"
          style={styles.input}
          textAlignVertical="top"
          accessibilityLabel="Check-in details"
        />
        <Text style={styles.tip}>
          In Airbnb: Messages → press and hold the host’s message → Copy. For the check-in screens, screenshot them and add
          them with + → Photos instead.
        </Text>
        <Text style={styles.tip}>Stash picks out the address, times, door code, Wi-Fi and the host’s number. It stays on this phone.</Text>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          accessibilityRole="button"
          disabled={!text.trim()}
          onPress={read}
          style={({ pressed }) => [styles.save, !text.trim() && { opacity: 0.4 }, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.saveText}>Read it</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  topBtn: { minWidth: 64, minHeight: 44, justifyContent: 'center' },
  cancel: { ...font.bodyMedium, fontSize: 16, color: colors.ink },
  heading: { ...font.monoBold, fontSize: 13, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.ink },
  content: { padding: 20, gap: 12, paddingBottom: 120 },
  input: {
    minHeight: 220,
    backgroundColor: colors.paper,
    borderRadius: 14,
    padding: 16,
    ...font.body,
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
  },
  tip: { ...font.mono, fontSize: 12, lineHeight: 18, color: colors.inkSoft },
  footer: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.ground },
  save: { height: 56, borderRadius: 999, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  saveText: { ...font.bodyBold, fontSize: 17, color: colors.onAccent },
});
