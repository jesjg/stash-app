import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showToast } from '../components/Toast';
import { captureRef } from 'react-native-view-shot';
import { WebView } from 'react-native-webview';
import { Icon } from '../components/Icon';
import { importFiles } from '../lib/importer';
import { colors, font } from '../theme';

/** Keep only web links; anything else (javascript:, file:) is refused. */
function safeUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  const match = raw.match(/https?:\/\/[^\s<>"']+/i);
  if (!match) return null;
  try {
    const u = new URL(match[0]);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/** "Your tickets | Big Venue" → "Your tickets" */
function cleanTitle(title: string) {
  return title.split(/\s[|–—-]\s/)[0].trim().slice(0, 60);
}

/**
 * Opens a ticket link inside Stubs. The person can sign in if the page needs it,
 * scroll to the code, and capture what's on screen. The capture goes through the
 * normal scanner and confirm screen.
 */
export default function WebImport() {
  const { url: raw } = useLocalSearchParams<{ url: string }>();
  const url = safeUrl(raw);
  const insets = useSafeAreaInsets();
  const frame = useRef<View>(null);
  const [title, setTitle] = useState('');
  const [host, setHost] = useState(() => (url ? new URL(url).host : ''));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (!url) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.errTitle}>Not a web link</Text>
        <Text style={styles.errBody}>Share a ticket page from Safari or Mail, or take a screenshot of it instead.</Text>
        <Pressable accessibilityRole="button" onPress={close} style={styles.capture}>
          <Text style={styles.captureText}>Back to Stash</Text>
        </Pressable>
      </View>
    );
  }

  const capture = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const uri = await captureRef(frame, { format: 'png', quality: 1, result: 'tmpfile' });
      const name = `${cleanTitle(title) || host}.png`;
      await importFiles([{ uri, name, mimeType: 'image/png' }], { requireCode: true });
      router.replace('/add');
    } catch (e) {
      Alert.alert("Couldn't find a ticket", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
        <Pressable accessibilityRole="button" onPress={close} hitSlop={10} style={styles.barBtn}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
        <View style={styles.address}>
          {loading ? <ActivityIndicator size="small" color={colors.nightSoft} /> : null}
          <Text style={styles.host} numberOfLines={1}>
            {host}
          </Text>
        </View>
        <View style={styles.barBtn} />
      </View>

      <View ref={frame} collapsable={false} style={styles.frame}>
        <WebView
          source={{ uri: url }}
          originWhitelist={['*']}
          // Booking sites try to bounce you into their own app ("gyg://…", App Store links).
          // Keep everything inside Stash so you can sign in and capture the ticket here.
          onShouldStartLoadWithRequest={(req) => {
            const u = req.url.toLowerCase();
            if (/^(https?|about|data|blob):/.test(u) && !/^https?:\/\/(apps\.apple\.com|itunes\.apple\.com)\//.test(u)) return true;
            showToast('Kept you in Stash: that page tried to open another app.');
            return false;
          }}
          setSupportMultipleWindows={false}
          sharedCookiesEnabled
          allowsBackForwardNavigationGestures
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onNavigationStateChange={(n) => {
            if (n.title) setTitle(n.title);
            try {
              setHost(new URL(n.url).host);
            } catch {}
          }}
          style={styles.web}
        />
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Text style={styles.hint}>Sign in if asked, then scroll until the code is fully on screen.</Text>
        <Pressable
          accessibilityRole="button"
          onPress={capture}
          disabled={busy}
          style={({ pressed }) => [styles.capture, pressed && { opacity: 0.85 }]}
        >
          {busy ? (
            <ActivityIndicator color={colors.ink} />
          ) : (
            <>
              <Icon name="plus" size={18} color={colors.ink} />
              <Text style={styles.captureText}>Capture ticket</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  center: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 10, gap: 8 },
  barBtn: { minWidth: 64, minHeight: 44, justifyContent: 'center' },
  cancel: { ...font.bodyMedium, fontSize: 16, color: colors.nightText },
  address: {
    flex: 1,
    minHeight: 36,
    borderRadius: 10,
    backgroundColor: '#24241F',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  host: { ...font.mono, fontSize: 13, color: colors.nightText, flexShrink: 1 },
  frame: { flex: 1, backgroundColor: colors.paper },
  web: { flex: 1 },
  footer: { paddingHorizontal: 20, paddingTop: 12, gap: 10, backgroundColor: colors.night },
  hint: { ...font.mono, fontSize: 12, color: colors.nightSoft, textAlign: 'center' },
  capture: {
    height: 54,
    borderRadius: 999,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 24,
  },
  captureText: { ...font.bodyBold, fontSize: 16, color: colors.ink },
  errTitle: { ...font.display, fontSize: 30, color: colors.nightText },
  errBody: { ...font.body, fontSize: 16, lineHeight: 23, color: colors.nightSoft, textAlign: 'center' },
});
