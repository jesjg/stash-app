import { useState } from 'react';
import { ActionSheetIOS, Alert, Linking, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { dayKey, fmt, relativeDay } from '../lib/dates';
import { copyText } from '../lib/native';
import type { Stub } from '../lib/types';
import { colors, font } from '../theme';
import { Perforated } from './Perforated';
import { showToast } from './Toast';

/** "Today · Fri 16 Oct · 15:00" */
function whenText(day: string | undefined, time: string | undefined) {
  if (!day) return time ?? '';
  const rel = relativeDay(day);
  const d = rel === 'Today' || rel === 'Tomorrow' ? `${rel} · ${fmt.short(day)}` : fmt.short(day);
  return time ? `${d} · ${time}` : d;
}

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

/** One-tap copy on the newer build; the share sheet (which has Copy) before that. */
const copy = (text: string) => copyText(text).then((how) => how === 'copied' && showToast('Copied'));

function Button({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.btn, primary && styles.btnPrimary, pressed && { opacity: 0.75 }]}
    >
      <Text style={[styles.btnText, primary && styles.btnTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.block}>
      <Text style={styles.blockLabel}>{label}</Text>
      {children}
    </View>
  );
}

/** The check-in card: where it is, how to get in, how to get online. */
export function StayCard({ stub }: { stub: Stub }) {
  const st = stub.stay ?? {};
  const [showNotes, setShowNotes] = useState(false);
  const staying = stub.date < dayKey();
  const ref = stub.details?.find((d) => d.label === 'Ref')?.value;
  const hasAnything = st.address || st.doorCode || st.wifiName || st.wifiPassword || st.phone;

  return (
    <Perforated
      color={colors.paperWarm}
      ground={colors.ground}
      radius={22}
      notch={26}
      rule="#CFCFC6"
      top={
        <View style={styles.top}>
          <Text style={styles.kicker}>{staying ? 'Staying now' : st.host ? `Stay · host ${st.host}` : 'Stay'}</Text>
          <Text style={[styles.title, stub.title.length > 24 && { fontSize: 30 }]}>{stub.title}</Text>
          <View style={styles.grid}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Check-in</Text>
              <Text style={styles.fieldValue}>{whenText(stub.date, stub.time)}</Text>
            </View>
            {st.checkOutDate || st.checkOutTime ? (
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Check-out</Text>
                <Text style={styles.fieldValue}>{whenText(st.checkOutDate, st.checkOutTime)}</Text>
              </View>
            ) : null}
            {ref ? (
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Booking ref</Text>
                <Text style={[styles.fieldValue, { ...font.mono }]} selectable>
                  {ref}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      }
      bottom={
        <View style={styles.bottom}>
          {st.address ? (
            <Block label="Address">
              <Text style={styles.address} selectable>
                {st.address}
              </Text>
              <View style={styles.row}>
                <Button primary label="Directions" onPress={() => openDirections(st.address!)} />
                <Button label="Copy" onPress={() => copy(st.address!)} />
              </View>
            </Block>
          ) : null}

          {st.doorCode ? (
            <Block label="Door / key code">
              <Text
                style={[styles.code, st.doorCode.length > 10 && { fontSize: 28 }, /[a-z]{3}/.test(st.doorCode) && styles.codeWords]}
                selectable
              >
                {st.doorCode}
              </Text>
            </Block>
          ) : null}

          {st.wifiName || st.wifiPassword ? (
            <Block label="Wi-Fi">
              {st.wifiName ? (
                <Text style={styles.wifiName} selectable>
                  {st.wifiName}
                </Text>
              ) : null}
              {st.wifiPassword ? (
                <View style={styles.row}>
                  <Text style={styles.password} selectable>
                    {st.wifiPassword}
                  </Text>
                  <Button label="Copy password" onPress={() => copy(st.wifiPassword!)} />
                </View>
              ) : null}
            </Block>
          ) : null}

          {st.phone ? (
            <Block label={st.host ? `Host · ${st.host}` : 'Host'}>
              <View style={styles.row}>
                <Text style={styles.phone} selectable>
                  {st.phone}
                </Text>
                <Button label="Call" onPress={() => Linking.openURL(`tel:${st.phone!.replace(/[^\d+]/g, '')}`)} />
              </View>
            </Block>
          ) : null}

          {!hasAnything ? (
            <Text style={styles.empty}>
              No address or codes yet. Tap ⋯ → Edit details to add them.
            </Text>
          ) : null}

          {st.notes ? (
            <Block label="Check-in instructions">
              <Pressable accessibilityRole="button" onPress={() => setShowNotes((v) => !v)}>
                <Text style={styles.notes} numberOfLines={showNotes ? undefined : 4} selectable={showNotes}>
                  {st.notes}
                </Text>
                <Text style={styles.more}>{showNotes ? 'Show less' : 'Show all'}</Text>
              </Pressable>
            </Block>
          ) : null}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  top: { padding: 22, paddingBottom: 18, gap: 12 },
  kicker: { ...font.mono, fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.inkSoft },
  title: { ...font.display, fontSize: 28, color: colors.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 28, rowGap: 10 },
  field: { gap: 2 },
  fieldLabel: { ...font.mono, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.inkFaint },
  fieldValue: { ...font.bodyBold, fontSize: 15, color: colors.ink },
  bottom: { padding: 22, gap: 22 },
  block: { gap: 8 },
  blockLabel: { ...font.mono, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.inkSoft },
  address: { ...font.bodyBold, fontSize: 19, lineHeight: 25, color: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  code: { ...font.display, fontSize: 38, letterSpacing: 2, color: colors.ink },
  codeWords: { ...font.bodyBold, fontSize: 20, lineHeight: 26, letterSpacing: 0 },
  wifiName: { ...font.bodyBold, fontSize: 18, color: colors.ink },
  password: { ...font.monoBold, fontSize: 18, color: colors.ink, flexShrink: 1 },
  phone: { ...font.mono, fontSize: 16, color: colors.ink },
  notes: { ...font.body, fontSize: 15, lineHeight: 22, color: colors.ink },
  more: { ...font.bodyBold, fontSize: 14, color: colors.ink, textDecorationLine: 'underline', marginTop: 6 },
  empty: { ...font.body, fontSize: 15, lineHeight: 22, color: colors.inkSoft },
  btn: { minHeight: 44, paddingHorizontal: 18, borderRadius: 999, borderWidth: 2, borderColor: colors.ink, justifyContent: 'center' },
  btnPrimary: { backgroundColor: colors.ink },
  btnText: { ...font.bodyBold, fontSize: 15, color: colors.ink },
  btnTextPrimary: { color: colors.accent },
});
