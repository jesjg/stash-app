import { Image } from 'expo-image';
import { useState, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { fmt, relativeDay } from '../lib/dates';
import { ticketAccent } from '../lib/palette';
import { KINDS, type Detail, type Stub, type Ticket } from '../lib/types';
import { useStore } from '../lib/store';
import { colors, fonts } from '../theme';
import Svg, { Path } from 'react-native-svg';
import { CodeView } from './CodeView';
import { Holo } from './Holo';

/** Seat-like details, shown first (like Sec / Row / Seat on a Wallet pass). */
const SEATING = ['Section', 'Block', 'Stand', 'Row', 'Seat', 'Coach', 'Berth', 'Cabin', 'Deck', 'Platform', 'Gate', 'Terminal', 'Flight', 'Entrance', 'Door'];
const SHORT: Record<string, string> = { Section: 'Sec', Ref: 'Booking ref' };
const NOTCH = 84;
/** How far the notch's circle sits above the card's top edge. */
const NOTCH_LIFT = 14;
const RADIUS = 18;
/** Height of the code or picture in the middle of a home screen card, so every card is the same size. */
const MIDDLE = 186;

/** The card's outline: a rounded rectangle with a semicircle bitten out of the top middle. */
function outline(w: number, h: number) {
  const r = RADIUS;
  const R = NOTCH / 2;
  const half = Math.sqrt(R * R - NOTCH_LIFT * NOTCH_LIFT);
  const cx = w / 2;
  return [
    `M${r} 0H${cx - half}`,
    `A${R} ${R} 0 0 0 ${cx + half} 0`,
    `H${w - r}A${r} ${r} 0 0 1 ${w} ${r}`,
    `V${h - r}A${r} ${r} 0 0 1 ${w - r} ${h}`,
    `H${r}A${r} ${r} 0 0 1 0 ${h - r}`,
    `V${r}A${r} ${r} 0 0 1 ${r} 0Z`,
  ].join('');
}

type Props = {
  stub: Stub;
  /** Which of the stub's tickets (for its own seat etc.). */
  index?: number;
  /** Home screen card: fixed size, one row of details, tap to open. */
  compact?: boolean;
  onPress?: () => void;
  /** Small text at the end of the bottom line, e.g. "Show code →". */
  hint?: string;
  /** Replaces the code in the middle of the card (the bigger, tappable code on the ticket screen). */
  code?: ReactNode;
  /** Shown under the details. */
  children?: ReactNode;
  /** 0 → 1 drops the ticket away (used when archiving). */
  tear?: Animated.Value;
};

/** Seat-like codes first (only short codes like "EE", "7", "SCH-G", not words read by mistake), then time, then the rest. */
function fieldsFor(stub: Stub, index: number): Detail[] {
  if (stub.kind === 'stay') {
    const st = stub.stay ?? {};
    return [
      stub.time ? { label: 'Check-in', value: stub.time } : null,
      st.checkOutDate ? { label: 'Check-out', value: `${fmt.short(st.checkOutDate)}${st.checkOutTime ? ` ${st.checkOutTime}` : ''}` } : null,
      st.address ? { label: 'Address', value: st.address.split(',')[0] } : null,
    ].filter((d): d is Detail => !!d);
  }
  const all = [...(stub.tickets[index]?.details ?? []), ...(stub.details ?? [])].filter((d) => d.label !== 'Company');
  const isCode = (v: string) => v.length <= 8 && (/\d/.test(v) || v === v.toUpperCase());
  const seating = SEATING.flatMap((name) => all.filter((d) => d.label === name && isCode(d.value)));
  const rest = all.filter((d) => !seating.includes(d));
  return [...seating, ...(stub.time ? [{ label: 'Time', value: stub.time }] : []), ...rest];
}

/** Code size that fits MIDDLE once CodeView adds its white margin (a whole page is drawn 1.4× taller, a PDF417 0.55×). */
function compactCodeSize(ticket: Ticket) {
  const { code } = ticket;
  if (code?.symbology === 'qr' && code.payload) return Math.floor(MIDDLE / 1.12);
  if (!code || (code.symbology === 'linear' && ticket.pageUri)) return Math.floor((MIDDLE - 20) / 1.4);
  return MIDDLE - 20;
}

/** A white ticket shaped like an Apple Wallet pass: notch at the top, name and date, picture, labelled details. */
export function WalletTicket({ stub, index = 0, compact, onPress, hint, code, children, tear }: Props) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const themePhoto = useStore((s) => s.settings.themePhoto);
  const holoAll = useStore((s) => s.settings.holoAll);
  const cover = stub.cover ?? themePhoto;
  const accent = ticketAccent(stub.color, colors.accent);
  const count = stub.tickets.length;
  const company = stub.details?.find((d) => d.label === 'Company')?.value;
  const kind = KINDS.find((k) => k.id === stub.kind)?.label ?? 'Ticket';
  const fields = fieldsFor(stub, index);
  const ticket = stub.tickets[index];
  const shown = compact ? fields.slice(0, 2) : fields;
  const footer = [relativeDay(stub.date), count > 1 && stub.kind !== 'stay' ? `Ticket ${index + 1} of ${count}` : ''].filter(Boolean).join(' · ');

  const card = (
    <View style={styles.card} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {size.w > 0 && (
        <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill}>
          <Path d={outline(size.w, size.h)} fill={colors.paper} stroke="#DCDCD5" strokeWidth={StyleSheet.hairlineWidth} />
        </Svg>
      )}
      {compact ? (
        // Narrow home screen card: company and date beside the notch, the name full width below it.
        <View style={styles.headCompact}>
          <View style={styles.topLine}>
            <Text style={[styles.brand, styles.grow, { color: accent }]} numberOfLines={1}>
              {company ?? kind}
            </Text>
            <View style={styles.notchGapCompact} />
            <Text style={[styles.brand, styles.grow, styles.right]} numberOfLines={1}>
              {`${fmt.dow(stub.date)} ${Number(fmt.dayNum(stub.date))} ${fmt.mon(stub.date)}`}
            </Text>
          </View>
          <Text style={styles.titleCompact} numberOfLines={2}>
            {stub.title}
          </Text>
        </View>
      ) : (
        <View style={styles.head}>
          <View style={styles.grow}>
            <Text style={[styles.brand, { color: accent }]} numberOfLines={1}>
              {company ?? kind}
            </Text>
            <Text style={styles.title} numberOfLines={3}>
              {stub.title}
            </Text>
          </View>
          {/* Keep clear of the notch. */}
          <View style={styles.notchGap} />
          <View style={styles.when}>
            <Text style={styles.fieldLabel}>{fmt.dow(stub.date)}</Text>
            <Text style={styles.date}>{`${Number(fmt.dayNum(stub.date))} ${fmt.mon(stub.date)}`}</Text>
          </View>
        </View>
      )}

      {code ??
        (ticket?.code ? (
          <View style={[styles.codeSlot, compact && { height: MIDDLE }]}>
            <CodeView ticket={ticket} size={compact ? compactCodeSize(ticket) : 180} />
          </View>
        ) : (
          <View style={[styles.banner, { height: compact ? MIDDLE : 132, backgroundColor: accent }]}>
            {cover ? (
              <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
            ) : (
              <Text style={styles.bannerText} numberOfLines={1} adjustsFontSizeToFit>
                {company ?? kind}
              </Text>
            )}
            {(stub.holo || holoAll) && <Holo />}
          </View>
        ))}

      <View style={[styles.fields, compact && styles.fieldsCompact]}>
        {shown.map((d, i) => (
          <View key={`${d.label}-${i}`} style={[styles.field, compact ? styles.grow : styles.fieldWide]}>
            <Text style={styles.fieldLabel} numberOfLines={1}>
              {SHORT[d.label] ?? d.label}
            </Text>
            <Text style={[styles.fieldValue, d.label === 'Ref' && { fontFamily: fonts.mono, fontSize: 15 }]} numberOfLines={compact ? 1 : 3}>
              {d.value}
            </Text>
          </View>
        ))}
      </View>

      {children}

      <View style={styles.footer}>
        <Text style={[styles.footerText, styles.grow]} numberOfLines={1}>
          {footer}
        </Text>
        {hint ? <Text style={[styles.hint, { color: accent }]}>{hint}</Text> : null}
      </View>
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
  lift: { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  card: {},
  grow: { flex: 1 },
  head: { flexDirection: 'row', paddingHorizontal: 18, paddingTop: 16, paddingBottom: 14 },
  headCompact: { height: 92, paddingHorizontal: 18, paddingTop: 16, gap: 8 },
  topLine: { flexDirection: 'row', alignItems: 'center' },
  notchGapCompact: { width: NOTCH - 4 },
  right: { textAlign: 'right', color: colors.ink },
  titleCompact: { fontFamily: fonts.bodyBold, fontSize: 19, lineHeight: 23, color: colors.ink },
  notchGap: { width: NOTCH - 24 },
  brand: { fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 0.6, textTransform: 'uppercase' },
  title: { fontFamily: fonts.bodyBold, fontSize: 20, lineHeight: 24, color: colors.ink, marginTop: 2 },
  when: { alignItems: 'flex-end' },
  date: { fontFamily: fonts.body, fontSize: 24, lineHeight: 28, color: colors.inkSoft },
  codeSlot: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  banner: { marginHorizontal: 18, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  bannerText: { fontFamily: fonts.display, fontSize: 40, textTransform: 'uppercase', color: colors.ink },
  fields: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 18, paddingTop: 16, rowGap: 14, columnGap: 16 },
  fieldsCompact: { flexWrap: 'nowrap', height: 62 },
  field: { gap: 2 },
  fieldWide: { minWidth: '28%', maxWidth: '100%' },
  fieldLabel: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase', color: colors.ink },
  fieldValue: { fontFamily: fonts.body, fontSize: 17, color: colors.inkSoft },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 16 },
  footerText: { fontFamily: fonts.mono, fontSize: 12, color: colors.inkSoft },
  hint: { fontFamily: fonts.bodyBold, fontSize: 14 },
});
