import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ActionSheetIOS, Alert, Linking, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { daysBetween, dayKey, fmt } from '../lib/dates';
import { copyText } from '../lib/native';
import { updateStub } from '../lib/store';
import { nightsOf } from '../lib/stayReader';
import type { Stub } from '../lib/types';
import { Icon, type IconName } from './Icon';
import { showToast } from './Toast';

// The stay page: a violet header with the dates and nights, the address and quick actions,
// the house code, how to arrive, and the screenshots it was read from.

const VIOLET = '#9747FF';
const TINT = '#F3ECFF';
const INK = '#111111';
const SOFT = '#6B6B70';
const BOX = '#F5F5F7';
const WHITE = '#FFFFFF';

export function openDirections(address: string) {
  const q = encodeURIComponent(address);
  const apple = () => Linking.openURL(`http://maps.apple.com/?q=${q}`);
  const google = () => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`);
  const copy = () => Share.share({ message: address });
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ['Apple Maps', 'Google Maps', 'Copy or send address', 'Cancel'], cancelButtonIndex: 3, title: address },
      (i) => [apple, google, copy][i]?.(),
    );
  } else {
    Alert.alert(address, undefined, [
      { text: 'Google Maps', onPress: google },
      { text: 'Copy or send', onPress: copy },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }
}

const copy = (text: string, what = 'Copied') => copyText(text).then((how) => how === 'copied' && showToast(what));

function messageHost(phone: string, host?: string) {
  const num = phone.replace(/[^\d+]/g, '');
  const actions = [
    () => Linking.openURL(`https://wa.me/${num.replace(/^\+/, '')}`),
    () => Linking.openURL(`sms:${num}`),
    () => Linking.openURL(`tel:${num}`),
  ];
  const options = ['WhatsApp', 'Text message', 'Call', 'Cancel'];
  const title = host ? `${host} · ${phone}` : phone;
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: 3, title }, (i) => actions[i]?.());
  } else {
    Alert.alert(title, undefined, [...options.slice(0, 3).map((text, i) => ({ text, onPress: actions[i] })), { text: 'Cancel', style: 'cancel' as const }]);
  }
}

function showWifi(name?: string, password?: string) {
  Alert.alert(name ?? 'Wi-Fi', password ? `Password: ${password}` : undefined, [
    ...(password ? [{ text: 'Copy password', onPress: () => copy(password, 'Password copied') }] : []),
    { text: 'OK', style: 'cancel' as const },
  ]);
}

/** "IN 16 DAYS", "TODAY", "STAYING NOW"… */
function statusOf(stub: Stub): string {
  const today = dayKey();
  const out = stub.stay?.checkOutDate;
  const until = daysBetween(today, stub.date);
  if (until > 1) return `In ${until} days`;
  if (until === 1) return 'Tomorrow';
  if (until === 0) return 'Check-in today';
  if (out && out > today) return 'Staying now';
  if (out === today) return 'Check-out today';
  return 'Past';
}

/** A little four-pointed sparkle for the header. */
function Star({ right, top, size }: { right: number; top: number; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="-12 -12 24 24" style={{ position: 'absolute', right, top }}>
      <Path d="M0 -12C0 -4 4 0 12 0C4 0 0 4 0 12C0 4 -4 0 -12 0C-4 0 0 -4 0 -12Z" fill={WHITE} fillOpacity={0.7} />
    </Svg>
  );
}

function Action({ icon, label, onPress, primary }: { icon: IconName; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }]}>
      <View style={[styles.actionCircle, primary && { backgroundColor: VIOLET }]}>
        <Icon name={icon} size={22} color={primary ? WHITE : VIOLET} stroke={2} />
      </View>
      <Text style={styles.actionText} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function StayCard({ stub }: { stub: Stub }) {
  const st = stub.stay ?? {};
  const nights = nightsOf(stub.date, st.checkOutDate);
  const ref = stub.details?.find((d) => d.label === 'Ref')?.value;
  const shots = stub.pageUris.length ? stub.pageUris : stub.tickets.map((t) => t.pageUri).filter(Boolean);
  const code = st.doorCode?.trim();
  // Not known yet: show 0000 until it's added with the pencil.
  const shown = code || '0000';
  const boxes = /^[0-9A-Za-z#*]{1,8}$/.test(shown);
  const editCode = () =>
    Alert.prompt(
      'House code',
      'The door, gate or key box code.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save', onPress: (v?: string) => updateStub(stub.id, { stay: { ...st, doorCode: v?.trim() || undefined } }) },
      ],
      'plain-text',
      code ?? '',
    );
  const steps = st.arrival?.filter(Boolean) ?? [];
  const actions: { icon: IconName; label: string; onPress: () => void; primary?: boolean }[] = [
    ...(st.address
      ? [
          { icon: 'directions' as const, label: 'Directions', onPress: () => openDirections(st.address!), primary: true },
          { icon: 'copy' as const, label: 'Copy address', onPress: () => copy(st.address!, 'Address copied') },
        ]
      : []),
    ...(st.phone ? [{ icon: 'message' as const, label: 'Message', onPress: () => messageHost(st.phone!, st.host) }] : []),
    ...(st.wifiName || st.wifiPassword ? [{ icon: 'wifi' as const, label: 'Wi-Fi', onPress: () => showWifi(st.wifiName, st.wifiPassword) }] : []),
  ];

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        {/* A big crescent moon: a pale disc with a violet one over its top right. */}
        <View style={styles.moon} />
        <View style={styles.moonCut} />
        <Star right={128} top={34} size={12} />
        <Star right={112} top={62} size={7} />
        <View style={styles.headTop}>
          <View style={styles.headLeft}>
            <View style={styles.badge}>
              <Icon name="typeBed" size={20} color={VIOLET} stroke={2} />
            </View>
            <Text style={styles.kicker}>Stay</Text>
          </View>
          <Text style={styles.kicker}>{statusOf(stub)}</Text>
        </View>
        <View style={{ gap: 4 }}>
          <Text style={styles.title} numberOfLines={2}>
            {stub.title}
          </Text>
          {st.host ? <Text style={styles.hosted}>Hosted by {st.host}</Text> : null}
        </View>
        <View style={styles.datesBox}>
          <View>
            <Text style={styles.dow}>{fmt.dow(stub.date)}</Text>
            <Text style={styles.day}>{`${Number(fmt.dayNum(stub.date))} ${fmt.mon(stub.date)}`}</Text>
            {stub.time ? <Text style={styles.time}>from {stub.time}</Text> : null}
          </View>
          {nights ? (
            <View style={styles.nights}>
              <Icon name="moon" size={14} color={VIOLET} stroke={2.4} />
              <Text style={styles.nightsText}>
                {nights} night{nights === 1 ? '' : 's'}
              </Text>
            </View>
          ) : null}
          {st.checkOutDate ? (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.dow}>{fmt.dow(st.checkOutDate)}</Text>
              <Text style={styles.day}>{`${Number(fmt.dayNum(st.checkOutDate))} ${fmt.mon(st.checkOutDate)}`}</Text>
              {st.checkOutTime ? <Text style={styles.time}>by {st.checkOutTime}</Text> : null}
            </View>
          ) : null}
        </View>
      </View>

      {st.address ? (
        <Pressable accessibilityRole="button" onPress={() => openDirections(st.address!)} style={styles.addressRow}>
          <Icon name="pin" size={20} color={INK} stroke={2} />
          <Text style={styles.address} selectable>
            {st.address}
          </Text>
        </Pressable>
      ) : null}

      {actions.length ? (
        <View style={styles.actions}>
          {actions.map((a) => (
            <Action key={a.label} {...a} />
          ))}
        </View>
      ) : null}

      {!stub.sample ? (
        <View style={styles.codeBox}>
          <View style={styles.codeIcon}>
            <Icon name="key" size={20} color={WHITE} stroke={2} />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={styles.codeLabel}>House code</Text>
            {boxes ? (
              <View style={styles.digits}>
                {shown.split('').map((c, i) => (
                  <View key={i} style={styles.digit}>
                    <Text style={[styles.digitText, !code && styles.unknown]}>{c}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.codeText} selectable>
                {shown}
              </Text>
            )}
          </View>
          <View style={styles.codeButtons}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change the house code"
              onPress={editCode}
              style={({ pressed }) => [styles.codePencil, pressed && { opacity: 0.7 }]}
            >
              <Icon name="pencil" size={15} color={VIOLET} stroke={2.2} />
            </Pressable>
            {code ? (
              <Pressable accessibilityRole="button" onPress={() => copy(code, 'Code copied')} style={({ pressed }) => [styles.copyPill, pressed && { opacity: 0.8 }]}>
                <Text style={styles.copyText}>Copy</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {steps.length || st.gettingIn ? (
        <View style={styles.box}>
          <Text style={styles.boxLabel}>{steps.length ? 'Arriving' : 'Getting in'}</Text>
          {st.gettingIn && steps.length ? <Text style={styles.gettingIn}>{st.gettingIn}</Text> : null}
          {steps.length ? (
            steps.map((s, i) => (
              <View key={i} style={styles.step}>
                <View style={styles.stepNum}>
                  <Text style={styles.stepNumText}>{i + 1}</Text>
                </View>
                <Text style={styles.stepText}>{s}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.stepText}>{st.gettingIn}</Text>
          )}
        </View>
      ) : null}

      {ref ? (
        <Pressable accessibilityRole="button" onPress={() => copy(ref, 'Booking ref copied')} style={styles.refRow}>
          <Text style={styles.boxLabel}>Booking ref</Text>
          <Text style={styles.ref} selectable>
            {ref}
          </Text>
        </Pressable>
      ) : null}

      {!st.address && !steps.length && !st.gettingIn && !actions.length ? (
        <Text style={styles.empty}>No address or codes yet. Tap ⋯ → Edit details to add them.</Text>
      ) : null}

      {shots.length && !stub.sample ? (
        <View style={{ gap: 10 }}>
          <View style={styles.shotsHead}>
            <Text style={styles.shotsLabel}>Your screenshots</Text>
            <Text style={styles.shotsCount}>{shots.length}</Text>
          </View>
          <View style={styles.shots}>
            {shots.map((uri) => (
              <Pressable
                key={uri}
                accessibilityRole="button"
                accessibilityLabel="Screenshot. Tap to enlarge"
                onPress={() => router.push({ pathname: '/original/[id]', params: { id: stub.id, page: uri } })}
                style={({ pressed }) => [styles.shot, pressed && { opacity: 0.8 }]}
              >
                <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                <View style={styles.zoomBadge}>
                  <Icon name="zoomIn" size={12} color={WHITE} stroke={2.4} />
                </View>
              </Pressable>
            ))}
          </View>
          <Text style={styles.enlarge}>Tap a screenshot to enlarge</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 14 },
  header: { backgroundColor: VIOLET, borderRadius: 28, padding: 20, gap: 18, overflow: 'hidden' },
  // Small enough to stay clear of the dates box below.
  moon: { position: 'absolute', right: 8, top: -36, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.14)' },
  moonCut: { position: 'absolute', right: -22, top: -66, width: 145, height: 145, borderRadius: 72.5, backgroundColor: VIOLET },
  headTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { width: 40, height: 40, borderRadius: 20, backgroundColor: WHITE, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontSize: 13, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: WHITE },
  title: { fontSize: 32, lineHeight: 36, fontWeight: '800', letterSpacing: -0.8, color: WHITE },
  hosted: { fontSize: 16, fontWeight: '500', color: 'rgba(255,255,255,0.9)' },
  datesBox: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dow: { fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' },
  day: { fontSize: 22, fontWeight: '800', color: WHITE },
  time: { fontSize: 12, fontWeight: '500', color: 'rgba(255,255,255,0.85)' },
  nights: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: WHITE, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  nightsText: { fontSize: 15, fontWeight: '700', color: VIOLET },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: BOX, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14 },
  address: { flex: 1, fontSize: 17, fontWeight: '500', color: INK },
  actions: { flexDirection: 'row', gap: 4 },
  action: { flex: 1, alignItems: 'center', gap: 8 },
  actionCircle: { width: 58, height: 58, borderRadius: 29, backgroundColor: TINT, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 12.5, fontWeight: '600', color: INK },
  codeBox: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: TINT, borderRadius: 20, padding: 16 },
  codeIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: VIOLET, alignItems: 'center', justifyContent: 'center' },
  codeLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: VIOLET },
  digits: { flexDirection: 'row', gap: 8 },
  digit: { minWidth: 34, height: 40, borderRadius: 8, backgroundColor: WHITE, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  digitText: { fontSize: 24, fontWeight: '800', color: INK, fontVariant: ['tabular-nums'] },
  codeText: { fontSize: 22, fontWeight: '800', color: INK },
  unknown: { color: '#C9C2D6' },
  codeButtons: { alignItems: 'flex-end', gap: 8 },
  codePencil: { width: 36, height: 36, borderRadius: 18, backgroundColor: WHITE, alignItems: 'center', justifyContent: 'center' },
  copyPill: { backgroundColor: VIOLET, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 },
  copyText: { fontSize: 15, fontWeight: '700', color: WHITE },
  box: { backgroundColor: BOX, borderRadius: 20, padding: 18, gap: 12 },
  boxLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase', color: SOFT },
  gettingIn: { fontSize: 16, fontWeight: '600', color: INK },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: VIOLET, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepNumText: { fontSize: 13, fontWeight: '700', color: WHITE },
  stepText: { flex: 1, fontSize: 16, lineHeight: 22, color: INK },
  refRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: BOX, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14 },
  ref: { fontSize: 17, fontWeight: '700', color: INK, fontVariant: ['tabular-nums'] },
  empty: { fontSize: 15, lineHeight: 21, color: SOFT },
  shotsHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  shotsLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase', color: SOFT },
  shotsCount: { fontSize: 15, fontWeight: '600', color: VIOLET },
  shots: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  zoomBadge: { position: 'absolute', right: 5, bottom: 5, width: 22, height: 22, borderRadius: 11, backgroundColor: VIOLET, alignItems: 'center', justifyContent: 'center' },
  enlarge: { fontSize: 13, fontWeight: '500', color: VIOLET },
  shot: { width: 64, height: 96, borderRadius: 12, overflow: 'hidden', backgroundColor: BOX, borderWidth: 1, borderColor: '#E7E7EA' },
});
