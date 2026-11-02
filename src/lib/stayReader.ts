// Reads a stay (Airbnb, Booking.com, a host's messages) from several screenshots, page by page.
// Each page is read by Stash's own rules and, where available, Apple Intelligence; the model's
// answers are only used when they can be found written on that page. The first page that has a
// field wins, and the draft remembers which page it came from.
// Pure functions, no I/O, so it's easy to test.
import { dateOnTicket, printed, timeOnTicket, titleOnTicket } from './aiReader';
import { daysBetween } from './dates';
import { extractStay } from './stay';

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

/** Everything one page says about the stay. */
export function readStayPage(text: string, ai: AIStayAnswer | null, today = new Date()): StayValues {
  const rules = extractStay(text, today);
  const r = rules.stay;
  const a = ai ?? {};

  const place = clean(a.place, 60);
  const host = clean(a.host, 30);
  const address = clean(a.address, 140);
  const gettingIn = clean(a.gettingIn, 70);
  const code = clean(a.doorCode, 20);
  const wifiName = clean(a.wifiName, 40);
  const wifiPassword = clean(a.wifiPassword, 60);
  const phone = clean(a.phone, 25);

  const out: StayValues = {
    place: place && titleOnTicket(place, text) ? place : rules.title,
    host: host && printed(host, text) ? host : r.host,
    checkIn: a.checkInDate && dateOnTicket(a.checkInDate, text) ? a.checkInDate : rules.date,
    checkInTime: a.checkInTime && timeOnTicket(a.checkInTime, text) ? a.checkInTime : rules.time,
    checkOut: a.checkOutDate && dateOnTicket(a.checkOutDate, text) ? a.checkOutDate : r.checkOutDate,
    checkOutTime: a.checkOutTime && timeOnTicket(a.checkOutTime, text) ? a.checkOutTime : r.checkOutTime,
    address: address && titleOnTicket(address, text) ? address : r.address,
    // A summary in the model's words: most of its words must still be on the page.
    gettingIn: gettingIn && titleOnTicket(gettingIn, text, 0.5) ? gettingIn : undefined,
    doorCode: code && printed(code, text) ? code : r.doorCode,
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
