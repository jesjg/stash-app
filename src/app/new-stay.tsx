import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { canReadStaysWithAI, readStayWithAI } from '../../modules/stubs-scanner';
import { Icon, type IconName } from '../components/Icon';
import { showToast } from '../components/Toast';
import { dayKey, fmt, timeKey, toDate } from '../lib/dates';
import { deleteStubFiles, newId } from '../lib/files';
import type { IncomingFile } from '../lib/importer';
import { pickPhotos } from '../lib/pickers';
import { getState, isPast, saveDraft, setDraft, updateStub, useStore } from '../lib/store';
import { scanStayFile, takePendingStayFiles, type StayPage } from '../lib/stayImport';
import { addStayPage, emptyStay, hasField, nightsOf, readStayPage, type StayDraft, type StayField } from '../lib/stayReader';
import type { Stay, Stub } from '../lib/types';

// New stay: one page. Each screenshot is read in turn and the details fill in as they're found;
// tap a pencil to change one, or a screenshot to enlarge it. Also opened with ?edit=<id> from a
// stay's ⋯ menu.

const VIOLET = '#9747FF';
const INK = '#111111';
const SOFT = '#6B6B70';
const BOX = '#F5F5F7';
const LINE = '#E7E7EA';

type Page = StayPage & { done: boolean };

const ROWS: { field: StayField; label: string; icon: IconName; looking: string }[] = [
  { field: 'place', label: 'Place', icon: 'home', looking: 'Looking…' },
  { field: 'host', label: 'Host', icon: 'user', looking: 'Looking…' },
  { field: 'dates', label: 'Dates', icon: 'calendar', looking: 'Looking for dates…' },
  { field: 'address', label: 'Address', icon: 'pin', looking: 'Looking for the address…' },
  { field: 'gettingIn', label: 'Getting in', icon: 'key', looking: 'Looking for directions…' },
  { field: 'wifi', label: 'Wi-Fi', icon: 'wifi', looking: 'Looking…' },
  { field: 'arrival', label: 'Arriving', icon: 'steps', looking: 'Looking for directions…' },
];

const shortDay = (d: string) => `${fmt.dow(d)} ${Number(fmt.dayNum(d))} ${fmt.mon(d)}`;

/** What a row says, in one line. */
function valueOf(d: StayDraft, field: StayField): string | undefined {
  switch (field) {
    case 'place':
      return d.place;
    case 'host':
      return d.host;
    case 'dates': {
      if (!d.checkIn) return undefined;
      const n = nightsOf(d.checkIn, d.checkOut);
      const range = d.checkOut ? `${shortDay(d.checkIn)} – ${shortDay(d.checkOut)}` : shortDay(d.checkIn);
      return n ? `${range} · ${n} night${n === 1 ? '' : 's'}` : range;
    }
    case 'address':
      return d.address;
    case 'gettingIn':
      return [d.gettingIn, d.doorCode ? `code ${d.doorCode}` : undefined, !d.gettingIn && !d.doorCode ? d.phone : undefined]
        .filter(Boolean)
        .join(' · ') || undefined;
    case 'wifi':
      return [d.wifiName, d.wifiPassword].filter(Boolean).join(' · ') || undefined;
    case 'arrival':
      return d.arrival?.length ? d.arrival.filter((a) => a.trim()).map((a, i) => `${i + 1}. ${a.trim()}`).join('\n') : undefined;
  }
}

function fromStub(s: Stub): StayDraft {
  const st = s.stay ?? {};
  return {
    source: {},
    place: s.title,
    host: st.host,
    checkIn: s.date,
    checkInTime: s.time,
    checkOut: st.checkOutDate,
    checkOutTime: st.checkOutTime,
    address: st.address,
    gettingIn: st.gettingIn,
    doorCode: st.doorCode,
    wifiName: st.wifiName,
    wifiPassword: st.wifiPassword,
    phone: st.phone,
    arrival: st.arrival,
  };
}

export default function NewStay() {
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const editing = useStore((s) => (edit ? s.stubs.find((x) => x.id === edit) : undefined));
  const insets = useSafeAreaInsets();
  const [id] = useState(() => editing?.id ?? newId());
  const [pages, setPages] = useState<Page[]>(() =>
    (editing?.pageUris ?? []).map((imageUri) => ({ imageUri, text: '', label: 'Screenshot', done: true })),
  );
  const [draft, setDraftState] = useState<StayDraft>(() => (editing ? fromStub(editing) : emptyStay()));
  const [reading, setReading] = useState(false);
  const [open, setOpen] = useState<StayField | null>(null);
  const queue = useRef<IncomingFile[]>([]);
  const running = useRef(false);
  const count = useRef(0);
  const pageCount = useRef(pages.length);
  const saved = useRef(false);

  async function work() {
    if (running.current) return;
    running.current = true;
    setReading(true);
    const today = new Date();
    while (queue.current.length) {
      const file = queue.current.shift()!;
      let found: StayPage[] = [];
      try {
        found = await scanStayFile(id, file, count.current++);
      } catch {
        Alert.alert("Couldn't read that file", 'Try a screenshot instead.');
      }
      for (const page of found) {
        const index = pageCount.current++;
        setPages((ps) => [...ps, { ...page, done: false }]);
        const ai = page.text.trim().length > 20 ? await readStayWithAI(page.text, dayKey(today)) : null;
        const values = readStayPage(page.text, ai, today);
        setDraftState((d) => addStayPage(d, values, index));
        setPages((ps) => ps.map((p, i) => (i === index ? { ...p, done: true } : p)));
      }
    }
    running.current = false;
    setReading(false);
  }

  function add(files: IncomingFile[]) {
    if (!files.length) return;
    queue.current.push(...files);
    work();
  }

  useEffect(() => {
    if (editing) return;
    const files = takePendingStayFiles();
    if (files.length) add(files);
    else router.back();
    // Files left behind if the screen closes without saving.
    return () => {
      if (saved.current) return;
      if (getState().draft?.id === id) setDraft(null);
      else deleteStubFiles(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on open
  }, []);

  // Keep the screenshots in a draft so "tap to enlarge" can show them before the stay is saved.
  useEffect(() => {
    if (editing || saved.current || !pages.length) return;
    const uris = pages.map((p) => p.imageUri);
    setDraft({ id, title: draft.place ?? 'Stay', kind: 'stay', date: dayKey(), tickets: [], sourceUri: uris[0], sourceName: 'Booking screenshots', pageUris: uris, createdAt: Date.now() });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the screenshots change
  }, [pages.length]);

  const set = (patch: Partial<StayDraft>) => setDraftState((d) => ({ ...d, ...patch }));

  async function save() {
    if (!draft.checkIn) {
      setOpen('dates');
      Alert.alert('Add the dates', 'Stash needs the check-in day to remind you.');
      return;
    }
    const stay: Stay = {
      ...(editing?.stay ?? {}),
      address: draft.address,
      host: draft.host,
      checkOutDate: draft.checkOut,
      checkOutTime: draft.checkOutTime,
      gettingIn: draft.gettingIn,
      doorCode: draft.doorCode,
      wifiName: draft.wifiName,
      wifiPassword: draft.wifiPassword,
      phone: draft.phone,
      arrival: draft.arrival?.map((a) => a.trim()).filter(Boolean),
    };
    if (!stay.arrival?.length) stay.arrival = undefined;
    (Object.keys(stay) as (keyof Stay)[]).forEach((k) => stay[k] === undefined && delete stay[k]);
    const fields = { title: draft.place?.trim() || 'Stay', kind: 'stay' as const, date: draft.checkIn, time: draft.checkInTime, stay };
    saved.current = true;
    if (editing) {
      await updateStub(editing.id, fields);
      router.back();
      showToast('Stay updated.');
      return;
    }
    const stub: Stub = {
      id,
      ...fields,
      tickets: pages.map((p) => ({ id: newId(), pageUri: p.imageUri })),
      sourceUri: pages[0]?.imageUri ?? '',
      sourceName: 'Booking screenshots',
      pageUris: pages.map((p) => p.imageUri),
      createdAt: Date.now(),
    };
    setDraft(stub);
    const result = await saveDraft(fields);
    if (router.canDismiss()) router.dismissAll();
    else router.replace('/');
    if (result) showToast(isPast(result) ? 'Saved under Past: that date has passed.' : result.reminderId ? 'Stay saved. Reminder set for check-in.' : 'Stay saved.');
  }

  const label = (i: number) => (pages[i]?.label === 'Screenshot' ? `Screenshot ${i + 1}` : (pages[i]?.label ?? ''));
  const enlarge = (uri: string) => router.push({ pathname: '/original/[id]', params: { id, page: uri } });

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.topBar, { paddingTop: 16 }]}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={12} style={styles.topBtn}>
          <Text style={styles.topText}>Cancel</Text>
        </Pressable>
        <Text style={styles.heading}>{editing ? 'Edit stay' : 'New stay'}</Text>
        <View style={styles.topBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{editing ? 'Your stay' : 'Reading your booking'}</Text>
        <Text style={styles.sub}>
          {editing
            ? 'Tap the pencil to change anything.'
            : 'Add screenshots from Airbnb, Booking.com or your host’s messages. Stash pulls out what you’ll need on arrival. Tap the pencil to change anything.'}
        </Text>

        {pages.length || !editing ? (
          <View style={{ gap: 8 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
              {pages.map((p, i) => (
                <Pressable
                  key={`${p.imageUri}-${i}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${label(i)}. Tap to enlarge`}
                  onPress={() => enlarge(p.imageUri)}
                  style={({ pressed }) => [styles.thumb, pressed && { opacity: 0.8 }]}
                >
                  <Image source={{ uri: p.imageUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  {p.done ? (
                    <View style={styles.thumbCheck}>
                      <Icon name="check" size={14} color="#FFFFFF" stroke={3} />
                    </View>
                  ) : (
                    <ScanLine />
                  )}
                  <View style={styles.zoomBadge}>
                    <Icon name="zoomIn" size={14} color="#FFFFFF" stroke={2.4} />
                  </View>
                </Pressable>
              ))}
              {!editing ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Add more screenshots"
                  onPress={() => pickPhotos().then(add)}
                  style={({ pressed }) => [styles.thumb, styles.addThumb, pressed && { opacity: 0.6 }]}
                >
                  <Icon name="plus" size={22} color={VIOLET} />
                  <Text style={styles.addText}>Add</Text>
                </Pressable>
              ) : null}
            </ScrollView>
            {pages.length ? <Text style={styles.enlargeHint}>Tap a screenshot to enlarge</Text> : null}
          </View>
        ) : null}

        <View style={styles.box}>
          {ROWS.map((row, i) => {
            const found = hasField(draft, row.field);
            const isOpen = open === row.field;
            const src = draft.source[row.field];
            return (
              <View key={row.field} style={[styles.row, i > 0 && styles.rowLine]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${row.label}: ${found ? valueOf(draft, row.field) : 'not found'}. Edit`}
                  onPress={() => setOpen(isOpen ? null : row.field)}
                  style={styles.readRow}
                >
                  {found ? (
                    <View style={styles.dot}>
                      <Icon name="check" size={12} color="#FFFFFF" stroke={3} />
                    </View>
                  ) : reading ? (
                    <ActivityIndicator size="small" color={VIOLET} style={styles.spinner} />
                  ) : (
                    <View style={[styles.dot, styles.dotEmpty]} />
                  )}
                  <View style={styles.readText}>
                    <Text style={styles.readLabel}>
                      {row.label}
                      {found && src !== undefined && pages.length > 1 ? <Text style={styles.readSource}>{`  ·  ${label(src)}`}</Text> : null}
                    </Text>
                    <Text style={[styles.readValue, !found && styles.readLooking]} numberOfLines={isOpen ? undefined : 2}>
                      {found ? valueOf(draft, row.field) : reading ? row.looking : 'Not found · tap to add'}
                    </Text>
                  </View>
                  <View style={[styles.pencil, isOpen && { backgroundColor: VIOLET }]}>
                    <Icon name={isOpen ? 'check' : 'pencil'} size={14} color={isOpen ? '#FFFFFF' : VIOLET} stroke={2.2} />
                  </View>
                </Pressable>
                {isOpen ? (
                  <View style={styles.editor}>
                    <Editor field={row.field} draft={draft} set={set} />
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        <View style={styles.privacy}>
          <Icon name="lock" size={14} color={SOFT} stroke={2} />
          <Text style={styles.privacyText}>
            {canReadStaysWithAI() ? 'Read on your iPhone with Apple Intelligence. Nothing is uploaded.' : 'Read on your iPhone. Nothing is uploaded.'}
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          accessibilityRole="button"
          disabled={reading}
          onPress={save}
          style={({ pressed }) => [styles.cta, reading && { opacity: 0.4 }, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.ctaText}>{reading ? 'Reading…' : editing ? 'Save changes' : 'Save stay'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

/** A violet line sweeping down a screenshot while it's being read. */
function ScanLine() {
  const [y] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(y, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [y]);
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.35)' }]}>
      <Animated.View style={[styles.scanLine, { transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [8, 150] }) }] }]} />
    </View>
  );
}

function Field({ label, value, onChange, placeholder, multiline, keyboard }: {
  label: string;
  value?: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboard?: 'default' | 'phone-pad';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value ?? ''}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#A8A8AE"
        multiline={multiline}
        keyboardType={keyboard}
        autoCorrect={!keyboard}
        style={[styles.input, multiline && { minHeight: 96, textAlignVertical: 'top' }]}
        accessibilityLabel={label}
      />
    </View>
  );
}

const opt = (v: string) => (v.trim() ? v : undefined);

function Editor({ field, draft, set }: { field: StayField; draft: StayDraft; set: (p: Partial<StayDraft>) => void }) {
  switch (field) {
    case 'place':
      return <Field label="Name" value={draft.place} onChange={(v) => set({ place: opt(v) })} placeholder="Home in Gili T" />;
    case 'host':
      return <Field label="Host" value={draft.host} onChange={(v) => set({ host: opt(v) })} placeholder="Made" />;
    case 'address':
      return <Field label="Address" value={draft.address} onChange={(v) => set({ address: opt(v) })} placeholder="Street, town" multiline />;
    case 'wifi':
      return (
        <>
          <Field label="Network" value={draft.wifiName} onChange={(v) => set({ wifiName: opt(v) })} />
          <Field label="Password" value={draft.wifiPassword} onChange={(v) => set({ wifiPassword: opt(v) })} />
        </>
      );
    case 'gettingIn':
      return (
        <>
          <Field label="How you get in" value={draft.gettingIn} onChange={(v) => set({ gettingIn: opt(v) })} placeholder="Lockbox by the door" />
          <Field label="House code" value={draft.doorCode} onChange={(v) => set({ doorCode: opt(v) })} placeholder="7314" />
          <Field label="Host's phone" value={draft.phone} onChange={(v) => set({ phone: opt(v) })} keyboard="phone-pad" />
        </>
      );
    case 'arrival':
      return (
        <Field
          label="Arriving: one step per line"
          value={draft.arrival?.join('\n')}
          onChange={(v) => {
            const steps = v.split('\n').map((s) => s.trim());
            set({ arrival: steps.some(Boolean) ? v.split('\n') : undefined });
          }}
          placeholder={'From the harbour, turn left at the mosque.\nGreen gate on the right.'}
          multiline
        />
      );
    case 'dates': {
      const onDate = (key: 'checkIn' | 'checkOut') => (_: DateTimePickerEvent, d?: Date) => d && set({ [key]: dayKey(d) });
      const onTime = (key: 'checkInTime' | 'checkOutTime') => (_: DateTimePickerEvent, d?: Date) => d && set({ [key]: timeKey(d) });
      const inDay = draft.checkIn ?? dayKey();
      return (
        <View style={styles.dates}>
          {(
            [
              ['Check-in', 'checkIn', 'checkInTime', inDay, '15:00'],
              ['Check-out', 'checkOut', 'checkOutTime', draft.checkOut ?? inDay, '11:00'],
            ] as const
          ).map(([name, dayK, timeK, day, fallback]) => (
            <View key={name} style={styles.dateRow}>
              <Text style={styles.fieldLabel}>{name}</Text>
              <View style={styles.pickers}>
                <DateTimePicker value={toDate(day)} mode="date" display="compact" onChange={onDate(dayK)} accentColor={VIOLET} />
                <DateTimePicker
                  value={toDate(day, draft[timeK] ?? fallback)}
                  mode="time"
                  display="compact"
                  onChange={onTime(timeK)}
                  accentColor={VIOLET}
                />
              </View>
            </View>
          ))}
        </View>
      );
    }
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 8 },
  topBtn: { minWidth: 64, minHeight: 44, justifyContent: 'center' },
  topText: { fontSize: 17, fontWeight: '500', color: INK },
  heading: { fontSize: 14, fontWeight: '700', letterSpacing: 2.4, textTransform: 'uppercase', color: INK },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40, gap: 18 },
  title: { fontSize: 32, lineHeight: 36, fontWeight: '800', letterSpacing: -0.8, color: INK },
  sub: { fontSize: 16, lineHeight: 22, color: SOFT, marginTop: -8 },
  thumbs: { gap: 10, paddingVertical: 2 },
  thumb: { width: 100, height: 168, borderRadius: 16, overflow: 'hidden', backgroundColor: BOX, borderWidth: 1, borderColor: LINE },
  thumbCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: VIOLET,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanLine: { position: 'absolute', left: 8, right: 8, height: 3, borderRadius: 2, backgroundColor: VIOLET },
  addThumb: { width: 60, borderStyle: 'dashed', borderColor: VIOLET, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', gap: 4 },
  addText: { fontSize: 13, fontWeight: '600', color: VIOLET },
  box: { backgroundColor: BOX, borderRadius: 20, paddingHorizontal: 16 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#D9D9DE' },
  row: { paddingVertical: 10 },
  readRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  readText: { flex: 1, gap: 2 },
  readSource: { fontSize: 12, color: '#9A9AA0' },
  editor: { gap: 10, paddingTop: 12, paddingLeft: 36 },
  zoomBadge: { position: 'absolute', right: 8, bottom: 8, width: 26, height: 26, borderRadius: 13, backgroundColor: VIOLET, alignItems: 'center', justifyContent: 'center' },
  enlargeHint: { fontSize: 13, fontWeight: '500', color: VIOLET },
  dot: { width: 24, height: 24, borderRadius: 12, backgroundColor: VIOLET, alignItems: 'center', justifyContent: 'center' },
  dotEmpty: { backgroundColor: 'transparent', borderWidth: 2, borderColor: '#CFCFD6' },
  spinner: { width: 24, height: 24 },
  readLabel: { fontSize: 13, color: SOFT },
  readValue: { fontSize: 16, lineHeight: 21, fontWeight: '600', color: INK },
  readLooking: { fontWeight: '400', color: '#9A9AA0' },
  privacy: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  privacyText: { flex: 1, fontSize: 13, lineHeight: 18, color: SOFT },
  pencil: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: SOFT },
  input: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: LINE, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: INK },
  dates: { gap: 10 },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pickers: { flexDirection: 'row', gap: 6 },
  footer: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: '#FFFFFF' },
  cta: { height: 58, borderRadius: 999, backgroundColor: VIOLET, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
});
