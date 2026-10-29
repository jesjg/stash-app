import { router } from 'expo-router';
import { useIncomingShare } from 'expo-sharing';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { importFiles, importText, type IncomingFile } from '../lib/importer';
import { looksLikeStay } from '../lib/stay';
import { colors, font, label } from '../theme';

/** Landing screen for Share → Stubs from Mail, Files, Photos, etc. */
export default function HandleShare() {
  const { resolvedSharedPayloads, isResolving, error, clearSharedPayloads } = useIncomingShare();
  const [failure, setFailure] = useState<string | null>(null);
  const started = useRef(false);

  const files: IncomingFile[] = useMemo(
    () =>
      resolvedSharedPayloads
        .filter((p) => (p.contentType === 'file' || p.contentType === 'image') && p.contentUri)
        .map((p) => ({ uri: p.contentUri as string, name: p.originalName, mimeType: p.contentMimeType })),
    [resolvedSharedPayloads],
  );
  // A shared link (GetYourGuide, Viator, Safari, a link from Mail) opens in the in-app capture view.
  const sharedUrl = useMemo(() => {
    for (const p of resolvedSharedPayloads) {
      const candidates = [p.contentType === 'website' ? p.contentUri : null, p.value];
      for (const c of candidates) {
        const m = c?.match(/https?:\/\/[^\s<>"']+/i);
        if (m) return m[0];
      }
    }
    return null;
  }, [resolvedSharedPayloads]);
  // Text shared from a host message or email that reads like check-in details.
  const stayText = useMemo(() => {
    const text = resolvedSharedPayloads
      .filter((p) => p.contentType === 'text' && p.value)
      .map((p) => p.value as string)
      .join('\n');
    return text.length > 40 && looksLikeStay(text) ? text : null;
  }, [resolvedSharedPayloads]);
  const nothingUsable = !isResolving && resolvedSharedPayloads.length > 0 && files.length === 0 && !stayText && !sharedUrl;
  const message = failure ?? error?.message ?? (nothingUsable ? 'Share the ticket PDF, a screenshot of it or a link to the ticket.' : null);

  useEffect(() => {
    if (isResolving || started.current || files.length || !stayText) return;
    started.current = true;
    Promise.resolve()
      .then(() => importText(stayText))
      .then(() => router.replace('/add'))
      .catch((e) => setFailure(e instanceof Error ? e.message : String(e)))
      .finally(clearSharedPayloads);
  }, [files, stayText, isResolving, clearSharedPayloads]);


  useEffect(() => {
    if (isResolving || started.current || !files.length) return;
    started.current = true;
    importFiles(files)
      .then(() => router.replace('/add'))
      .catch((e) => setFailure(e instanceof Error ? e.message : String(e)))
      .finally(clearSharedPayloads);
  }, [files, isResolving, clearSharedPayloads]);

  useEffect(() => {
    // Check-in text wins over a link inside it; files win over both.
    if (isResolving || started.current || files.length || stayText || !sharedUrl) return;
    started.current = true;
    clearSharedPayloads();
    router.replace({ pathname: '/web', params: { url: sharedUrl } });
  }, [files, sharedUrl, stayText, isResolving, clearSharedPayloads]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!started.current) setFailure((f) => f ?? 'Nothing came through from the share sheet. Try sharing it again.');
    }, 10_000);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={styles.screen}>
      {message ? (
        <>
          <Text style={label}>{"Couldn't add that"}</Text>
          <Text style={styles.title}>Hmm.</Text>
          <Text style={styles.body}>{message}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={styles.btn}>
            <Text style={styles.btnText}>Back to Stash</Text>
          </Pressable>
        </>
      ) : (
        <>
          <ActivityIndicator color={colors.ink} />
          <Text style={styles.reading}>Reading your ticket</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  title: { ...font.display, fontSize: 36, color: colors.ink },
  body: { ...font.body, fontSize: 16, lineHeight: 23, color: colors.ink, textAlign: 'center' },
  reading: { ...font.mono, fontSize: 13, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.inkSoft },
  btn: { marginTop: 8, height: 52, paddingHorizontal: 24, borderRadius: 999, backgroundColor: colors.accent, justifyContent: 'center' },
  btnText: { ...font.bodyBold, fontSize: 16, color: colors.ink },
});
