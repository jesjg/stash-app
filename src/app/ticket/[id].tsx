import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CodeView } from '../../components/CodeView';
import { StayCard } from '../../components/StayCard';
import { Icon } from '../../components/Icon';
import { fitCode, WalletTicket } from '../../components/WalletTicket';
import { RoundButton } from '../../components/RoundButton';
import { showToast } from '../../components/Toast';
import { canSendAll, sendAll, sendTicket } from '../../lib/send';
import { groupStubs, isArchived, isPast, removeStub, setUsed, useStore } from '../../lib/store';
import type { Stub } from '../../lib/types';
import { haptic } from '../../lib/native';
import { useMaxBrightness } from '../../lib/useMaxBrightness';
import { colors, font } from '../../theme';

const H_PAD = 16;
/** Ticket screen spec: white screen, black controls, system font. */
const SCREEN = '#FFFFFF';
const INK = '#111111';

export default function TicketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const all = useStore((s) => s.stubs);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pager = useRef<ScrollView>(null);

  // Swipe on to the next ticket or stay, in date order.
  // Something opened from Past or Archive stays on its own.
  const { pages, start } = useMemo(() => {
    const opened = all.find((x) => x.id === id);
    if (!opened) return { pages: [] as { stub: Stub; index: number }[], start: 0 };
    const g = groupStubs(all);
    const list = isArchived(opened) || isPast(opened) ? [opened] : [...g.today, ...g.upcoming];
    if (!list.some((s) => s.id === opened.id)) list.unshift(opened);
    const flat = list.flatMap((s) =>
      s.kind === 'stay' || !s.tickets.length ? [{ stub: s, index: 0 }] : s.tickets.map((_, index) => ({ stub: s, index })),
    );
    return {
      pages: flat,
      start: Math.max(
        0,
        flat.findIndex((p) => p.stub.id === opened.id),
      ),
    };
  }, [all, id]);
  const [current, setCurrent] = useState<number | null>(null);
  const at = Math.min(current ?? start, Math.max(0, pages.length - 1));
  const stub = pages[at]?.stub;
  const page = pages[at]?.index ?? 0;
  const stubIds = useMemo(() => [...new Set(pages.map((p) => p.stub.id))], [pages]);
  const positioned = useRef(false);
  const [tear] = useState(() => new Animated.Value(0));
  const tearing = useRef(false);
  useKeepAwake();
  useMaxBrightness(stub?.kind !== 'stay');

  if (!stub) {
    return (
      <View style={[styles.screen, styles.missing, { paddingTop: insets.top + 40 }]}>
        <Text style={styles.missingTitle}>Ticket gone</Text>
        <Text style={styles.missingBody}>It may have been deleted or auto-cleared.</Text>
        <Pressable onPress={() => router.replace('/')} style={styles.outline}>
          <Text style={styles.outlineText}>Back to Stash</Text>
        </Pressable>
      </View>
    );
  }

  const count = stub.tickets.length;

  const more = () => {
    const sample = !!stub.sample;
    const isStay = stub.kind === 'stay';
    const items: { label: string; run: () => void; destructive?: boolean }[] = [
      ...(isStay
        ? [
            {
              label: 'Send stay details',
              run: () => {
                const st = stub.stay ?? {};
                const lines = [
                  stub.title,
                  `Check-in: ${stub.date}${stub.time ? ` ${stub.time}` : ''}`,
                  st.checkOutDate || st.checkOutTime ? `Check-out: ${st.checkOutDate ?? ''} ${st.checkOutTime ?? ''}`.trim() : '',
                  st.address ? `Address: ${st.address}` : '',
                  st.doorCode ? `Door code: ${st.doorCode}` : '',
                  st.wifiName ? `Wi-Fi: ${st.wifiName}` : '',
                  st.wifiPassword ? `Wi-Fi password: ${st.wifiPassword}` : '',
                  st.phone ? `Host: ${[st.host, st.phone].filter(Boolean).join(' ')}` : '',
                ].filter(Boolean);
                Share.share({ message: lines.join('\n') });
              },
            },
          ]
        : []),
      ...(sample || isStay
        ? []
        : [
            {
              label: count > 1 ? `Send ticket ${page + 1}` : 'Send ticket',
              run: () => sendTicket(stub, page).catch((e) => Alert.alert("Couldn't send", String(e?.message ?? e))),
            },
          ]),
      ...(!sample && canSendAll(stub)
        ? [
            {
              label: `Send all ${count} tickets`,
              run: () => sendAll(stub).catch((e) => Alert.alert("Couldn't send", String(e?.message ?? e))),
            },
          ]
        : []),
      {
        label: 'Edit details',
        run: () => router.push({ pathname: '/edit/[id]', params: { id: stub.id } }),
      },
      {
        label: 'Delete',
        destructive: true,
        run: () => {
          router.back();
          const undo = removeStub(stub.id);
          showToast(`Deleted ${stub.title}`, { label: 'Undo', onPress: undo });
        },
      },
    ];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...items.map((i) => i.label), 'Cancel'],
          destructiveButtonIndex: items.findIndex((i) => i.destructive),
          cancelButtonIndex: items.length,
        },
        (i) => items[i]?.run(),
      );
    } else {
      Alert.alert(stub.title, undefined, [
        ...items.map((i) => ({
          text: i.label,
          style: i.destructive ? ('destructive' as const) : undefined,
          onPress: i.run,
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    }
  };

  const toggleUsed = async (stub: Stub) => {
    const used = !stub.usedAt;
    if (used && stub.kind !== 'stay' && !tearing.current) {
      // Tear the stub off along the dotted line, then file it in Archive.
      tearing.current = true;
      haptic('tear');
      await new Promise<void>((done) =>
        Animated.timing(tear, {
          toValue: 1,
          duration: 700,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }).start(() => done()),
      );
      haptic('success');
    }
    const undo = await setUsed(stub.id, used);
    if (used) {
      router.back();
      showToast('Moved to Archive', { label: 'Undo', onPress: undo });
    }
  };

  const actions = (stub: Stub, page: number) => (
    <View style={styles.bottomRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityHint={stub.usedAt ? 'Moves it back to your home screen' : 'Moves it to Archive'}
        onPress={() => toggleUsed(stub)}
        style={({ pressed }) => [styles.solid, styles.grow, pressed && { opacity: 0.8 }]}
      >
        <Text style={styles.solidText}>
          {stub.kind === 'stay' ? (stub.usedAt ? 'Not checked out' : 'Checked out') : stub.usedAt ? 'Not used yet' : 'Mark as used'}
        </Text>
      </Pressable>
      {stub.sample ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            router.back();
            removeStub(stub.id);
            showToast('Sample removed. Share a real ticket to Stash to add it.');
          }}
          style={({ pressed }) => [styles.outline, styles.grow, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.outlineText}>Remove sample</Text>
        </Pressable>
      ) : stub.kind === 'stay' && stub.tickets.some((t) => t.pageUri) ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/original/[id]', params: { id: stub.id } })}
          style={({ pressed }) => [styles.outline, styles.grow, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.outlineText}>Screenshots</Text>
        </Pressable>
      ) : stub.tickets[page]?.pageUri ? (
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Opens the ticket as it was sent to you"
          onPress={() =>
            router.push({
              pathname: '/original/[id]',
              params: { id: stub.id, page: stub.tickets[page].pageUri },
            })
          }
          style={({ pressed }) => [styles.outline, styles.grow, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.outlineText}>See original</Text>
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.scrollBody, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}
    >
      <View style={[styles.topBar, { paddingHorizontal: H_PAD }]}>
        <RoundButton label="Back" onPress={() => router.back()} size={48} color={INK}>
          <Icon name="back" color={colors.paper} />
        </RoundButton>
        {stubIds.length > 1 ? (
          <View style={styles.counter} accessibilityLabel={`${stubIds.indexOf(stub.id) + 1} of ${stubIds.length}. Swipe for the next.`}>
            <Text style={styles.counterText}>
              {stubIds.indexOf(stub.id) + 1} of {stubIds.length}
            </Text>
          </View>
        ) : count > 1 && stub.kind !== 'stay' ? (
          <View style={styles.counter}>
            <Text style={styles.counterText}>
              {page + 1} of {count}
            </Text>
          </View>
        ) : (
          <View />
        )}
        <RoundButton label="More options" onPress={more} size={48} color={INK}>
          <Icon name="more" color={colors.paper} />
        </RoundButton>
      </View>

      <View style={styles.below}>
        {pages.length > 1 && pages.length <= 14 && (
          <View style={styles.dots} accessibilityLabel={`Page ${at + 1} of ${pages.length}. Swipe for the next one.`}>
            {pages.map((p, i) => (
              <View
                key={`${p.stub.id}-${p.index}`}
                style={[styles.dot, i === at && styles.dotOn, i > 0 && pages[i - 1].stub.id !== p.stub.id && { marginLeft: 8 }]}
              />
            ))}
          </View>
        )}
        {pages.length > 1 && (
          <Text style={styles.swipeHint} numberOfLines={1}>
            {at < pages.length - 1
              ? pages[at + 1].stub.id === stub.id
                ? 'Swipe for the next ticket'
                : `Next: ${pages[at + 1].stub.title}`
              : 'Swipe back for earlier ones'}
          </Text>
        )}
      </View>

      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        // Room for the card's shadow to fade out; the scroll view clips anything outside it.
        style={{ flexGrow: 0, marginVertical: -32 }}
        contentContainerStyle={{ paddingVertical: 32 }}
        contentOffset={{ x: width * start, y: 0 }}
        onLayout={() => {
          // Open on the ticket that was tapped (contentOffset covers iOS; this covers Android).
          if (positioned.current) return;
          positioned.current = true;
          pager.current?.scrollTo({ x: width * start, animated: false });
        }}
        onMomentumScrollEnd={(e) => {
          const next = Math.round(e.nativeEvent.contentOffset.x / width);
          if (next !== at) haptic('tap');
          setCurrent(next);
        }}
      >
        {pages.map((p, i) => (
          <View key={`${p.stub.id}-${p.index}`} style={{ width, paddingHorizontal: H_PAD }}>
            {p.stub.kind === 'stay' ? (
              <View style={styles.pageBody}>
                <StayCard stub={p.stub} />
                {actions(p.stub, p.index)}
              </View>
            ) : (
              <View style={styles.pageBody}>
                <TicketCard stub={p.stub} index={p.index} tear={i === at ? tear : undefined}>
                  {p.stub.tickets[p.index] ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Ticket code"
                      accessibilityHint="Opens the original ticket"
                      onPress={() =>
                        !p.stub.sample &&
                        !!p.stub.tickets[p.index].pageUri &&
                        router.push({
                          pathname: '/original/[id]',
                          params: {
                            id: p.stub.id,
                            page: p.stub.tickets[p.index].pageUri,
                          },
                        })
                      }
                      style={({ pressed }) => pressed && { opacity: 0.85 }}
                    >
                      <CodeView ticket={p.stub.tickets[p.index]} size={fitCode(p.stub.tickets[p.index], 204)} />
                    </Pressable>
                  ) : null}
                </TicketCard>
                {actions(p.stub, p.index)}
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </ScrollView>
  );
}

function TicketCard({ stub, index, children, tear }: { stub: Stub; index: number; children: React.ReactNode; tear?: Animated.Value }) {
  return <WalletTicket stub={stub} index={index} tear={tear} code={children ?? undefined} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: SCREEN },
  scrollBody: { flexGrow: 1, gap: 16 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  counter: { height: 40, paddingHorizontal: 18, borderRadius: 20, backgroundColor: INK, justifyContent: 'center' },
  counterText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF', fontVariant: ['tabular-nums'] },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  below: { gap: 8, alignItems: 'center', paddingHorizontal: H_PAD },
  swipeHint: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666666',
    textAlign: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(17,17,17,0.35)',
  },
  dotOn: { width: 22, backgroundColor: colors.ink },
  outline: {
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  bottomRow: { flexDirection: 'row', gap: 12 },
  pageBody: { gap: 16 },
  grow: { flex: 1 },
  solid: {
    height: 56,
    borderRadius: 28,
    backgroundColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 26,
  },
  solidText: { fontSize: 17, fontWeight: '600', color: '#FFFFFF' },
  outlineText: { fontSize: 17, fontWeight: '600', color: INK },
  missing: { paddingHorizontal: H_PAD, gap: 12 },
  missingTitle: {
    ...font.display,
    fontSize: 33,
    color: colors.ink,
  },
  missingBody: { ...font.body, fontSize: 16, color: colors.ink },
});
