import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { importFiles } from '../lib/importer';
import {
  dismissShot,
  enableScreenshotCheck,
  screenshotsSupported,
  useFoundShots,
  type FoundShot,
} from '../lib/screenshots';
import { setSettings, useStore } from '../lib/store';
import { colors, font, label } from '../theme';
import { Icon } from './Icon';

/** Home-screen cards: a one-time opt-in, then any screenshots that contain a ticket. */
export function ScreenshotCards() {
  const pref = useStore((s) => s.settings.screenshots);
  const shots = useFoundShots();
  if (!screenshotsSupported) return null;
  if (pref === undefined) return <OptIn />;
  if (pref !== 'on' || !shots.length) return null;
  return (
    <View style={styles.stack}>
      {shots.map((s) => (
        <FoundCard key={s.assetId} shot={s} />
      ))}
    </View>
  );
}

function OptIn() {
  const [busy, setBusy] = useState(false);
  return (
    <View style={styles.card}>
      <Text style={label}>New</Text>
      <Text style={styles.title}>Spot tickets in your screenshots</Text>
      <Text style={styles.body}>
        Screenshot a ticket page and Stash offers to add it next time you open the app. Screenshots are checked on this
        phone and never leave it.
      </Text>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={async () => {
            setBusy(true);
            const ok = await enableScreenshotCheck();
            setBusy(false);
            if (!ok) {
              Alert.alert(
                'Photos access is off',
                'You can turn it on any time in Settings → Stash → Photos, then switch screenshot checking on in Stash settings.',
              );
            }
          }}
          style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]}
        >
          {busy ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.primaryText}>Turn on</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setSettings({ screenshots: 'off' })} style={styles.ghost}>
          <Text style={styles.ghostText}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

function FoundCard({ shot }: { shot: FoundShot }) {
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    try {
      await importFiles([{ uri: shot.uri, name: null, mimeType: 'image/png' }]);
      dismissShot(shot.assetId);
      router.push('/add');
    } catch (e) {
      Alert.alert("Couldn't add that screenshot", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={[styles.card, styles.found]}>
      <Image source={{ uri: shot.uri }} style={styles.thumb} contentFit="cover" accessibilityLabel="Screenshot preview" />
      <View style={styles.foundBody}>
        <Text style={label}>Ticket in a screenshot</Text>
        <Text style={styles.foundTitle}>
          {shot.codes > 1 ? `${shot.codes} codes found` : 'Code found'}. Add it to Stash?
        </Text>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={add}
            style={({ pressed }) => [styles.primary, styles.small, pressed && { opacity: 0.85 }]}
          >
            {busy ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.primaryText}>Add</Text>}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            onPress={() => dismissShot(shot.assetId)}
            hitSlop={8}
            style={styles.ghost}
          >
            <Icon name="close" size={16} color={colors.inkSoft} stroke={2.4} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 10 },
  card: { backgroundColor: colors.paper, borderRadius: 16, padding: 18, gap: 8 },
  title: { ...font.bodyBold, fontSize: 18, color: colors.ink },
  body: { ...font.body, fontSize: 15, lineHeight: 21, color: colors.inkSoft },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  primary: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  small: { minHeight: 40, paddingHorizontal: 16 },
  primaryText: { ...font.bodyBold, fontSize: 15, color: colors.ink },
  ghost: { minHeight: 44, minWidth: 44, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  ghostText: { ...font.bodyMedium, fontSize: 15, color: colors.inkSoft },
  found: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  thumb: { width: 64, height: 112, borderRadius: 8, backgroundColor: colors.ground },
  foundBody: { flex: 1, gap: 4 },
  foundTitle: { ...font.bodyBold, fontSize: 16, color: colors.ink },
});
