import { router } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, label } from '../theme';
import { MailArt } from './intro';

/** How to get a ticket from an email into Stash, with a shortcut to Mail. */
export default function MailHelp() {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={12} style={styles.topBtn}>
          <Text style={styles.cancel}>Close</Text>
        </Pressable>
        <Text style={styles.heading}>From Mail</Text>
        <View style={styles.topBtn} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110 }]}>
        <Text style={label}>Three taps</Text>
        <Text style={styles.title}>Share it to Stash</Text>
        <MailArt />
        <Text style={styles.body}>
          Email has a “View tickets” button instead of a PDF? Open it, screenshot the ticket with the QR code showing, then
          tap + → Photos.
        </Text>
        <Text style={styles.body}>Works the same in Gmail and Outlook: open the attachment, then the Share button.</Text>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          accessibilityRole="button"
          onPress={() => Linking.openURL('message://').catch(() => {})}
          style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.primaryText}>Open Mail</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  topBtn: { minWidth: 64, minHeight: 44, justifyContent: 'center' },
  cancel: { ...font.bodyMedium, fontSize: 16, color: colors.ink },
  heading: { ...font.monoBold, fontSize: 13, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.ink },
  content: { padding: 20, gap: 14 },
  title: { ...font.display, fontSize: 30, color: colors.ink, marginBottom: 4 },
  body: { ...font.body, fontSize: 15, lineHeight: 22, color: colors.ink },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.ground },
  primary: { height: 56, borderRadius: 999, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  primaryText: { ...font.bodyBold, fontSize: 17, color: colors.onAccent },
});
