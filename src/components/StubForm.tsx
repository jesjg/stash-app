import { Image } from 'expo-image';
import { router } from 'expo-router';
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Toggle } from './Toggle';
import { useState } from 'react';
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
import { colors, fonts, label } from '../theme';
import { CodeView } from './CodeView';
import { Perforated } from './Perforated';

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

export function StubForm({ heading, stub, saveLabel, onSave, onCancel }: Props) {
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
  // Show the whole ticket while checking the details (the code alone hides them); tap to zoom.
  const page = stub.pageUris.find(Boolean) ?? first?.pageUri;
  const [pageAspect, setPageAspect] = useState(0.71);
  // Shared details plus the first ticket's own (seat etc.); with several tickets, note that seats vary.
  const readDetails = [...(first?.details ?? []), ...(stub.details ?? [])].filter((d) => d.label !== 'Company');
  // The company is its own field: it becomes the name badge on the ticket.
  const details = () => {
    const rest = (stub.details ?? []).filter((d) => d.label !== 'Company');
    const name = company.trim();
    return name ? [{ label: 'Company', value: name.slice(0, 40) }, ...rest] : rest.length ? rest : undefined;
  };
  const filled = stub.autofill ?? [];

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
        <Perforated
          color={colors.paperWarm}
          ground={colors.ground}
          top={
            <View style={styles.cardTop}>
              <Text style={label}>
                {isStay
                  ? count
                    ? `Stay · ${count} screenshot${count === 1 ? '' : 's'} kept`
                    : 'Stay'
                  : count > 1
                    ? `${count} tickets found`
                    : first?.code
                      ? 'Code found'
                      : 'No code found, keeping the page'}
              </Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="WHAT'S IT FOR?"
                placeholderTextColor="#A8A8A0"
                style={styles.titleInput}
                autoCapitalize="words"
                returnKeyType="done"
                maxLength={60}
                accessibilityLabel="Title"
                multiline
                blurOnSubmit
              />
            </View>
          }
          bottom={
            isStay ? undefined : page ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Your ticket. Opens it full screen to zoom."
                onPress={() => router.push({ pathname: '/original/[id]', params: { id: stub.id } })}
                style={({ pressed }) => [styles.cardBottom, pressed && { opacity: 0.85 }]}
              >
                <Image
                  source={{ uri: page }}
                  style={[styles.page, { aspectRatio: pageAspect }]}
                  contentFit="contain"
                  onLoad={(e) => e.source.width && e.source.height && setPageAspect(e.source.width / e.source.height)}
                />
                <Text style={styles.pageHint}>{stub.pageUris.length > 1 ? `Tap to zoom · ${stub.pageUris.length} pages` : 'Tap to zoom'}</Text>
              </Pressable>
            ) : (
              <View style={styles.cardBottom}>{first && <CodeView ticket={first} size={150} />}</View>
            )
          }
        />

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

        {!isStay && (
          <View style={styles.box}>
            <View style={styles.inputRow}>
              <Text style={styles.inputLabel}>Company · shown on the ticket</Text>
              <TextInput
                value={company}
                onChangeText={setCompany}
                placeholder="e.g. Ryanair, Ionian Lines"
                placeholderTextColor="#A8A8A0"
                autoCapitalize="words"
                autoCorrect={false}
                maxLength={40}
                style={styles.input}
                accessibilityLabel="Company"
              />
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
        <Text style={styles.reminder}>{reminderText(date, time)}</Text>

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
                        style={[styles.input, f.mono && { fontFamily: fonts.mono }, f.key === 'notes' && { minHeight: 90 }]}
                        accessibilityLabel={f.label}
                      />
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}
        {(filled.includes('date') || filled.includes('time')) && (
          <Text style={styles.reminder}>
            {filled.includes('date') && filled.includes('time') ? 'Date and time' : filled.includes('date') ? 'Date' : 'Time'}{' '}
            read from the ticket. Check they&apos;re right.
          </Text>
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
  screen: { flex: 1, backgroundColor: colors.ground },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  topBtn: { minWidth: 64, minHeight: 44, justifyContent: 'center' },
  cancel: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.ink },
  heading: { fontFamily: fonts.monoBold, fontSize: 13, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.ink },
  content: { paddingHorizontal: 20, paddingTop: 8, gap: 22 },
  cardTop: { padding: 20, gap: 8 },
  titleInput: {
    fontFamily: fonts.display,
    fontSize: 34,
    textTransform: 'uppercase',
    color: colors.ink,
    padding: 0,
    minHeight: 44,
  },
  cardBottom: { padding: 18, alignItems: 'center' },
  page: { width: '100%', maxHeight: 460, borderRadius: 8, backgroundColor: colors.paper },
  pageHint: { fontFamily: fonts.mono, fontSize: 11, color: colors.inkFaint, paddingTop: 10 },
  field: { gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1.5, borderColor: colors.ink, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  chipOn: { backgroundColor: colors.ink },
  chipText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.ink },
  chipTextOn: { color: colors.accent },
  box: { backgroundColor: colors.paper, borderRadius: 14, paddingHorizontal: 16 },
  boxRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  boxLabel: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink },
  divider: { height: 1, backgroundColor: '#E6E6E0' },
  valueBtn: { paddingVertical: 8, paddingHorizontal: 12, backgroundColor: colors.ground, borderRadius: 8 },
  value: { fontFamily: fonts.mono, fontSize: 15, color: colors.ink },
  detail: { backgroundColor: colors.paper, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  detailLabel: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.inkFaint },
  detailValue: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink },
  inputRow: { paddingVertical: 12, gap: 4 },
  inputLabel: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.inkFaint },
  input: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink, padding: 0, minHeight: 24 },
  reminder: { fontFamily: fonts.mono, fontSize: 12, color: colors.inkSoft, marginTop: -10 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.ground },
  save: { height: 56, borderRadius: 999, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.ink },
});
