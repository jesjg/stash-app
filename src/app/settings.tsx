import Constants from 'expo-constants';
import { Toggle } from '../components/Toggle';
import * as Updates from 'expo-updates';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { RoundButton } from '../components/RoundButton';
import { enableScreenshotCheck, screenshotsSupported } from '../lib/screenshots';
import { reminderStatus, type ReminderStatus } from '../lib/reminders';
import { askPersistentBanners } from '../lib/persistent';
import { ensureReminders, setSettings, useStore } from '../lib/store';
import { colors, font, label } from '../theme';

export default function Settings() {
  const count = useStore((s) => s.stubs.length);
  const [reminders, setReminders] = useState<ReminderStatus | null>(null);
  useFocusEffect(
    useCallback(() => {
      reminderStatus().then(setReminders);
      const sub = AppState.addEventListener('change', (st) => st === 'active' && reminderStatus().then(setReminders));
      return () => sub.remove();
    }, []),
  );
  const lockScreen = useStore((s) => s.settings.lockScreen);
  const sparkles = useStore((s) => s.settings.sparkles);
  const shots = useStore((s) => s.settings.screenshots);
  const insets = useSafeAreaInsets();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
      <View style={styles.bar}>
        <Text style={styles.title}>Settings</Text>
        <RoundButton label="Close" onPress={() => router.back()} size={40} color={colors.paper}>
          <Icon name="close" size={18} color={colors.ink} />
        </RoundButton>
      </View>

      <View style={styles.block}>
        <Text style={label}>Appearance</Text>
        <View style={styles.row}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.rowText}>Sparkle tickets</Text>
            <Text style={styles.note}>A little sparkle on every ticket.</Text>
          </View>
          <Toggle value={!!sparkles} onValueChange={(v) => setSettings({ sparkles: v })} accessibilityLabel="Sparkle tickets" />
        </View>
      </View>

      <View style={styles.block}>
        <Text style={label}>Shortcuts</Text>
        <View style={styles.row}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.rowText}>Lock screen ticket</Text>
            <Text style={styles.note}>On the day, pin the ticket to your lock screen.</Text>
          </View>
          <Toggle
            value={lockScreen}
            onValueChange={(v) => setSettings({ lockScreen: v })}
            accessibilityLabel="Lock screen ticket"
          />
        </View>
        {screenshotsSupported && (
          <View style={styles.row}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.rowText}>Spot tickets in screenshots</Text>
              <Text style={styles.note}>Checked on this phone when you open Stash.</Text>
            </View>
            <Toggle
              value={shots === 'on'}
              onValueChange={(v) => {
                if (v) enableScreenshotCheck();
                else setSettings({ screenshots: 'off' });
              }}
              accessibilityLabel="Spot tickets in screenshots"
            />
          </View>
        )}
      </View>

      <View style={styles.block}>
        <Text style={label}>Reminders</Text>
        <Text style={styles.body}>
          8am on the day, or 2 hours before if the ticket has a time. Tap the notification to jump straight to the code.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={async () => {
            if (reminders === 'ask') {
              await ensureReminders(true);
              setReminders(await reminderStatus());
            } else {
              Linking.openSettings();
            }
          }}
          style={styles.row}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.rowText}>
              {reminders === 'on' ? 'Reminders are on' : reminders === 'ask' ? 'Turn on reminders' : 'Reminders are off'}
            </Text>
            <Text style={styles.note}>
              {reminders === 'off' ? 'Tap to allow notifications in iPhone Settings.' : reminders === 'on' ? 'You’ll get them 2 hours before, or at 8am' : 'Stash needs permission to remind you.'}
            </Text>
          </View>
          <Icon name="arrow" size={16} color={colors.ink} />
        </Pressable>
        {reminders === 'on' && (
          <Pressable accessibilityRole="button" onPress={askPersistentBanners} style={styles.row}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.rowText}>Keep reminders on screen</Text>
              <Text style={styles.note}>Banner Style: Persistent · Show Previews: Always</Text>
            </View>
            <Icon name="arrow" size={16} color={colors.ink} />
          </Pressable>
        )}
      </View>

      <View style={styles.block}>
        <Text style={label}>Help</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push('/intro')} style={styles.row}>
          <Text style={styles.rowText}>How Stash works</Text>
          <Icon name="arrow" size={16} color={colors.ink} />
        </Pressable>
      </View>

      <View style={styles.block}>
        <Text style={label}>Privacy</Text>
        <Text style={styles.body}>
          Your tickets never leave this phone unless you send them. No account, no server. Codes are read on-device.
        </Text>
        <Pressable accessibilityRole="link" onPress={() => Linking.openURL('https://jesjg.github.io/stash-app/privacy/')} style={styles.row}>
          <Text style={styles.rowText}>Privacy policy</Text>
          <Icon name="arrow" size={16} color={colors.ink} />
        </Pressable>
        <Pressable accessibilityRole="link" onPress={() => Linking.openURL('https://jesjg.github.io/stash-app/support/')} style={styles.row}>
          <Text style={styles.rowText}>Help and support</Text>
          <Icon name="arrow" size={16} color={colors.ink} />
        </Pressable>
      </View>

      <Text style={styles.footer}>
        Stash {Constants.expoConfig?.version ?? ''} · {count} ticket{count === 1 ? '' : 's'} stored
      </Text>
      <Text style={styles.footer}>
        {Updates.isEnabled && Updates.updateId && !Updates.isEmbeddedLaunch
          ? `Update ${Updates.updateId.slice(0, 8)} · ${Updates.createdAt ? Updates.createdAt.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}`
          : 'Built-in version (no updates applied yet)'}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  content: { padding: 20, gap: 28 },
  bar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { ...font.display, fontSize: 30, color: colors.ink },
  block: { gap: 12 },
  note: { ...font.mono, fontSize: 12, color: colors.inkSoft },
  body: { ...font.body, fontSize: 16, lineHeight: 23, color: colors.ink },
  row: {
    minHeight: 52,
    backgroundColor: colors.paper,
    borderRadius: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowText: { ...font.bodyBold, fontSize: 16, color: colors.ink },
  footer: { ...font.mono, fontSize: 12, color: colors.inkSoft, textAlign: 'center' },
});
