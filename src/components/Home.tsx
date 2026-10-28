import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './Icon';
import { CompanyMark, companyOf } from './CompanyMark';
import { Holo } from './Holo';
import { Logo } from './Logo';
import { ticketAccent, ticketDeep } from '../lib/palette';
import { NotifyPrompt } from './NotifyPrompt';
import { Perforated } from './Perforated';
import { ScreenshotCards } from './ScreenshotCards';
import { RoundButton } from './RoundButton';
import { showToast } from './Toast';
import { dayKey, daysBetween, fmt, relativeDay } from '../lib/dates';
import { summary } from '../lib/lockscreen';
import { addSampleTicket, clearPast, groupStubs, removeStub, setUsed, useStore } from '../lib/store';
import { KINDS, type Stub } from '../lib/types';
import { useAddTicket } from '../lib/useAddTicket';
import { iconFor, useTrips } from '../lib/useTrips';
import { tripDates, tripNights, type Trip } from '../lib/trips';
import { colors, fonts, label } from '../theme';

const kindLabel = (s: Stub) => KINDS.find((k) => k.id === s.kind)?.label ?? 'Ticket';
const ticketCount = (s: Stub) =>
  s.kind === 'stay'
    ? s.stay?.checkOutDate
      ? `Until ${fmt.short(s.stay.checkOutDate)}`
      : ''
    : s.tickets.length > 1
      ? `${s.tickets.length} tickets`
      : '1 ticket';
/** Under the title on the home card. */
function subLine(s: Stub, when: string) {
  if (s.kind === 'stay') {
    const place = s.stay?.address?.split(',')[0];
    const checkIn = s.date < dayKey() ? 'Staying now' : `${when}${s.time ? ` · check-in ${s.time}` : ''}`;
    return [checkIn, place].filter(Boolean).join(' · ');
  }
  return [s.time ? `${when} · ${s.time}` : when, summary([...(s.tickets[0]?.details ?? []), ...(s.details ?? [])])]
    .filter(Boolean)
    .join(' · ');
}
const NEXT_COUNT = 5;
const CARD_GAP = 12;
const openStub = (id: string) => router.push({ pathname: '/ticket/[id]', params: { id } });

function deleteWithUndo(stub: Stub) {
  const undo = removeStub(stub.id);
  showToast(`Deleted ${stub.title}`, { label: 'Undo', onPress: undo });
}

async function archiveWithUndo(stub: Stub) {
  const undo = await setUsed(stub.id, true);
  showToast(`Archived ${stub.title}`, { label: 'Undo', onPress: undo });
}

/** Everything in one list: tickets and stays, in date order. */
export function Home() {
  const insets = useSafeAreaInsets();
  const stubs = useStore((s) => s.stubs);
  const today = dayKey();
  const [now, setNow] = useState(() => Date.now());
  const groups = useMemo(() => groupStubs(stubs, today, now), [stubs, today, now]);
  const [showPast, setShowPast] = useState(false);
  const [slide, setSlide] = useState(0);
  const { width } = useWindowDimensions();
  const cardW = width - 56;
  // The next few tickets go in the carousel; everything after that is listed below.
  const live = useMemo(() => [...groups.today, ...groups.upcoming], [groups]);
  const next = live.slice(0, NEXT_COUNT);
  // Everything ahead, counting down (plus anything today that didn't fit in the carousel).
  const comingUp = useMemo(() => live.filter((s, i) => s.date > today || i >= NEXT_COUNT), [live, today]);
  // Trips take one row for all their parts, placed where their first part falls.
  const trips = useTrips();
  const list = useMemo(() => {
    const out: ({ trip: Trip } | { stub: Stub })[] = [];
    const shown = new Set<string>();
    const later = new Set(comingUp.map((s) => s.id));
    for (const s of live) {
      const trip = trips.find((t) => t.items.some((x) => x.id === s.id));
      if (trip) {
        if (!shown.has(trip.id)) out.push({ trip });
        shown.add(trip.id);
      } else if (later.has(s.id)) out.push({ stub: s });
    }
    return out;
  }, [live, comingUp, trips]);

  // First launch: show how Stash works.
  const introSeen = useStore((s) => s.settings.introSeen);
  useEffect(() => {
    if (!introSeen) {
      const t = setTimeout(() => router.push('/intro'), 50);
      return () => clearTimeout(t);
    }
  }, [introSeen]);

  // Re-check every minute so tickets slide into Past a few hours after they start.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const add = useAddTicket();
  const empty = stubs.length === 0;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: 40 }]}
      >
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <Logo size={58} />
            <View>
              <Text style={label}>{fmt.short(today)}</Text>
              <Text style={styles.wordmark}>Stash</Text>
            </View>
          </View>
          <View style={styles.headerButtons}>
            <RoundButton label="Settings" color="transparent" onPress={() => router.push('/settings')}>
              <Icon name="settings" color={colors.ink} stroke={2.2} />
            </RoundButton>
            <RoundButton label="Add ticket" onPress={add.open} size={48}>
              {add.busy ? <ActivityIndicator color={colors.accent} /> : <Icon name="plus" color={colors.accent} size={22} />}
            </RoundButton>
          </View>
        </View>

        <ScreenshotCards />
        <NotifyPrompt />

        {empty && (
          <EmptyState
            onAdd={add.open}
            onSample={() => {
              const s = addSampleTicket();
              router.push({ pathname: '/ticket/[id]', params: { id: s.id } });
            }}
          />
        )}

        {next.length > 0 && (
          <View style={styles.section}>
            <View style={styles.rowBetween}>
              <Text style={label}>Next up</Text>
              {next.length > 1 && <Text style={styles.hint}>Swipe for more</Text>}
            </View>
            <ScrollView
              horizontal
              decelerationRate="fast"
              snapToInterval={cardW + CARD_GAP}
              snapToAlignment="start"
              showsHorizontalScrollIndicator={false}
              style={styles.carousel}
              contentContainerStyle={{ paddingHorizontal: 20, gap: CARD_GAP }}
              onScroll={(e) => setSlide(Math.round(e.nativeEvent.contentOffset.x / (cardW + CARD_GAP)))}
              scrollEventThrottle={32}
            >
              {next.map((s) => (
                <View key={s.id} style={{ width: cardW }}>
                  <NextCard stub={s} />
                </View>
              ))}
            </ScrollView>
            {next.length > 1 && (
              <View style={styles.dots} accessibilityLabel={`Ticket ${Math.min(slide, next.length - 1) + 1} of ${next.length}`}>
                {next.map((s, i) => (
                  <View key={s.id} style={[styles.dot, i === Math.min(slide, next.length - 1) && styles.dotOn]} />
                ))}
              </View>
            )}
          </View>
        )}

        {list.length > 0 && (
          <View style={styles.section}>
            <View style={styles.rowBetween}>
              <Text style={label}>Coming up</Text>
              <Text style={styles.hint}>Swipe left to archive</Text>
            </View>
            {list.map((e) =>
              'trip' in e ? (
                <TripRow key={e.trip.id} trip={e.trip} />
              ) : (
                <SwipeRow key={e.stub.id} stub={e.stub} action="archive">
                  <StubRow stub={e.stub} countdown />
                </SwipeRow>
              ),
            )}
          </View>
        )}

        {groups.past.length > 0 && (
          <View style={styles.section}>
            <View style={styles.rowBetween}>
              <Text style={label}>Past</Text>
              <Text style={styles.hint}>Swipe left to archive</Text>
            </View>
            {groups.past.map((s) => (
              <SwipeRow key={s.id} stub={s} action="archive">
                <StubRow stub={s} />
              </SwipeRow>
            ))}
          </View>
        )}

        {!empty && (
          <View style={styles.section}>
            <Text style={label}>Add</Text>
            <View style={styles.tiles}>
              {[
                { icon: 'doc' as const, text: 'From Mail', onPress: () => router.push('/mail-help') },
                { icon: 'photo' as const, text: 'Photos', onPress: add.photos },
                { icon: 'doc' as const, text: 'PDF from Files', onPress: add.pdf },
                { icon: 'home' as const, text: 'Check-in details', onPress: () => router.push('/paste') },
              ].map((t) => (
                <Pressable
                  key={t.text}
                  accessibilityRole="button"
                  onPress={t.onPress}
                  style={({ pressed }) => [styles.tile, pressed && { opacity: 0.7 }]}
                >
                  <View style={styles.tileIcon}>
                    <Icon name={t.icon} size={18} color={colors.ink} stroke={2.2} />
                  </View>
                  <Text style={styles.tileText}>{t.text}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {groups.archive.length > 0 && (
          <View style={styles.pastBlock}>
            <View style={styles.pastBar}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: showPast }}
                onPress={() => setShowPast((v) => !v)}
                style={styles.pastToggle}
                hitSlop={8}
              >
                <Text style={styles.pastText}>Archive · {groups.archive.length}</Text>
                <Icon name={showPast ? 'chevronUp' : 'chevronDown'} size={16} color={colors.inkSoft} stroke={2.2} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  Alert.alert(
                    'Clear the archive?',
                    `Deletes ${groups.archive.length} archived item${groups.archive.length > 1 ? 's' : ''} for good.`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Clear', style: 'destructive', onPress: clearPast },
                    ],
                  )
                }
                style={({ pressed }) => [styles.outlineBtn, pressed && { opacity: 0.6 }]}
              >
                <Text style={styles.outlineBtnText}>Clear</Text>
              </Pressable>
            </View>
            {showPast && (
              <>
                <Text style={[styles.hint, styles.archiveHint]}>Swipe left to delete. Open one and tap Not used yet to bring it back.</Text>
                {groups.archive.map((s) => (
                  <SwipeRow key={s.id} stub={s} action="delete">
                    <StubRow stub={s} faded />
                  </SwipeRow>
                ))}
              </>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}


function NextCard({ stub }: { stub: Stub }) {
  const themePhoto = useStore((s) => s.settings.themePhoto);
  const holoAll = useStore((s) => s.settings.holoAll);
  // Its own photo first, then the background photo set for all tickets.
  const cover = stub.cover ?? themePhoto;
  const when = relativeDay(stub.date);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${stub.title}, ${when}${stub.time ? ` at ${stub.time}` : ''}. Show code.`}
      onPress={() => openStub(stub.id)}
      style={({ pressed }) => pressed && { transform: [{ scale: 0.985 }] }}
    >
      <Perforated
        color={ticketDeep(stub.color, colors.night)}
        ground={colors.ground}
        rule={colors.nightRule}
        top={
          <View style={styles.todayTop}>
            {cover && (
              <>
                <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
                <View style={[StyleSheet.absoluteFill, styles.coverShade]} />
              </>
            )}
            {(stub.holo || holoAll) && <Holo />}
            <View style={styles.rowBetween}>
              <View style={[styles.tag, { backgroundColor: ticketAccent(stub.color, colors.accent) }]}>
                <Text style={styles.tagText}>{kindLabel(stub)}</Text>
              </View>
              {companyOf(stub) ? (
                <CompanyMark small onDark name={companyOf(stub)!} accent={ticketAccent(stub.color, colors.accent)} />
              ) : (
                <Text style={styles.todayMeta}>{ticketCount(stub)}</Text>
              )}
            </View>
            {/* Same height for every card: long names shrink to fit two lines, details stay on one. */}
            <View style={styles.todayTitleBox}>
              <Text style={styles.todayTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.55}>
                {stub.title}
              </Text>
            </View>
            <Text style={styles.todaySub} numberOfLines={1}>
              {subLine(stub, when)}
            </Text>
          </View>
        }
        bottom={
          <View style={[styles.rowBetween, styles.todayBottom]}>
            <Text style={styles.todayMeta}>{stub.kind === 'stay' ? 'Address, door code, Wi-Fi' : 'Tap to show code'}</Text>
            <View style={[styles.pill, { backgroundColor: ticketAccent(stub.color, colors.accent) }]}>
              <Text style={styles.pillText}>{stub.kind === 'stay' ? 'Open' : 'Show code'}</Text>
              <Icon name="arrow" size={16} color={colors.ink} />
            </View>
          </View>
        }
      />
    </Pressable>
  );
}

function StubRow({ stub, faded, countdown }: { stub: Stub; faded?: boolean; countdown?: boolean }) {
  const days = daysBetween(dayKey(), stub.date);
  const meta = countdown
    ? [fmt.short(stub.date), stub.time, kindLabel(stub), stub.tickets.length > 1 ? ticketCount(stub) : ''].filter(Boolean).join(' · ')
    : [companyOf(stub) ?? kindLabel(stub), stub.time, stub.kind === 'stay' ? ticketCount(stub) || relativeDay(stub.date) : stub.tickets.length > 1 ? ticketCount(stub) : relativeDay(stub.date)]
        .filter(Boolean)
        .join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${stub.title}, ${fmt.long(stub.date)}`}
      onPress={() => openStub(stub.id)}
      style={({ pressed }) => [styles.row, faded && { opacity: 0.6 }, pressed && { opacity: 0.8 }]}
    >
      {countdown ? (
        <View style={styles.rowDate} accessibilityLabel={days <= 0 ? 'Today' : `In ${days} day${days === 1 ? '' : 's'}`}>
          <Text style={[styles.rowDay, days > 99 && { fontSize: 24 }]}>{days <= 0 ? 'NOW' : days}</Text>
          <Text style={styles.rowDow}>{days <= 0 ? 'TODAY' : days === 1 ? 'DAY' : 'DAYS'}</Text>
        </View>
      ) : (
        <View style={styles.rowDate}>
          <Text style={styles.rowDay}>{fmt.dayNum(stub.date)}</Text>
          <Text style={styles.rowDow}>{fmt.dow(stub.date)}</Text>
        </View>
      )}
      <View style={styles.rowRule} />
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {stub.title}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
    </Pressable>
  );
}

/** One row for a whole trip: where, when, and what's booked. */
function TripRow({ trip }: { trip: Trip }) {
  const today = dayKey();
  const days = daysBetween(today, trip.start);
  const away = trip.start <= today;
  const nights = tripNights(trip);
  const kinds = [...new Set(trip.items.map((s) => iconFor(s.kind)))];
  const accent = ticketAccent(trip.items[0]?.color, colors.accent);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Trip to ${trip.name}, ${tripDates(trip.start, trip.end)}, ${trip.items.length} bookings`}
      onPress={() => router.push({ pathname: '/trip/[id]', params: { id: trip.id } })}
      style={({ pressed }) => [styles.tripRow, pressed && { opacity: 0.85 }]}
    >
      <View style={[styles.rowDate, styles.tripDate, { backgroundColor: accent }]}>
        <Text style={[styles.rowDay, days > 99 && { fontSize: 24 }]}>{away ? 'NOW' : days}</Text>
        <Text style={[styles.rowDow, { color: colors.ink }]}>{away ? 'AWAY' : days === 1 ? 'DAY' : 'DAYS'}</Text>
      </View>
      <View style={styles.tripBody}>
        <Text style={styles.tripKicker}>Trip</Text>
        <Text style={styles.tripName} numberOfLines={1}>
          {trip.name}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {[tripDates(trip.start, trip.end), nights ? `${nights} night${nights === 1 ? '' : 's'}` : '', `${trip.items.length} booked`].filter(Boolean).join(' · ')}
        </Text>
        <View style={styles.tripIcons}>
          {kinds.map((k) => (
            <View key={k} style={styles.tripIcon}>
              <Icon name={k} size={14} color={colors.ink} stroke={2.2} />
            </View>
          ))}
        </View>
      </View>
      <View style={styles.tripArrow}>
        <Icon name="arrow" size={18} color={colors.ink} />
      </View>
    </Pressable>
  );
}

/** Swipe left to archive (home list) or delete (Archive), with undo. */
function SwipeRow({ stub, action, children }: { stub: Stub; action: 'archive' | 'delete'; children: React.ReactNode }) {
  const archive = action === 'archive';
  return (
    <ReanimatedSwipeable
      friction={1.6}
      rightThreshold={60}
      overshootRight={false}
      onSwipeableOpen={() => (archive ? archiveWithUndo(stub) : deleteWithUndo(stub))}
      renderRightActions={() => (
        <View style={[styles.swipeAction, { backgroundColor: archive ? colors.ink : colors.danger }]}>
          <Icon name={archive ? 'archive' : 'trash'} color={colors.paper} size={22} stroke={2.2} />
        </View>
      )}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

function EmptyState({ onAdd, onSample }: { onAdd: () => void; onSample: () => void }) {
  return (
    <Perforated
      color={colors.paper}
      ground={colors.ground}
      style={{ marginTop: 8 }}
      top={
        <View style={styles.emptyTop}>
          <Text style={label}>Admit one</Text>
          <Text style={styles.emptyTitle}>Nothing stashed yet</Text>
          <Text style={styles.emptyBody}>
            In Mail, tap your ticket PDF, then Share → Stash. Or add a screenshot. It shows up here, and Stash pings you on
            the day.
          </Text>
        </View>
      }
      bottom={
        <View style={styles.emptyBottom}>
          <Pressable
            accessibilityRole="button"
            onPress={onAdd}
            style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]}
          >
            <Icon name="plus" size={18} color={colors.ink} />
            <Text style={styles.primaryText}>Add your first ticket</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Adds a demo ticket you can delete any time"
            onPress={onSample}
            style={({ pressed }) => [styles.sampleButton, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.sampleText}>Try a sample ticket</Text>
          </Pressable>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  content: { paddingHorizontal: 20, gap: 24 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  headerButtons: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wordmark: { fontFamily: fonts.display, fontSize: 48, textTransform: 'uppercase', color: colors.ink },
  section: { gap: 10 },
  carousel: { marginHorizontal: -20 },
  hint: { fontFamily: fonts.mono, fontSize: 11, color: colors.inkFaint },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingTop: 2 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.rule },
  dotOn: { width: 20, backgroundColor: colors.ink },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },

  todayTop: { padding: 20, paddingBottom: 18, gap: 10, height: 236, justifyContent: 'space-between' },
  todayTitleBox: { flex: 1, justifyContent: 'center' },
  todayBottom: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 18 },
  tag: { backgroundColor: colors.accent, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4 },
  tagText: { fontFamily: fonts.monoBold, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: colors.ink },
  coverShade: { backgroundColor: 'rgba(17,17,17,0.5)' },
  todayTitle: { fontFamily: fonts.display, fontSize: 40, textTransform: 'uppercase', color: colors.nightText },
  todaySub: { fontFamily: fonts.mono, fontSize: 13, color: '#D6D6CF' },
  todayMeta: { fontFamily: fonts.mono, fontSize: 12, color: colors.nightSoft },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  pillText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink },

  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexBasis: '47%', flexGrow: 1, backgroundColor: colors.paper, borderRadius: 14, padding: 14, gap: 10, minHeight: 92 },
  tileIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.ground, alignItems: 'center', justifyContent: 'center' },
  tileText: { fontFamily: fonts.bodyBold, fontSize: 14, lineHeight: 18, color: colors.ink },
  tripRow: { backgroundColor: colors.paper, borderRadius: 14, flexDirection: 'row', alignItems: 'stretch', minHeight: 112, overflow: 'hidden' },
  tripDate: { borderTopLeftRadius: 14, borderBottomLeftRadius: 14 },
  tripBody: { flex: 1, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center', gap: 4 },
  tripKicker: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.inkSoft },
  tripName: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, textTransform: 'uppercase', color: colors.ink },
  tripIcons: { flexDirection: 'row', gap: 6, marginTop: 4 },
  tripIcon: { width: 26, height: 26, borderRadius: 8, backgroundColor: colors.ground, alignItems: 'center', justifyContent: 'center' },
  tripArrow: { justifyContent: 'center', paddingRight: 16 },
  row: { backgroundColor: colors.paper, borderRadius: 14, flexDirection: 'row', alignItems: 'stretch', height: 76 },
  rowDate: { width: 74, alignItems: 'center', justifyContent: 'center' },
  rowDay: { fontFamily: fonts.display, fontSize: 30, color: colors.ink },
  rowDow: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1, color: colors.inkSoft },
  rowRule: { borderLeftWidth: 2, borderStyle: 'dashed', borderColor: colors.perforation, marginVertical: 10 },
  rowBody: { flex: 1, paddingHorizontal: 16, justifyContent: 'center', gap: 4 },
  rowTitle: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.ink, textTransform: 'uppercase' },
  rowMeta: { fontFamily: fonts.mono, fontSize: 12, color: colors.inkSoft },
  swipeAction: {
    width: 88,
    marginLeft: 10,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  pastBlock: { gap: 10, borderTopWidth: 1, borderColor: colors.rule, paddingTop: 14 },
  pastBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  pastToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minHeight: 44 },
  pastText: { fontFamily: fonts.mono, fontSize: 12, color: colors.inkSoft, flexShrink: 1 },
  archiveHint: { lineHeight: 16 },
  outlineBtn: { borderWidth: 1.5, borderColor: colors.ink, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  outlineBtnText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.ink },

  emptyTop: { padding: 22, gap: 10 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 44, textTransform: 'uppercase', color: colors.ink },
  emptyBody: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23, color: colors.inkSoft },
  emptyBottom: { padding: 20, gap: 6 },
  sampleButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  sampleText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink, textDecorationLine: 'underline' },
  primary: {
    height: 54,
    borderRadius: 999,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryText: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink },
});
