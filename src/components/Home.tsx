import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './Icon';
import { Logo } from './Logo';
import { NotifyPrompt } from './NotifyPrompt';
import { Perforated } from './Perforated';
import { WalletTicket } from './WalletTicket';
import { ticketType } from '../lib/ticketTypes';
import { ScreenshotCards } from './ScreenshotCards';
import { RoundButton } from './RoundButton';
import { showToast } from './Toast';
import { dayKey, daysBetween, fmt } from '../lib/dates';
import { addSampleTicket, clearPast, groupStubs, removeStub, setUsed, useStore } from '../lib/store';
import { KINDS, type Stub } from '../lib/types';
import { useAddTicket } from '../lib/useAddTicket';
import { colors, font, label } from '../theme';

const kindLabel = (s: Stub) => KINDS.find((k) => k.id === s.kind)?.label ?? 'Ticket';
const NEXT_COUNT = 5;
const CARD_GAP = 12;
// Home screen spec: white screen, light grey rows, black text, violet add button.
const SCREEN = '#FFFFFF';
const SOFT_BG = '#F7F7F7';
const SOFT_BG_DARK = '#F2F2F2';
const INK = '#111111';
const SOFT = '#666666';
const VIOLET = '#9747FF';
const SHADOW_ROOM = 32;
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
  // Narrow like a Wallet pass.
  const cardW = Math.min(width - 96, 320);
  // Cards line up with the screen's 20pt margin; the next one peeks in on the right. The end
  // padding lets the last card snap to the same spot.
  const endPad = width - 20 - cardW;
  // The next few tickets go in the carousel; everything after that is listed below.
  const live = useMemo(() => [...groups.today, ...groups.upcoming], [groups]);
  const next = live.slice(0, NEXT_COUNT);
  // Everything ahead, counting down (plus anything today that didn't fit in the carousel).
  const comingUp = useMemo(() => live.filter((s, i) => s.date > today || i >= NEXT_COUNT), [live, today]);
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
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 8, paddingBottom: 40 }]}
      >
        <View style={styles.header}>
          <View style={styles.rowBetween}>
            <View style={styles.brandRow}>
              <Logo size={36} />
              <Text style={styles.wordmark}>Stash</Text>
            </View>
            <View style={styles.headerButtons}>
              <RoundButton label="Settings" color={SOFT_BG_DARK} onPress={() => router.push('/settings')} size={44}>
                <Icon name="settings" color={INK} size={20} stroke={2} />
              </RoundButton>
              <RoundButton label="Add ticket" color={VIOLET} onPress={add.open} size={44}>
                {add.busy ? <ActivityIndicator color="#FFFFFF" /> : <Icon name="plus" color="#FFFFFF" size={20} stroke={2.5} />}
              </RoundButton>
            </View>
          </View>
          <Text style={styles.today}>{fmt.full(today)}</Text>
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
              <Text style={styles.sectionLabel}>Next up</Text>
              {next.length > 1 && <Text style={styles.hint}>Swipe for more</Text>}
            </View>
            <ScrollView
              horizontal
              decelerationRate="fast"
              snapToInterval={cardW + CARD_GAP}
              snapToAlignment="start"
              showsHorizontalScrollIndicator={false}
              style={styles.carousel}
              contentContainerStyle={{ paddingLeft: 20, paddingRight: endPad, paddingVertical: SHADOW_ROOM, gap: CARD_GAP }}
              onScroll={(e) => setSlide(Math.round(e.nativeEvent.contentOffset.x / (cardW + CARD_GAP)))}
              scrollEventThrottle={32}
            >
              {next.map((s, i) => (
                <View key={s.id} style={{ width: cardW }}>
                  <NextCard stub={s} active={i === Math.min(slide, next.length - 1)} />
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

        {comingUp.length > 0 && (
          <View style={styles.section}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionLabel}>Coming up</Text>
              <Text style={styles.hint}>{`${comingUp.length} ticket${comingUp.length === 1 ? '' : 's'}`}</Text>
            </View>
            {comingUp.map((s) => (
              <SwipeRow key={s.id} stub={s} action="archive">
                <StubRow stub={s} countdown />
              </SwipeRow>
            ))}
          </View>
        )}

        {groups.past.length > 0 && (
          <View style={styles.section}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionLabel}>Past</Text>
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
            <Text style={styles.sectionLabel}>Add</Text>
            <View style={styles.tiles}>
              {[
                { icon: 'doc' as const, text: 'From Mail', onPress: () => router.push('/mail-help') },
                { icon: 'photo' as const, text: 'Photos', onPress: add.photos },
                { icon: 'doc' as const, text: 'PDF from Files', onPress: add.pdf },
                ...(add.canScanPaper ? [{ icon: 'ticket' as const, text: 'Paper ticket', onPress: add.paper }] : []),
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


function NextCard({ stub, active }: { stub: Stub; active: boolean }) {
  return (
    <WalletTicket
      compact
      active={active}
      stub={stub}
      onPress={() => openStub(stub.id)}
    />
  );
}

/** "Today", "Tomorrow" or "In 12 days" (never the date, which the row shows next to it). */
/** A row filled with the ticket type's colour, with a tear-off stub counting the days (or the date, once past). */
function StubRow({ stub, faded, countdown }: { stub: Stub; faded?: boolean; countdown?: boolean }) {
  const type = ticketType(stub.kind);
  const days = daysBetween(dayKey(), stub.date);
  const [big, small] = countdown
    ? days <= 0
      ? ['0', 'TODAY']
      : [String(days), days === 1 ? 'DAY' : 'DAYS']
    : [String(Number(fmt.dayNum(stub.date))), fmt.mon(stub.date).toUpperCase()];
  const meta = [kindLabel(stub), fmt.short(stub.date)].join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${stub.title}, ${kindLabel(stub)}, ${fmt.long(stub.date)}${countdown ? `, ${days <= 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`}` : ''}`}
      onPress={() => openStub(stub.id)}
      style={({ pressed }) => [styles.row, { backgroundColor: type.color }, faded && { opacity: 0.55 }, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.rowBadge}>
        <Icon name={type.icon} size={20} color={type.color} stroke={2} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {stub.title}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <View style={styles.rowTear} />
      <View style={styles.rowStub}>
        <Text style={styles.rowDays}>{big}</Text>
        <Text style={styles.rowDaysLabel}>{small}</Text>
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
      color={SOFT_BG}
      ground={SCREEN}
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
            <Icon name="plus" size={18} color={colors.onAccent} />
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
  screen: { flex: 1, backgroundColor: SCREEN },
  content: { paddingHorizontal: 20, gap: 24 },
  header: { gap: 12, marginBottom: -4 },
  headerButtons: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wordmark: { fontSize: 26, fontWeight: '800', letterSpacing: -0.8, color: INK },
  today: { fontSize: 15, fontWeight: '600', color: SOFT },
  sectionLabel: { fontSize: 13, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', color: SOFT },
  section: { gap: 10 },
  // Room for the cards' shadow to fade out; the scroll view clips anything outside it.
  carousel: { marginHorizontal: -20, marginVertical: -SHADOW_ROOM },
  hint: { fontSize: 13, fontWeight: '500', color: SOFT },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingTop: 2 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#D4D4D4' },
  dotOn: { width: 22, backgroundColor: INK },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },


  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexBasis: '47%', flexGrow: 1, backgroundColor: SOFT_BG, borderRadius: 20, padding: 14, gap: 10, minHeight: 92 },
  tileIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: SCREEN, alignItems: 'center', justifyContent: 'center' },
  tileText: { ...font.bodyBold, fontSize: 14, lineHeight: 18, color: colors.ink },
  // Coming up rows: the type's colour, white text, a dashed tear and the countdown stub on the right.
  row: { borderRadius: 20, flexDirection: 'row', alignItems: 'stretch', minHeight: 68, paddingLeft: 14 },
  rowBadge: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  rowBody: { flex: 1, justifyContent: 'center', gap: 2, paddingHorizontal: 12, paddingVertical: 12 },
  rowTitle: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3, color: '#FFFFFF' },
  rowMeta: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.9)' },
  rowTear: { width: 0, borderLeftWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.6)' },
  rowStub: { width: 64, alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  rowDays: { fontSize: 22, lineHeight: 24, fontWeight: '800', color: '#FFFFFF', fontVariant: ['tabular-nums'] },
  rowDaysLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, color: '#FFFFFF' },
  swipeAction: {
    width: 88,
    marginLeft: 10,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  pastBlock: { gap: 10, borderTopWidth: 1, borderColor: colors.rule, paddingTop: 14 },
  pastBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  pastToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minHeight: 44 },
  pastText: { ...font.mono, fontSize: 12, color: colors.inkSoft, flexShrink: 1 },
  archiveHint: { lineHeight: 16 },
  outlineBtn: { borderWidth: 1.5, borderColor: colors.ink, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  outlineBtnText: { ...font.bodyBold, fontSize: 13, color: colors.ink },

  emptyTop: { padding: 22, gap: 10 },
  emptyTitle: { ...font.display, fontSize: 33, color: colors.ink },
  emptyBody: { ...font.body, fontSize: 16, lineHeight: 23, color: colors.inkSoft },
  emptyBottom: { padding: 20, gap: 6 },
  sampleButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  sampleText: { ...font.bodyBold, fontSize: 15, color: colors.ink, textDecorationLine: 'underline' },
  primary: {
    height: 54,
    borderRadius: 999,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryText: { ...font.bodyBold, fontSize: 16, color: colors.onAccent },
});
