import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { Toggle } from '../components/Toggle';
import * as Updates from 'expo-updates';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { RoundButton } from '../components/RoundButton';
import { Swatches } from '../components/Swatches';
import { showToast } from '../components/Toast';
import { enableScreenshotCheck, screenshotsSupported } from '../lib/screenshots';
import { reminderStatus, type ReminderStatus } from '../lib/reminders';
import { askPersistentBanners } from '../lib/persistent';
import { pickCoverPhoto } from '../lib/pickers';
import { ensureReminders, setSettings, setThemePhoto, useStore } from '../lib/store';
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
  const accent = useStore((s) => s.settings.accent);
  const holoAll = useStore((s) => s.settings.holoAll);
  const themePhoto = useStore((s) => s.settings.themePhoto);
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
        <Text style={styles.rowText}>App colour</Text>
        <Swatches
          value={accent}
          onChange={(id) => {
            if (id === (accent ?? 'orange')) return;
            setSettings({ accent: id });
            // Colours are set as the app starts, so restart it to repaint everything.
            Updates.reloadAsync().catch(() => showToast('Close and reopen Stash to see the new colour.'));
          }}
        />
        <Text style={styles.note}>Buttons and ticket screens. Stash restarts to apply it.</Text>
        <View style={styles.row}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.rowText}>Holographic tickets</Text>
            <Text style={styles.note}>A foil shimmer on every ticket.</Text>
          </View>
          <Toggle value={!!holoAll} onValueChange={(v) => setSettings({ holoAll: v })} accessibilityLabel="Holographic tickets" />
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={async () => {
            try {
              const uri = await pickCoverPhoto();
              if (uri) {
                await setThemePhoto(uri);
                showToast('Background photo set for all tickets');
              }
            } catch (e) {
              showToast(e instanceof Error ? e.message : "Couldn't use that photo");
            }
          }}
          style={styles.row}
        >
          {themePhoto ? <Image source={{ uri: themePhoto }} style={styles.thumb} contentFit="cover" /> : null}
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.rowText}>{themePhoto ? 'Change background photo' : 'Background photo for all tickets'}</Text>
            <Text style={styles.note}>Shows behind every ticket card without its own photo.</Text>
          </View>
          <Icon name="photo" size={18} color={colors.ink} stroke={2.2} />
        </Pressable>
        {themePhoto ? (
          <Pressable accessibilityRole="button" onPress={() => setThemePhoto(null)} style={styles.row}>
            <Text style={styles.rowText}>Remove background photo</Text>
          </Pressable>
        ) : null}
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
        <Pressable accessibilityRole="link" onPress={() => Linking.openURL('https://jesjg.github.io/stubs-app/privacy/')} style={styles.row}>
          <Text style={styles.rowText}>Privacy policy</Text>
          <Icon name="arrow" size={16} color={colors.ink} />
        </Pressable>
        <Pressable accessibilityRole="link" onPress={() => Linking.openURL('https://jesjg.github.io/stubs-app/support/')} style={styles.row}>
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
  thumb: { width: 40, height: 40, borderRadius: 8, marginRight: 12 },
  footer: { ...font.mono, fontSize: 12, color: colors.inkSoft, textAlign: 'center' },
});
