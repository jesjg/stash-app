import { router } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CodeView } from '../components/CodeView';
import { Icon } from '../components/Icon';
import { Logo } from '../components/Logo';
import { Perforated } from '../components/Perforated';
import { askPersistentBanners } from '../lib/persistent';
import { reminderStatus } from '../lib/reminders';
import { ensureReminders, setSettings } from '../lib/store';
import type { Ticket } from '../lib/types';
import { colors, font, label } from '../theme';

const SAMPLE: Ticket = { id: 'intro', pageUri: '', code: { symbology: 'qr', payload: 'STASH-INTRO-0001', cropUri: '' } };

type Slide = { kicker: string; title: string; body: string; art: ReactNode };

function TicketArt() {
  return (
    <View style={art.stack}>
      <View style={[art.behind, { backgroundColor: colors.ink, transform: [{ rotate: '-9deg' }, { translateX: -18 }] }]} />
      <View style={[art.behind, { backgroundColor: colors.accent, transform: [{ rotate: '6deg' }, { translateX: 14 }] }]} />
      <Perforated
        color={colors.paper}
        ground={colors.ground}
        style={art.ticket}
        top={
          <View style={art.top}>
            <Text style={label}>Ferry · Wed 14 Oct</Text>
            <Text style={art.title} numberOfLines={2}>
              Nidri → Kefalonia
            </Text>
          </View>
        }
        bottom={
          <View style={art.codeWrap}>
            <CodeView ticket={SAMPLE} size={112} />
          </View>
        }
      />
    </View>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <View style={art.step}>
      <View style={art.stepNum}>
        <Text style={art.stepNumText}>{n}</Text>
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

/** Mail, step by step: tap the attachment, tap Share, tap Stash. */
export function MailArt() {
  return (
    <View style={art.mail}>
      <Step n={1}>
        <Text style={art.stepText}>Open the email and tap the ticket</Text>
        <View style={art.attach}>
          <Icon name="doc" size={16} color={colors.ink} stroke={2.2} />
          <Text style={art.attachText}>Tickets.pdf</Text>
        </View>
      </Step>
      <Step n={2}>
        <Text style={art.stepText}>Tap Share</Text>
        <View style={art.shareIconBox}>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <Path d="M12 3v12M7 8l5-5 5 5M5 12v8h14v-8" stroke={colors.ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </View>
      </Step>
      <Step n={3}>
        <Text style={art.stepText}>Tap Stash in the app row</Text>
        <View style={art.appRow}>
          {['#5AC8FA', '#34C759', '#FFCC00'].map((c) => (
            <View key={c} style={[art.appDot, { backgroundColor: c }]} />
          ))}
          <View style={[art.appDot, art.appStash]}>
            <Icon name="ticket" size={16} color={colors.onAccent} stroke={2.4} />
          </View>
        </View>
      </Step>
      <Text style={art.mailTip}>No Stash? Swipe the app row to More, then add Stash to Favourites so it’s first next time.</Text>
    </View>
  );
}

function ShareArt() {
  const rows: { icon: 'doc' | 'photo'; text: string; from: string }[] = [
    { icon: 'doc', text: 'PDF ticket', from: 'Mail · Files' },
    { icon: 'photo', text: 'Photos', from: 'Screenshots' },
  ];
  return (
    <View style={art.share}>
      {rows.map((r) => (
        <View key={r.text} style={art.shareRow}>
          <View style={art.shareIcon}>
            <Icon name={r.icon} size={18} color={colors.ink} stroke={2.2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={art.shareText}>{r.text}</Text>
            <Text style={art.shareFrom}>{r.from}</Text>
          </View>
        </View>
      ))}
      <Icon name="chevronDown" size={26} color={colors.inkSoft} stroke={2.4} />
      <View style={art.stashPill}>
        <Icon name="ticket" size={20} color={colors.onAccent} stroke={2.4} />
        <Text style={art.stashText}>Share → Stash</Text>
      </View>
    </View>
  );
}

function ReadArt() {
  const fields = [
    ['Date', '14 Nov'],
    ['Time', '19:30'],
    ['Section', 'Stalls'],
    ['Seat', 'J12'],
    ['Entrance', 'B'],
    ['Ref', 'K7XQ2LM'],
  ];
  return (
    <Perforated
      color={colors.paper}
      ground={colors.ground}
      style={art.readCard}
      top={
        <View style={art.top}>
          <Text style={label}>Theatre</Text>
          <Text style={art.title}>Your show</Text>
        </View>
      }
      bottom={
        <View style={art.grid}>
          {fields.map(([k, v]) => (
            <View key={k} style={art.field}>
              <Text style={art.fieldLabel}>{k}</Text>
              <Text style={art.fieldValue}>{v}</Text>
              <View style={art.mark} />
            </View>
          ))}
        </View>
      }
    />
  );
}

function LockArt() {
  return (
    <View style={art.phone}>
      <Text style={art.clock}>08:00</Text>
      <Text style={art.date}>Wednesday 14 October</Text>
      <View style={art.note}>
        <View style={art.noteIcon}>
          <Icon name="ticket" size={16} color={colors.onAccent} stroke={2.4} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={art.noteApp}>STASH · now</Text>
          <Text style={art.noteTitle}>Ferry today at 09:30</Text>
          <Text style={art.noteBody}>Seat 23A · Tap for your ticket</Text>
        </View>
      </View>
    </View>
  );
}

const SLIDES: Slide[] = [
  {
    kicker: 'Welcome to Stash',
    title: 'Every ticket. One place.',
    body: 'For the QR tickets that won’t go in Apple Wallet: gigs, theatre, ferries, trains, waterparks. Filed by date, ready when you are.',
    art: <TicketArt />,
  },
  {
    kicker: 'From your email',
    title: 'Share it to Stash',
    body: 'Most tickets arrive by email. Tap the ticket, tap Share, then Stash. Only a “View tickets” button? Open it, screenshot the ticket and add the screenshot.',
    art: <MailArt />,
  },
  {
    kicker: 'Everything else',
    title: 'Screenshots and links too',
    body: 'Tap + for a screenshot or a PDF. Staying in an Airbnb? Tap + → Paste check-in details and Stash keeps the address, door code and Wi-Fi together.',
    art: <ShareArt />,
  },
  {
    kicker: 'Reading',
    title: 'It reads the ticket for you',
    body: 'Date, time, seat, gate and booking ref are filled in. You just check and save. It all happens on your phone; nothing is uploaded.',
    art: <ReadArt />,
  },
  {
    kicker: 'On the day',
    title: 'Right there when you need it',
    body: 'A reminder 2 hours before (or 8am), and the ticket on your lock screen. Tap it and the code opens at full brightness.',
    art: <LockArt />,
  },
];

export default function Intro() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scroller = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const last = page === SLIDES.length - 1;

  const finish = () => {
    setSettings({ introSeen: true });
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const next = async () => {
    if (!last) {
      scroller.current?.scrollTo({ x: width * (page + 1), animated: true });
      return;
    }
    const before = await reminderStatus();
    if (before === 'ask') await ensureReminders(true);
    finish();
    if (before === 'ask' && (await reminderStatus()) === 'on') setTimeout(askPersistentBanners, 700);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.bar}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Logo size={36} />
          <Text style={styles.brand}>Stash</Text>
        </View>
        {!last && (
          <Pressable accessibilityRole="button" hitSlop={12} onPress={finish}>
            <Text style={styles.skip}>Skip</Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        scrollEventThrottle={32}
        style={{ flex: 1 }}
      >
        {SLIDES.map((s) => (
          <ScrollView
            key={s.title}
            style={{ width }}
            contentContainerStyle={styles.slide}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={styles.artArea}>{s.art}</View>
            <View style={styles.copy}>
              <Text style={[label, { color: colors.accent }]}>{s.kicker}</Text>
              <Text style={styles.title}>{s.title}</Text>
              <Text style={styles.body}>{s.body}</Text>
            </View>
          </ScrollView>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots} accessibilityLabel={`Page ${page + 1} of ${SLIDES.length}`}>
          {SLIDES.map((s, i) => (
            <View key={s.title} style={[styles.dot, i === page && styles.dotOn]} />
          ))}
        </View>
        <Pressable accessibilityRole="button" onPress={next} style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]}>
          <Text style={styles.primaryText}>{last ? 'Turn on reminders' : 'Next'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={finish}
          style={[styles.ghost, !last && { opacity: 0 }]}
          disabled={!last}
          accessibilityElementsHidden={!last}
        >
          <Text style={styles.ghostText}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  bar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, minHeight: 44 },
  brand: { ...font.display, fontSize: 21, textTransform: 'uppercase', color: colors.ink },
  skip: { ...font.bodyMedium, fontSize: 16, color: colors.inkSoft },
  slide: { flexGrow: 1, paddingHorizontal: 24 },
  artArea: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', minHeight: 240, paddingVertical: 12 },
  copy: { gap: 10, paddingBottom: 8 },
  title: { ...font.display, fontSize: 30, color: colors.ink },
  body: { ...font.body, fontSize: 17, lineHeight: 24, color: colors.ink },
  footer: { paddingHorizontal: 24, gap: 14, paddingTop: 12 },
  dots: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.rule },
  dotOn: { width: 24, backgroundColor: colors.ink },
  primary: { height: 56, borderRadius: 999, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  primaryText: { ...font.bodyBold, fontSize: 17, color: colors.onAccent },
  ghost: { minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  ghostText: { ...font.bodyMedium, fontSize: 15, color: colors.inkSoft },
});

const art = StyleSheet.create({
  stack: { width: 240, alignItems: 'center', justifyContent: 'center' },
  behind: { position: 'absolute', width: 210, height: 250, borderRadius: 18 },
  ticket: { width: 230 },
  top: { padding: 18, gap: 6 },
  title: { ...font.display, fontSize: 22, color: colors.ink },
  codeWrap: { alignItems: 'center', paddingVertical: 18 },

  mail: { width: '100%', maxWidth: 330, gap: 10 },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', backgroundColor: colors.paper, borderRadius: 14, padding: 12 },
  stepNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { ...font.monoBold, fontSize: 13, color: colors.accent },
  stepText: { ...font.bodyBold, fontSize: 15, color: colors.ink, marginBottom: 8, marginTop: 3 },
  attach: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderColor: colors.rule,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  attachText: { ...font.mono, fontSize: 13, color: colors.ink },
  shareIconBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.paperWarm, alignItems: 'center', justifyContent: 'center' },
  appRow: { flexDirection: 'row', gap: 10 },
  appDot: { width: 36, height: 36, borderRadius: 10, opacity: 0.35 },
  appStash: { opacity: 1, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.ink },
  mailTip: { ...font.mono, fontSize: 12, lineHeight: 17, color: colors.inkSoft, paddingHorizontal: 4 },

  share: { width: '100%', maxWidth: 320, alignItems: 'center', gap: 10 },
  shareRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.paper,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  shareIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.paperWarm, alignItems: 'center', justifyContent: 'center' },
  shareText: { ...font.bodyBold, fontSize: 16, color: colors.ink },
  shareFrom: { ...font.mono, fontSize: 12, color: colors.inkSoft },
  stashPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 22,
    paddingVertical: 14,
  },
  stashText: { ...font.bodyBold, fontSize: 17, color: colors.onAccent },

  readCard: { width: '100%', maxWidth: 320 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 18, paddingVertical: 14, rowGap: 14 },
  field: { width: '33.33%', gap: 2 },
  fieldLabel: { ...font.mono, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.inkSoft },
  fieldValue: { ...font.bodyBold, fontSize: 18, color: colors.ink },
  mark: { height: 3, width: 28, borderRadius: 2, backgroundColor: colors.accent, marginTop: 2 },

  phone: {
    width: 250,
    height: 300,
    borderRadius: 34,
    backgroundColor: colors.night,
    alignItems: 'center',
    paddingTop: 34,
    paddingHorizontal: 12,
    gap: 2,
  },
  clock: { ...font.display, fontSize: 47, color: colors.nightText },
  date: { ...font.bodyMedium, fontSize: 14, color: colors.nightSoft, marginBottom: 22 },
  note: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(244,244,240,0.14)',
    borderRadius: 18,
    padding: 12,
  },
  noteIcon: { width: 32, height: 32, borderRadius: 9, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  noteApp: { ...font.mono, fontSize: 10, letterSpacing: 1, color: colors.nightSoft },
  noteTitle: { ...font.bodyBold, fontSize: 14, color: colors.nightText },
  noteBody: { ...font.body, fontSize: 13, color: colors.nightText },
});
