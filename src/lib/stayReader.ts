// Reads a stay (Airbnb, Booking.com, a host's messages) from several screenshots, page by page.
// Each page is read by Stash's own rules and, where available, Apple Intelligence; the model's
// answers are only used when they can be found written on that page. The first page that has a
// field wins, and the draft remembers which page it came from.
// Pure functions, no I/O, so it's easy to test.
import { dateOnTicket, printed, timeOnTicket, titleOnTicket } from './aiReader';
import { daysBetween } from './dates';
import { findDates } from './extract';
import { extractStay, strayIcon } from './stay';

/** Same shape as AIStayRead in modules/stubs-scanner (kept separate so tests don't load native code). */
export type AIStayAnswer = {
  place?: string;
  host?: string;
  checkInDate?: string;
  checkInTime?: string;
  checkOutDate?: string;
  checkOutTime?: string;
  address?: string;
  gettingIn?: string;
  doorCode?: string;
  wifiName?: string;
  wifiPassword?: string;
  phone?: string;
  arrival?: string[];
};

/** The rows on the Check the details screen. */
export type StayField = 'place' | 'host' | 'dates' | 'address' | 'gettingIn' | 'wifi' | 'arrival';

export type StayValues = {
  place?: string;
  host?: string;
  checkIn?: string;
  checkInTime?: string;
  checkOut?: string;
  checkOutTime?: string;
  address?: string;
  gettingIn?: string;
  doorCode?: string;
  wifiName?: string;
  wifiPassword?: string;
  phone?: string;
  arrival?: string[];
};

export type StayDraft = StayValues & {
  /** Which page (0-based) each row was read from. */
  source: Partial<Record<StayField, number>>;
};

const clean = (s: string | undefined, max: number) => {
  const t = s?.replace(/\s+/g, ' ').trim();
  return t && t.length <= max ? t : undefined;
};
const digits = (s: string) => s.replace(/\D/g, '');

/** The model doesn't always answer YYYY-MM-DD: "2026-11-9" or "Mon, 9 Nov 2026" are fine too. */
function isoDay(s: string | undefined, today: Date): string | undefined {
  const t = s?.trim();
  if (!t) return undefined;
  const m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return findDates([t], today)[0]?.date;
}

/** "14:00", "2:00 pm", "2pm" → "14:00". */
function hhmm(s: string | undefined): string | undefined {
  const m = s?.trim().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*([ap])?\.?m?\.?$/i);
  if (!m) return undefined;
  let h = Number(m[1]);
  if (m[3]?.toLowerCase() === 'p' && h < 12) h += 12;
  if (m[3]?.toLowerCase() === 'a' && h === 12) h = 0;
  return h <= 23 ? `${String(h).padStart(2, '0')}:${m[2] ?? '00'}` : undefined;
}

/**
 * A code only counts when the page says it's a code: on the same line as (or the line after)
 * "code", "PIN", "lock box", "door", "gate", "key"… A bare number, like the battery level in the
 * status bar, isn't one.
 */
export function codeOnPage(code: string, text: string): boolean {
  const want = code.replace(/\s+/g, '').toLowerCase();
  if (want.length < 3) return false;
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, '').toLowerCase());
  const raw = text.split(/\r?\n/);
  const WORD = /\b(code|codes|pin|passcode|lock ?box|key ?box|key ?safe|keypad|door|gate|entry|access|key)\b/i;
  return lines.some((l, i) => l.includes(want) && (WORD.test(raw[i]) || (i > 0 && WORD.test(raw[i - 1]))));
}

/** A host is a name or two: "Made", "Ana & Luis". Not OCR noise. */
const NAME = /^\p{Lu}[\p{L}'’.-]*(?:\s+(?:&|and|\p{Lu}[\p{L}'’.-]*)){0,3}$/u;

/** Everything one page says about the stay. */
export function readStayPage(text: string, ai: AIStayAnswer | null, today = new Date()): StayValues {
  const rules = extractStay(text, today);
  const r = rules.stay;
  const a = ai ?? {};

  const place = clean(a.place, 60);
  const host = clean(a.host, 30);
  const address = clean(a.address && strayIcon(a.address.trim()), 140);
  const inDay = isoDay(a.checkInDate, today);
  const outDay = isoDay(a.checkOutDate, today);
  const inTime = hhmm(a.checkInTime);
  const outTime = hhmm(a.checkOutTime);
  const gettingIn = clean(a.gettingIn, 70);
  const code = clean(a.doorCode, 20);
  const wifiName = clean(a.wifiName, 40);
  const wifiPassword = clean(a.wifiPassword, 60);
  const phone = clean(a.phone, 25);

  const out: StayValues = {
    place: place && titleOnTicket(place, text) ? place : rules.title,
    host: host && NAME.test(host) && printed(host, text) ? host : r.host && NAME.test(r.host) ? r.host : undefined,
    checkIn: inDay && dateOnTicket(inDay, text) ? inDay : rules.date,
    checkInTime: inTime && timeOnTicket(inTime, text) ? inTime : rules.time,
    checkOut: outDay && dateOnTicket(outDay, text) ? outDay : r.checkOutDate,
    checkOutTime: outTime && timeOnTicket(outTime, text) ? outTime : r.checkOutTime,
    address: address && titleOnTicket(address, text) ? address : r.address,
    // A summary in the model's words: most of its words must still be on the page.
    gettingIn: gettingIn && titleOnTicket(gettingIn, text, 0.5) ? gettingIn : undefined,
    doorCode: code && codeOnPage(code, text) ? code : r.doorCode,
    wifiName: wifiName && printed(wifiName, text) ? wifiName : r.wifiName,
    wifiPassword: wifiPassword && printed(wifiPassword, text) ? wifiPassword : r.wifiPassword,
    phone: phone && digits(phone).length >= 7 && digits(text).includes(digits(phone)) ? phone : r.phone,
  };
  const steps = (a.arrival ?? [])
    .map((s) => clean(s, 140))
    .filter((s): s is string => !!s && titleOnTicket(s, text, 0.6))
    .slice(0, 5);
  if (steps.length) out.arrival = steps;
  // Check-out can't be before check-in.
  if (out.checkIn && out.checkOut && out.checkOut <= out.checkIn) {
    out.checkOut = undefined;
    out.checkOutTime = undefined;
  }
  return out;
}

const FIELD_KEYS: Record<StayField, (keyof StayValues)[]> = {
  place: ['place'],
  host: ['host'],
  dates: ['checkIn', 'checkInTime', 'checkOut', 'checkOutTime'],
  address: ['address'],
  gettingIn: ['gettingIn', 'doorCode', 'phone'],
  wifi: ['wifiName', 'wifiPassword'],
  arrival: ['arrival'],
};

export const emptyStay = (): StayDraft => ({ source: {} });

/** Adds a page's findings to the draft: only fills what's still missing. */
export function addStayPage(draft: StayDraft, page: StayValues, index: number): StayDraft {
  const next: StayDraft = { ...draft, source: { ...draft.source } };
  (Object.keys(FIELD_KEYS) as StayField[]).forEach((field) => {
    let used = false;
    for (const key of FIELD_KEYS[field]) {
      if (next[key] === undefined && page[key] !== undefined) {
        (next as Record<string, unknown>)[key] = page[key];
        used = true;
      }
    }
    if (used && next.source[field] === undefined) next.source[field] = index;
  });
  if (next.checkIn && next.checkOut && next.checkOut <= next.checkIn) {
    next.checkOut = undefined;
    next.checkOutTime = undefined;
  }
  return next;
}

/** True once the row has something in it. */
export function hasField(d: StayValues, field: StayField): boolean {
  return FIELD_KEYS[field].some((k) => {
    const v = d[k];
    return Array.isArray(v) ? v.length > 0 : !!v;
  }) && (field !== 'dates' || !!d.checkIn);
}

export function nightsOf(checkIn?: string, checkOut?: string): number | undefined {
  if (!checkIn || !checkOut) return undefined;
  const n = daysBetween(checkIn, checkOut);
  return n > 0 ? n : undefined;
}
