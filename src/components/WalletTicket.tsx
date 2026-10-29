import { useState, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { fmt, relativeDay } from '../lib/dates';
import { isJourney, ticketType } from '../lib/ticketTypes';
import type { Detail, Stub, Ticket } from '../lib/types';
import { useStore } from '../lib/store';
import { CodeView } from './CodeView';
import { Holo } from './Holo';
import { Icon } from './Icon';

// Ticket card spec: system font (no fontFamily), white text on the type colour, black on white.
const INK = '#111111';
const SOFT = '#666666';
const LINE = '#EBEBEB';
const DASH = '#E2E2E2';
const WHITE = '#FFFFFF';

/** Seat-like details, shown first. */
const SEATING = ['Section', 'Block', 'Stand', 'Row', 'Seat', 'Coach', 'Berth', 'Cabin', 'Deck', 'Platform', 'Gate', 'Terminal', 'Entrance', 'Door'];
/** Times worth a highlight (shown in a pill of the type colour). */
const DEADLINES = ['Gate closes', 'Boarding', 'Doors'];
const LABELS: Record<string, string> = { Section: 'Sec' };

type Cell = Detail & { span: number; pill?: boolean };

type Props = {
  stub: Stub;
  /** Which of the stub's tickets (for its own seat etc.). */
  index?: number;
  /** "Next up" card on the home screen: smaller, fixed size, two details. */
  compact?: boolean;
  onPress?: () => void;
  /** Replaces the code (the tappable code on the ticket screen). */
  code?: ReactNode;
  /** 0 → 1 drops the ticket away (used when archiving). */
  tear?: Animated.Value;
};

/** Size to give CodeView so the code and its white margin fill a `box`-sized square. */
export function fitCode(ticket: Ticket, box: number) {
  const { code } = ticket;
  if (code?.symbology === 'qr' && code.payload) return Math.floor(box / 1.12);
  // A barcode ticket shows its whole page, drawn 1.4× taller than wide.
  if (!code || (code.symbology === 'linear' && ticket.pageUri)) return Math.floor((box - 20) / 1.4);
  return box - 20;
}

/** Seat-like codes first, then the time, then the rest; the passenger's name takes two columns. */
function cellsFor(stub: Stub, index: number): Cell[] {
  if (stub.kind === 'stay') {
    const st = stub.stay ?? {};
    return [
      stub.time ? { label: 'Check-in', value: stub.time, span: 1 } : null,
      st.checkOutDate ? { label: 'Check-out', value: `${fmt.short(st.checkOutDate)}${st.checkOutTime ? ` ${st.checkOutTime}` : ''}`, span: 1 } : null,
      st.doorCode ? { label: 'Door code', value: st.doorCode, span: 1 } : null,
      st.address ? { label: 'Address', value: st.address.split(',')[0], span: 2 } : null,
    ].filter((c): c is Cell => !!c);
  }
  const all = [...(stub.tickets[index]?.details ?? []), ...(stub.details ?? [])].filter((d) => d.label !== 'Company' && d.label !== 'Flight');
  const isCode = (v: string) => v.length <= 8 && (/\d/.test(v) || v === v.toUpperCase());
  const seating = SEATING.flatMap((name) => all.filter((d) => d.label === name && isCode(d.value)));
  const timeLabel = isJourney(stub.kind) ? 'Departs' : stub.kind === 'activity' ? 'Start' : 'Time';
  const rest = all.filter((d) => !seating.includes(d));
  return [
    ...seating,
    ...(stub.time ? [{ label: timeLabel, value: stub.time }] : []),
    ...rest.filter((d) => DEADLINES.includes(d.label)).map((d) => ({ ...d, pill: true })),
    ...rest.filter((d) => !DEADLINES.includes(d.label)),
  ].map((d) => ({ ...d, span: d.label === 'Passenger' ? 2 : 1 }));
}

/** Lay cells out in rows of `cols` columns; a short last row keeps its cells in their columns. */
function rowsOf(cells: Cell[], cols: number) {
  const rows: Cell[][] = [];
  let row: Cell[] = [];
  let used = 0;
  for (const c of cells) {
    const span = Math.min(c.span, cols);
    if (used + span > cols) {
      rows.push(row);
      row = [];
      used = 0;
    }
    row.push({ ...c, span });
    used += span;
  }
  if (row.length) rows.push(row);
  return rows;
}

/** "LGW → PMI" style titles become big route codes on the ticket screen. */
function routeOf(stub: Stub) {
  if (!isJourney(stub.kind)) return null;
  const parts = stub.title.split(/\s*(?:→|->)\s*/);
  return parts.length === 2 && parts.every((p) => /^[A-Za-z]{3,4}$/.test(p)) ? parts.map((p) => p.toUpperCase()) : null;
}

/**
 * The card's outline: a rounded rectangle with a semicircle cut into each side at the perforation
 * (`py`), so the edge, border and shadow all follow the notches.
 */
function outline(w: number, h: number, radius: number, py: number, r: number) {
  const R = radius;
  return [
    `M${R} 0H${w - R}A${R} ${R} 0 0 1 ${w} ${R}`,
    `V${py - r}A${r} ${r} 0 0 0 ${w} ${py + r}`,
    `V${h - R}A${R} ${R} 0 0 1 ${w - R} ${h}`,
    `H${R}A${R} ${R} 0 0 1 0 ${h - R}`,
    `V${py + r}A${r} ${r} 0 0 0 0 ${py - r}`,
    `V${R}A${R} ${R} 0 0 1 ${R} 0Z`,
  ].join('');
}

/** The coloured top of the card, down to the middle of the notches. */
function headerShape(w: number, radius: number, py: number, r: number) {
  const R = radius;
  return [
    `M0 ${py - r}V${R}A${R} ${R} 0 0 1 ${R} 0H${w - R}A${R} ${R} 0 0 1 ${w} ${R}`,
    `V${py - r}A${r} ${r} 0 0 0 ${w - r} ${py}`,
    `H${r}A${r} ${r} 0 0 0 0 ${py - r}Z`,
  ].join('');
}

/** The ticket card: type-coloured header, perforation, white body with the code and details. */
export function WalletTicket({ stub, index = 0, compact, onPress, code, tear }: Props) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [headH, setHeadH] = useState(0);
  const holoAll = useStore((s) => s.settings.holoAll);
  const type = ticketType(stub.kind);
  const ticket = stub.tickets[index];
  const company = stub.details?.find((d) => d.label === 'Company')?.value;
  const flight = stub.details?.find((d) => d.label === 'Flight')?.value ?? stub.tickets[index]?.details?.find((d) => d.label === 'Flight')?.value;
  const operator = [company, flight].filter(Boolean).join(' · ');
  const route = compact ? null : routeOf(stub);
  const count = stub.tickets.length;
  const subtitle =
    stub.kind === 'stay'
      ? stub.stay?.address?.split(',')[0]
      : [relativeDay(stub.date), count > 1 ? `Ticket ${index + 1} of ${count}` : ''].filter(Boolean).join(' · ');
  const day = fmt.dow(stub.date);
  const date = `${Number(fmt.dayNum(stub.date))} ${fmt.mon(stub.date)}`;
  const cols = compact ? 2 : 3;
  const cells = cellsFor(stub, index);
  const rows = rowsOf(compact ? cells.slice(0, 2) : cells, cols);
  const notch = compact ? 20 : 24;
  const radius = compact ? 24 : 28;
  // Until the card has been measured, plain colours stand in for the drawn shape.
  const drawn = size.w > 0 && headH > 0;
  const py = headH + notch / 2;
  const box = compact ? 150 : 204;

  const card = (
    <View
      style={[styles.card, { borderRadius: radius }, !drawn && styles.cardPlain]}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {drawn && (
        <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill}>
          <Path d={outline(size.w, size.h, radius, py, notch / 2)} fill={WHITE} />
          <Path d={headerShape(size.w, radius, py, notch / 2)} fill={type.color} />
          <Path d={outline(size.w, size.h, radius, py, notch / 2)} fill="none" stroke={LINE} strokeWidth={1} />
        </Svg>
      )}
      <View
        onLayout={(e) => setHeadH(e.nativeEvent.layout.height)}
        style={[
          styles.head,
          compact ? styles.headCompact : styles.headFull,
          { borderTopLeftRadius: radius, borderTopRightRadius: radius },
          !drawn && { backgroundColor: type.color },
        ]}
      >
        {(stub.holo || holoAll) && <Holo />}
        <View style={styles.headTop}>
          <View style={styles.headLeft}>
            <View style={[styles.badge, compact && styles.badgeCompact]}>
              <Icon name={type.icon} size={compact ? 18 : 20} color={type.color} stroke={2} />
            </View>
            <View style={styles.shrink}>
              <Text style={[styles.typeLabel, compact && styles.small]}>{type.label}</Text>
              {!compact && operator ? (
                <Text style={styles.headSub} numberOfLines={1}>
                  {operator}
                </Text>
              ) : null}
            </View>
          </View>
          {compact ? (
            <Text style={[styles.typeLabel, styles.small]}>{`${day} ${date}`.toUpperCase()}</Text>
          ) : (
            <View style={styles.when}>
              <Text style={styles.typeLabel}>{day}</Text>
              <Text style={styles.date}>{date}</Text>
            </View>
          )}
        </View>
        {route ? (
          <View style={styles.route}>
            <Text style={styles.code}>{route[0]}</Text>
            <View style={styles.flightPath}>
              <View style={styles.pathDash} />
              <View style={stub.kind === 'flight' && styles.tilt}>
                <Icon name={stub.kind === 'flight' ? 'typePlane' : type.icon} size={22} color={WHITE} stroke={2} />
              </View>
              <View style={styles.pathDash} />
            </View>
            <Text style={styles.code}>{route[1]}</Text>
          </View>
        ) : (
          <View style={styles.titleBox}>
            <Text style={styles.title} numberOfLines={compact ? 1 : 2} adjustsFontSizeToFit minimumFontScale={0.7}>
              {stub.title}
            </Text>
            {subtitle || (compact && operator) ? (
              <Text style={styles.headSub} numberOfLines={1}>
                {compact && operator ? operator : subtitle}
              </Text>
            ) : null}
          </View>
        )}
      </View>

      <View style={[styles.perfRow, { height: notch, paddingHorizontal: notch / 2 }]}>
        <View style={styles.perfDash} />
      </View>

      <View style={compact ? styles.bodyCompact : styles.body}>
        <View style={styles.codeBox}>
          <View style={[styles.codeSlot, { height: box }]}>
            {code ??
              (ticket?.code ? (
                <CodeView ticket={ticket} size={fitCode(ticket, box)} />
              ) : (
                <View style={[styles.placeholder, { backgroundColor: `${type.color}14` }]}>
                  <Icon name={type.icon} size={56} color={type.color} stroke={1.6} />
                </View>
              ))}
          </View>
          {!compact && <Text style={styles.caption}>Brightness boosted for scanning</Text>}
        </View>
        <View style={[styles.grid, compact && { minHeight: 44 }]}>
          {rows.map((row, r) => (
            <View key={r} style={styles.gridRow}>
              {row.map((c, i) => (
                <View key={`${c.label}-${i}`} style={[styles.cell, { flex: c.span }]}>
                  <Text style={styles.cellLabel} numberOfLines={1}>
                    {(LABELS[c.label] ?? c.label).toUpperCase()}
                  </Text>
                  <Text
                    style={[
                      styles.cellValue,
                      (compact || c.value.length > 8) && styles.cellValueLong,
                      c.pill && [styles.pill, { backgroundColor: type.color }],
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.6}
                  >
                    {c.value}
                  </Text>
                </View>
              ))}
              {/* Keep a short last row's cells in their columns. */}
              {row.reduce((n, c) => n + c.span, 0) < cols && <View style={{ flex: cols - row.reduce((n, c) => n + c.span, 0) }} />}
            </View>
          ))}
        </View>
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

  const lift = styles.lift;
  if (!tear) return <View style={lift}>{body}</View>;
  return (
    <Animated.View
      style={[
        lift,
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
  // No background here, so iOS draws the shadow from the card's drawn shape, notches and all.
  lift: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 12 } },
  card: {},
  cardPlain: { backgroundColor: WHITE, overflow: 'hidden' },
  head: { overflow: 'hidden' },
  headFull: { paddingTop: 20, paddingHorizontal: 22, paddingBottom: 32, gap: 18 },
  headCompact: { height: 148, paddingTop: 18, paddingHorizontal: 20, paddingBottom: 28, gap: 14 },
  headTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  shrink: { flexShrink: 1, gap: 1 },
  badge: { width: 40, height: 40, borderRadius: 20, backgroundColor: WHITE, alignItems: 'center', justifyContent: 'center' },
  badgeCompact: { width: 36, height: 36, borderRadius: 18 },
  typeLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 1, color: WHITE },
  small: { fontSize: 12 },
  headSub: { fontSize: 13, fontWeight: '500', color: WHITE },
  when: { alignItems: 'flex-end', gap: 1 },
  date: { fontSize: 18, fontWeight: '600', color: WHITE },
  route: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  code: { fontSize: 50, lineHeight: 52, fontWeight: '800', letterSpacing: -1.5, color: WHITE },
  flightPath: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  pathDash: { flex: 1, height: 0, borderTopWidth: 2, borderStyle: 'dashed', borderColor: WHITE },
  tilt: { transform: [{ rotate: '45deg' }] },
  titleBox: { gap: 3 },
  title: { fontSize: 24, lineHeight: 27, fontWeight: '800', letterSpacing: -0.6, color: WHITE },
  perfRow: { flexDirection: 'row', alignItems: 'center' },
  perfDash: { flex: 1, height: 0, borderTopWidth: 2, borderStyle: 'dashed', borderColor: DASH, marginHorizontal: 8 },
  body: { paddingTop: 8, paddingHorizontal: 22, paddingBottom: 22, gap: 18 },
  bodyCompact: { paddingTop: 6, paddingHorizontal: 20, paddingBottom: 18, gap: 14 },
  codeBox: { alignItems: 'center', gap: 10 },
  codeSlot: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  placeholder: { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center' },
  caption: { fontSize: 12, fontWeight: '500', color: SOFT },
  grid: { gap: 16 },
  gridRow: { flexDirection: 'row', gap: 12 },
  cell: { alignItems: 'center', gap: 3 },
  cellLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.8, color: SOFT, textAlign: 'center' },
  cellValue: { fontSize: 20, fontWeight: '700', color: INK, textAlign: 'center', fontVariant: ['tabular-nums'] },
  cellValueLong: { fontSize: 17 },
  pill: { color: WHITE, borderRadius: 8, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 1, fontSize: 18 },
});
