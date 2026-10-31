import { Image } from 'expo-image';
import { router } from 'expo-router';
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Toggle } from './Toggle';
import { useRef, useState } from 'react';
import {
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
import { dayKey, fmt, timeKey, toDate } from '../lib/dates';
import { reminderDate } from '../lib/reminders';
import { KINDS, type Kind, type Stay, type Stub } from '../lib/types';
import { colors, font, label } from '../theme';
import { CodeView } from './CodeView';
import { Icon } from './Icon';
import { ticketType } from '../lib/ticketTypes';

export type StubFields = Pick<Stub, 'title' | 'kind' | 'date' | 'time' | 'stay' | 'details'>;

const STAY_FIELDS: { key: keyof Stay; label: string; placeholder: string; multiline?: boolean; mono?: boolean; keyboard?: 'phone-pad' }[] = [
  { key: 'address', label: 'Address', placeholder: 'Street, town, postcode', multiline: true },
  { key: 'doorCode', label: 'Door / key code', placeholder: 'e.g. 4821', mono: true },
  { key: 'wifiName', label: 'Wi-Fi name', placeholder: 'Network name', mono: true },
  { key: 'wifiPassword', label: 'Wi-Fi password', placeholder: 'Password', mono: true },
  { key: 'host', label: 'Host', placeholder: 'Name' },
  { key: 'phone', label: 'Host phone', placeholder: '+30 …', keyboard: 'phone-pad' },
  { key: 'notes', label: 'Instructions', placeholder: 'Anything else: parking, which door, where the key is…', multiline: true },
];

type Props = {
  heading: string;
  stub: Stub;
  saveLabel: string;
  onSave: (fields: StubFields) => void;
  onCancel: () => void;
};

function reminderText(date: string, time?: string) {
  const at = reminderDate({ date, time });
  if (at.getTime() < Date.now()) return 'No reminder: that time has already passed.';
  const day = dayKey(at) === date ? fmt.short(date) : fmt.short(dayKey(at));
  return `Reminder ${timeKey(at)} on ${day}${time ? ' (2h before)' : ''}`;
}

/** A pencil beside text you can change; tapping it puts the cursor in the box. */
// New ticket spec: white screen, light grey groups.
const SCREEN = '#FFFFFF';
const SOFT_BG = '#F7F7F7';

function EditButton({ label: a11y, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress} hitSlop={10} style={styles.pencil}>
      <Icon name="pencil" size={14} color={colors.inkSoft} stroke={2} />
    </Pressable>
  );
}

export function StubForm({ heading, stub, saveLabel, onSave, onCancel }: Props) {
  const titleRef = useRef<TextInput>(null);
  const companyRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState(stub.title);
  const [kind, setKind] = useState<Kind>(stub.kind);
  const [date, setDate] = useState(stub.date);
  const [time, setTime] = useState<string | undefined>(stub.time);
  const [stay, setStay] = useState<Stay>(stub.stay ?? {});
  const [company, setCompany] = useState(stub.details?.find((d) => d.label === 'Company')?.value ?? '');
  const isStay = kind === 'stay';
  const setStayField = (key: keyof Stay, value: string | undefined) => setStay((s) => ({ ...s, [key]: value || undefined }));
  const onOutDate = (_: DateTimePickerEvent, d?: Date) => d && setStayField('checkOutDate', dayKey(d));
  const onOutTime = (_: DateTimePickerEvent, d?: Date) => d && setStayField('checkOutTime', timeKey(d));
  const first = stub.tickets[0];
  const count = stub.tickets.length;
  const status = isStay
    ? count
      ? `Stay · ${count} screenshot${count === 1 ? '' : 's'} kept`
      : 'Stay'
    : count > 1
      ? `${count} tickets found`
      : first?.code
        ? 'Code found'
        : 'No code found, keeping the page';
  // Show the whole ticket while checking the details (the code alone hides them); tap to zoom.
  const page = stub.pageUris.find(Boolean) ?? first?.pageUri;
  // Shared details plus the first ticket's own (seat etc.); with several tickets, note that seats vary.
  const readDetails = [...(first?.details ?? []), ...(stub.details ?? [])].filter((d) => d.label !== 'Company');
  // The company is its own field: it becomes the name badge on the ticket.
  const details = () => {
    const rest = (stub.details ?? []).filter((d) => d.label !== 'Company');
    const name = company.trim();
    return name ? [{ label: 'Company', value: name.slice(0, 40) }, ...rest] : rest.length ? rest : undefined;
  };
  const filled = stub.autofill ?? [];
  const found = !!first?.code || isStay;
  const pages = stub.pageUris.length;
  const source = isStay
    ? 'Read from your screenshots'
    : `Read from your ${/\.pdf$/i.test(stub.sourceName) ? 'PDF' : 'screenshot'}${pages > 1 ? ` · ${pages} pages` : ''}`;

  const onDate = (_: DateTimePickerEvent, d?: Date) => d && setDate(dayKey(d));
  const onTime = (_: DateTimePickerEvent, d?: Date) => d && setTime(timeKey(d));

  const openAndroid = (mode: 'date' | 'time') =>
    DateTimePickerAndroid.open({
      value: toDate(date, time ?? '09:00'),
      mode,
      is24Hour: true,
      onChange: mode === 'date' ? onDate : onTime,
    });

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" onPress={onCancel} hitSlop={12} style={styles.topBtn}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
        <Text style={styles.heading}>{heading}</Text>
        <View style={styles.topBtn} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]} keyboardShouldPersistTaps="handled">
        {/* The ticket at a glance: a small picture to tap and enlarge, what was found, and its name. */}
        <View style={[styles.box, styles.hero]}>
          {page ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Your ticket. Tap to enlarge it and check the details."
              onPress={() => router.push({ pathname: '/original/[id]', params: { id: stub.id } })}
              style={({ pressed }) => [styles.thumbWrap, pressed && { opacity: 0.8 }]}
            >
              <View style={styles.thumb}>
                <Image source={{ uri: page }} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" />
                <View style={styles.zoomBadge}>
                  <Icon name="zoomIn" size={14} color="#FFFFFF" stroke={2.4} />
                </View>
              </View>
              <Text style={styles.thumbHint}>Tap to enlarge</Text>
            </Pressable>
          ) : first?.code ? (
            <View style={[styles.thumb, styles.thumbCode]}>
              <CodeView ticket={first} size={56} />
            </View>
          ) : null}
          <View style={styles.grow}>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: found ? '#00C566' : '#A8A8A0' }]}>
                <Icon name={found ? 'check' : 'doc'} size={11} color="#FFFFFF" stroke={3} />
              </View>
              <Text style={styles.statusText} numberOfLines={1}>
                {status}
              </Text>
            </View>
            <View style={styles.editRow}>
              <TextInput
                ref={titleRef}
                value={title}
                onChangeText={setTitle}
                placeholder="What's it for?"
                placeholderTextColor="#A8A8A0"
                style={[styles.titleInput, styles.grow]}
                autoCapitalize="words"
                returnKeyType="done"
                maxLength={60}
                accessibilityLabel="Title"
                multiline
                blurOnSubmit
              />
              <EditButton label="Edit name" onPress={() => titleRef.current?.focus()} />
            </View>
            <Text style={styles.heroSub}>{source}</Text>
          </View>
        </View>
        {page ? <Text style={styles.reminder}>Something not right? Tap the ticket to enlarge it and check the details.</Text> : null}
        {!isStay && (
          <View style={styles.box}>
            <View style={styles.inputRow}>
              <Text style={styles.inputLabel}>Company · shown on the ticket</Text>
              <View style={styles.editRow}>
                <TextInput
                  ref={companyRef}
                  value={company}
                  onChangeText={setCompany}
                  placeholder="e.g. Ryanair, Ionian Lines"
                  placeholderTextColor="#A8A8A0"
                  autoCapitalize="words"
                  autoCorrect={false}
                  maxLength={40}
                  style={[styles.input, styles.grow]}
                  accessibilityLabel="Company"
                />
                <EditButton label="Edit company" onPress={() => companyRef.current?.focus()} />
              </View>
            </View>
          </View>
        )}

        <View style={styles.field}>
          <Text style={label}>Type</Text>
          <View style={styles.chips}>
            {KINDS.map((k) => {
              const on = k.id === kind;
              return (
                <Pressable
                  key={k.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  onPress={() => setKind(k.id)}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <View style={[styles.chipDot, { backgroundColor: on ? '#FFFFFF' : ticketType(k.id).color }]} />
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{k.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.box}>
          <View style={styles.boxRow}>
            <Text style={styles.boxLabel}>{isStay ? 'Check-in' : 'Date'}</Text>
            {Platform.OS === 'ios' ? (
              <DateTimePicker value={toDate(date)} mode="date" display="compact" onChange={onDate} accentColor={colors.accent} />
            ) : (
              <Pressable onPress={() => openAndroid('date')} style={styles.valueBtn}>
                <Text style={styles.value}>{fmt.short(date)}</Text>
              </Pressable>
            )}
          </View>
          <View style={styles.divider} />
          <View style={styles.boxRow}>
            <Text style={styles.boxLabel}>{isStay ? 'Check-in time' : 'Set a time'}</Text>
            <Toggle
              value={time != null}
              onValueChange={(on) => setTime(on ? time ?? '09:00' : undefined)}
              accessibilityLabel="Set a time"
            />
          </View>
          {time != null && (
            <>
              <View style={styles.divider} />
              <View style={styles.boxRow}>
                <Text style={styles.boxLabel}>Time</Text>
                {Platform.OS === 'ios' ? (
                  <DateTimePicker
                    value={toDate(date, time)}
                    mode="time"
                    display="compact"
                    onChange={onTime}
                    accentColor={colors.accent}
                    minuteInterval={5}
                  />
                ) : (
                  <Pressable onPress={() => openAndroid('time')} style={styles.valueBtn}>
                    <Text style={styles.value}>{time}</Text>
                  </Pressable>
                )}
              </View>
            </>
          )}
        </View>
        <Text style={styles.reminder}>
          {reminderText(date, time)}
          {filled.includes('date') || filled.includes('time')
            ? ` ${filled.includes('date') && filled.includes('time') ? 'Date and time' : filled.includes('date') ? 'Date' : 'Time'} read from the ticket.`
            : ''}
        </Text>
        {isStay && (
          <>
            <View style={styles.box}>
              <View style={styles.boxRow}>
                <Text style={styles.boxLabel}>Check-out</Text>
                <Toggle
                  value={stay.checkOutDate != null}
                  onValueChange={(on) => setStayField('checkOutDate', on ? stay.checkOutDate ?? date : undefined)}
                  accessibilityLabel="Set a check-out date"
                />
              </View>
              {stay.checkOutDate != null && (
                <>
                  <View style={styles.divider} />
                  <View style={styles.boxRow}>
                    <Text style={styles.boxLabel}>Date</Text>
                    {Platform.OS === 'ios' ? (
                      <DateTimePicker
                        value={toDate(stay.checkOutDate)}
                        minimumDate={toDate(date)}
                        mode="date"
                        display="compact"
                        onChange={onOutDate}
                        accentColor={colors.accent}
                      />
                    ) : (
                      <Pressable
                        onPress={() => DateTimePickerAndroid.open({ value: toDate(stay.checkOutDate!), mode: 'date', onChange: onOutDate })}
                        style={styles.valueBtn}
                      >
                        <Text style={styles.value}>{fmt.short(stay.checkOutDate)}</Text>
                      </Pressable>
                    )}
                  </View>
                  <View style={styles.divider} />
                  <View style={styles.boxRow}>
                    <Text style={styles.boxLabel}>Time</Text>
                    {Platform.OS === 'ios' ? (
                      <DateTimePicker
                        value={toDate(stay.checkOutDate, stay.checkOutTime ?? '11:00')}
                        mode="time"
                        display="compact"
                        onChange={onOutTime}
                        accentColor={colors.accent}
                        minuteInterval={5}
                      />
                    ) : (
                      <Pressable
                        onPress={() =>
                          DateTimePickerAndroid.open({
                            value: toDate(stay.checkOutDate!, stay.checkOutTime ?? '11:00'),
                            mode: 'time',
                            is24Hour: true,
                            onChange: onOutTime,
                          })
                        }
                        style={styles.valueBtn}
                      >
                        <Text style={styles.value}>{stay.checkOutTime ?? '11:00'}</Text>
                      </Pressable>
                    )}
                  </View>
                </>
              )}
            </View>

            <View style={styles.field}>
              <Text style={label}>Getting in</Text>
              <View style={styles.box}>
                {STAY_FIELDS.map((f, i) => (
                  <View key={f.key}>
                    {i > 0 && <View style={styles.divider} />}
                    <View style={styles.inputRow}>
                      <Text style={styles.inputLabel}>{f.label}</Text>
                      <TextInput
                        value={stay[f.key] ?? ''}
                        onChangeText={(v) => setStayField(f.key, v)}
                        placeholder={f.placeholder}
                        placeholderTextColor="#A8A8A0"
                        multiline={f.multiline}
                        keyboardType={f.keyboard}
                        autoCapitalize={f.mono ? 'none' : 'sentences'}
                        autoCorrect={!f.mono}
                        style={[styles.input, f.mono && { ...font.mono }, f.key === 'notes' && { minHeight: 90 }]}
                        accessibilityLabel={f.label}
                      />
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}
        {readDetails.length > 0 && (
          <View style={styles.field}>
            <Text style={label}>Read from your ticket</Text>
            <View style={styles.chips}>
              {readDetails.map((d, i) => (
                <View key={`${d.label}-${d.value}-${i}`} style={styles.detail}>
                  <Text style={styles.detailLabel}>{d.label === 'Ref' ? 'Booking ref' : d.label}</Text>
                  <Text style={styles.detailValue}>{d.value}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          accessibilityRole="button"
          onPress={() => onSave({ title, kind, date, time, stay: isStay ? stay : stub.stay, details: isStay ? stub.details : details() })}
          style={({ pressed }) => [styles.save, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.saveText}>{saveLabel}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: SCREEN },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  topBtn: { minWidth: 64, minHeight: 44, justifyContent: 'center' },
  cancel: { ...font.bodyMedium, fontSize: 16, color: colors.ink },
  heading: { fontSize: 15, fontWeight: '700', letterSpacing: 2.4, textTransform: 'uppercase', color: colors.ink },
  content: { paddingHorizontal: 20, paddingTop: 8, gap: 18 },
  titleInput: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4, color: colors.ink, padding: 0 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grow: { flex: 1 },
  pencil: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#EBEBEB', alignItems: 'center', justifyContent: 'center' },
  // The top card: a small picture of the ticket to tap and enlarge, what was found and the name.
  hero: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 16 },
  thumbWrap: { alignItems: 'center', gap: 6 },
  thumb: { width: 72, height: 112, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E2E2', overflow: 'hidden' },
  thumbCode: { alignItems: 'center', justifyContent: 'center' },
  zoomBadge: { position: 'absolute', right: 5, bottom: 5, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  thumbHint: { fontSize: 11, fontWeight: '600', color: colors.accent },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 4 },
  statusDot: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  statusText: { flexShrink: 1, fontSize: 13, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', color: colors.inkSoft },
  heroSub: { fontSize: 14, fontWeight: '500', color: '#666666', marginTop: 2 },
  field: { gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1.5, borderColor: '#E2E2E2', backgroundColor: SCREEN, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chipDot: { width: 9, height: 9, borderRadius: 5 },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { ...font.bodyBold, fontSize: 14, color: colors.ink },
  chipTextOn: { color: colors.onAccent },
  box: { backgroundColor: SOFT_BG, borderRadius: 20, paddingHorizontal: 16 },
  boxRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  boxLabel: { ...font.bodyBold, fontSize: 16, color: colors.ink },
  divider: { height: 1, backgroundColor: '#E6E6E6' },
  valueBtn: { paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#EBEBEB', borderRadius: 10 },
  value: { ...font.mono, fontSize: 15, color: colors.ink },
  detail: { backgroundColor: SOFT_BG, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  detailLabel: { ...font.mono, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.inkFaint },
  detailValue: { ...font.bodyBold, fontSize: 15, color: colors.ink },
  inputRow: { paddingVertical: 12, gap: 4 },
  inputLabel: { ...font.mono, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.inkFaint },
  input: { ...font.bodyBold, fontSize: 16, color: colors.ink, padding: 0, minHeight: 24 },
  reminder: { ...font.mono, fontSize: 12, color: colors.inkSoft, marginTop: -10 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, backgroundColor: SCREEN },
  save: { height: 56, borderRadius: 999, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  saveText: { ...font.bodyBold, fontSize: 17, color: colors.onAccent },
});
