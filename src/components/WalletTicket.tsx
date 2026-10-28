import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { fmt, relativeDay } from '../lib/dates';
import { ticketAccent, ticketDeep } from '../lib/palette';
import { KINDS, type Detail, type Stub } from '../lib/types';
import { useStore } from '../lib/store';
import { colors, fonts } from '../theme';
import { Holo } from './Holo';

/** Details worth showing large in the strip, in this order (like Sec / Row / Seat on a Wallet pass). */
const BIG = ['Section', 'Block', 'Stand', 'Row', 'Seat', 'Coach', 'Berth', 'Cabin', 'Deck', 'Platform', 'Gate', 'Terminal', 'Flight', 'Entrance', 'Door'];
const SHORT: Record<string, string> = { Section: 'Sec', Platform: 'Plat', Entrance: 'Entr', Terminal: 'Term' };
const NOTCH = 84;

type Props = {
  stub: Stub;
  /** Which of the stub's tickets (for its own seat etc.). */
  index?: number;
  /** Colour behind the card, used for the notch. */
  ground: string;
  artHeight?: number;
  onPress?: () => void;
  /** Small text at the end of the bottom line, e.g. "Show code →". */
  hint?: string;
  /** Shown under the strip (the code on the ticket screen). */
  children?: ReactNode;
  /** 0 → 1 drops the ticket away (used when archiving). */
  tear?: Animated.Value;
};

/** Split details into up to three short ones shown large, and the rest. */
function splitDetails(details: Detail[]) {
  const big: Detail[] = [];
  for (const name of BIG) {
    const d = details.find((x) => x.label === name && x.value.length <= 7);
    if (d && big.length < 3) big.push(d);
  }
  return { big, rest: details.filter((d) => !big.includes(d)) };
}

/** A ticket shaped like an Apple Wallet event pass: notch at the top, picture, dark strip with the seat. */
export function WalletTicket({ stub, index = 0, ground, artHeight = 230, onPress, hint, children, tear }: Props) {
  const themePhoto = useStore((s) => s.settings.themePhoto);
  const holoAll = useStore((s) => s.settings.holoAll);
  const cover = stub.cover ?? themePhoto;
  const accent = ticketAccent(stub.color, colors.accent);
  const deep = ticketDeep(stub.color, colors.night);
  const isStay = stub.kind === 'stay';
  const count = stub.tickets.length;
  const company = stub.details?.find((d) => d.label === 'Company')?.value;
  const kind = KINDS.find((k) => k.id === stub.kind)?.label ?? 'Ticket';

  const all = [...(stub.tickets[index]?.details ?? []), ...(stub.details ?? [])].filter((d) => d.label !== 'Company');
  const stayBig: Detail[] = isStay
    ? [
        ...(stub.time ? [{ label: 'Check-in', value: stub.time }] : []),
        ...(stub.stay?.checkOutDate ? [{ label: 'Until', value: `${Number(fmt.dayNum(stub.stay.checkOutDate))} ${fmt.mon(stub.stay.checkOutDate)}` }] : []),
      ]
    : [];
  const { big, rest } = isStay ? { big: stayBig, rest: [] as Detail[] } : splitDetails(all);
  const valueSize = big.length >= 3 ? 34 : 40;
  const place = isStay ? stub.stay?.address?.split(',')[0] : undefined;
  const lineOne = [place, ...rest.map((d) => (d.label === 'Ref' ? `Ref ${d.value}` : d.value))].filter(Boolean).join(' · ');
  const lineTwo = [relativeDay(stub.date), count > 1 && !isStay ? `Ticket ${index + 1} of ${count}` : ''].filter(Boolean).join(' · ');
  const onArt = cover ? colors.nightText : colors.ink;

  const card = (
    <View style={[styles.card, { backgroundColor: deep }]}>
      <View style={[styles.art, { height: artHeight, backgroundColor: accent }]}>
        {cover && <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />}
        {cover && <View style={styles.artShade} />}
        {(stub.holo || holoAll) && <Holo />}
        <View style={styles.head}>
          <Text style={[styles.title, { color: onArt }, cover && styles.shadow]} numberOfLines={2}>
            {stub.title}
          </Text>
          {/* Keep clear of the notch. */}
          <View style={styles.gap} />
          <View style={styles.when}>
            <Text style={[styles.date, { color: onArt }, cover && styles.shadow]}>
              {`${Number(fmt.dayNum(stub.date))} ${fmt.mon(stub.date).toUpperCase()}`}
            </Text>
            {stub.time ? <Text style={[styles.time, { color: onArt }, cover && styles.shadow]}>{stub.time}</Text> : null}
          </View>
        </View>
      </View>

      <View style={styles.strip}>
        <View style={styles.stripTop}>
          <Text style={styles.who} numberOfLines={2}>
            {company ?? kind}
          </Text>
          <View style={styles.bigRow}>
            {big.map((d) => (
              <View key={d.label} style={styles.bigField}>
                <Text style={styles.bigLabel}>{SHORT[d.label] ?? d.label}</Text>
                <Text style={[styles.bigValue, { fontSize: valueSize }]} numberOfLines={1} adjustsFontSizeToFit>
                  {d.value}
                </Text>
              </View>
            ))}
          </View>
        </View>
        {lineOne ? (
          <Text style={styles.line} numberOfLines={1}>
            {lineOne}
          </Text>
        ) : null}
        <View style={styles.lineRow}>
          <Text style={[styles.line, styles.grow]} numberOfLines={1}>
            {lineTwo}
          </Text>
          {hint ? <Text style={[styles.hint, { color: accent }]}>{hint}</Text> : null}
        </View>
      </View>

      {children}
      <View style={[styles.notch, { backgroundColor: ground }]} />
    </View>
  );

  const body = onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${stub.title}, ${relativeDay(stub.date)}${stub.time ? ` at ${stub.time}` : ''}. Show code.`}
      onPress={onPress}
      style={({ pressed }) => pressed && { transform: [{ scale: 0.985 }] }}
    >
      {card}
    </Pressable>
  ) : (
    card
  );

  if (!tear) return <View style={styles.lift}>{body}</View>;
  return (
    <Animated.View
      style={[
        styles.lift,
        {
          opacity: tear.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
          transform: [
            { translateY: tear.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 6, 520] }) },
            { rotate: tear.interpolate({ inputRange: [0, 0.15, 1], outputRange: ['0deg', '-1deg', '10deg'] }) },
          ],
        },
      ]}
    >
      {body}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  lift: { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  card: { borderRadius: 18, overflow: 'hidden' },
  art: { justifyContent: 'flex-start' },
  artShade: { position: 'absolute', left: 0, right: 0, top: 0, height: 120, backgroundColor: 'rgba(0,0,0,0.32)' },
  head: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 16 },
  gap: { width: NOTCH - 16 },
  title: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 19, lineHeight: 23 },
  when: { flex: 1, alignItems: 'flex-end', gap: 2 },
  date: { fontFamily: fonts.bodyBold, fontSize: 19, lineHeight: 23 },
  time: { fontFamily: fonts.mono, fontSize: 17 },
  shadow: { textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
  strip: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 16, gap: 6 },
  stripTop: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, minHeight: 56 },
  who: { flexShrink: 1, fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 19, textTransform: 'uppercase', color: colors.nightSoft, paddingBottom: 6 },
  bigRow: { flexDirection: 'row', gap: 20 },
  bigField: { alignItems: 'flex-end', maxWidth: 120 },
  bigLabel: { fontFamily: fonts.mono, fontSize: 13, color: colors.nightSoft },
  bigValue: { fontFamily: fonts.bodyMedium, color: colors.nightText },
  line: { fontFamily: fonts.mono, fontSize: 13, color: colors.nightText },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1 },
  hint: { fontFamily: fonts.bodyBold, fontSize: 14 },
  notch: {
    position: 'absolute',
    top: -NOTCH / 2 - 14,
    left: '50%',
    marginLeft: -NOTCH / 2,
    width: NOTCH,
    height: NOTCH,
    borderRadius: NOTCH / 2,
  },
});
