import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { dayKey } from '../lib/dates';
import { newId } from '../lib/files';
import { dataFromUrl, decodeLink, linkDetails, LINK_PAGE, encodeLink } from '../lib/stashLink';
import { setDraft } from '../lib/store';
import type { Stub } from '../lib/types';
import { colors, font, label } from '../theme';

/** Opened by an "Add to Stash" link (stubs://import?d=…): the ticket arrives already filled in. */
export default function ImportFromLink() {
  const { d } = useLocalSearchParams<{ d?: string }>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const data = d ? dataFromUrl(d) ?? d : null;
    const t = data ? decodeLink(data) : null;
    if (!t) {
      const id = setTimeout(() => setFailed(true), 0);
      return () => clearTimeout(id);
    }
    const id = newId();
    const { shared, perTicket } = linkDetails(t);
    const draft: Stub = {
      id,
      title: t.t.slice(0, 60),
      kind: t.k ?? 'event',
      date: t.d ?? dayKey(),
      time: t.tm,
      tickets: t.x.map((x, i) => ({
        id: `${id}-${i}`,
        pageUri: '',
        code: { symbology: 'qr', payload: x.q, cropUri: '' },
        details: perTicket[i]?.length ? perTicket[i] : undefined,
      })),
      details: [...shared, ...(t.info ? [{ label: 'Info', value: t.info.slice(0, 160) }] : [])],
      link: `${LINK_PAGE}#${encodeLink(t)}`,
      autofill: ['title', 'date', ...(t.tm ? (['time'] as const) : []), ...(t.k ? (['kind'] as const) : [])],
      sourceUri: '',
      sourceName: t.c ? `From ${t.c}` : 'Add to Stash link',
      pageUris: [],
      createdAt: Date.now(),
    };
    setDraft(draft);
    router.replace('/add');
  }, [d]);

  return (
    <View style={styles.screen}>
      {failed ? (
        <>
          <Text style={label}>{"Couldn't add that"}</Text>
          <Text style={styles.title}>Hmm.</Text>
          <Text style={styles.body}>That Add to Stash link looks incomplete. Ask whoever sent it for a new one, or add the ticket as a screenshot.</Text>
          <Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={styles.btn}>
            <Text style={styles.btnText}>Back to Stash</Text>
          </Pressable>
        </>
      ) : (
        <Text style={styles.reading}>Adding your ticket</Text>
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
  btnText: { ...font.bodyBold, fontSize: 16, color: colors.onAccent },
});
