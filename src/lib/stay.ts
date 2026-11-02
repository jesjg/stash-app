// Reads check-in details (Airbnb, Booking.com, hotels, campsites) out of screenshot text,
// a confirmation email or a pasted host message. Pure functions, like extract.ts.
import { findDates, findEventTitle, parseTime } from './extract';
import type { Stay } from './types';

const BRAND = /\b(airbnb|vrbo|booking\.com|hotels\.com|expedia|agoda|hostelworld|pitchup)\b/i;
const CHECK_IN = /\bcheck[\s-]?in\b/i;
const CHECK_OUT = /\bcheck[\s-]?out\b/i;
const ACCESS = /\b(lock ?box|key ?(box|safe)|self[\s-]check[\s-]?in|house (rules|manual)|check[\s-]?in instructions|your host|hosted by|wi-?fi password)\b/i;

/** True when the text reads like a place to stay rather than a ticket. */
export function looksLikeStay(text: string): boolean {
  return BRAND.test(text) || (CHECK_IN.test(text) && CHECK_OUT.test(text)) || ACCESS.test(text);
}

export type StayFound = {
  stay: Stay;
  /** Check-in day and time. */
  date?: string;
  time?: string;
  title?: string;
};

const pad = (n: number) => String(n).padStart(2, '0');

/** "15:00", "3:00 pm", "3pm", "3 PM", "15h". */
function looseTime(s: string): string | undefined {
  const t = parseTime(s);
  if (t) return t;
  const m = s.match(/\b(\d{1,2})\s*(a\.?m\.?|p\.?m\.?)(?![\p{L}])/iu) ?? s.match(/\b(\d{1,2})h\b/);
  if (!m) return undefined;
  let h = +m[1];
  const ap = m[2]?.toLowerCase().replace(/\./g, '');
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  return h <= 23 ? `${pad(h)}:00` : undefined;
}

const firstDate = (s: string | undefined, today: Date) => (s ? findDates([s], today)[0]?.date : undefined);

type When = { date?: string; time?: string };

/** Remove dates so "Sun, 11 Oct" isn't read as 11 o'clock. */
const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\\p{L}*';
const DATE_BITS = new RegExp(
  `\\b\\d{1,2}(?:st|nd|rd|th)?\\.?\\s+${MONTH}\\.?|\\b${MONTH}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?|\\d{1,2}[./-]\\d{1,2}[./-]\\d{2,4}|\\b20\\d{2}\\b`,
  'giu',
);
const stripDates = (s: string) => s.replace(DATE_BITS, ' ');

/** Check-in and check-out: a "Check-in | Checkout" header with values below, or inline. */
function findWhen(lines: string[], today: Date): { in: When; out: When } {
  const result = { in: {} as When, out: {} as When };

  // Airbnb: "Check-in\tCheckout" / "Fri, 9 Oct\tSun, 11 Oct" / "3:00 pm\t11:00 am"
  for (let i = 0; i < lines.length; i++) {
    const cells = lines[i].split('\t').map((c) => c.trim());
    const ci = cells.findIndex((c) => /^check[\s-]?in$/i.test(c));
    const co = cells.findIndex((c) => /^check[\s-]?out$/i.test(c));
    if (ci < 0 || co < 0) continue;
    for (const next of lines.slice(i + 1, i + 4)) {
      const v = next.split('\t').map((c) => c.trim());
      if (v.length !== cells.length) continue;
      result.in.date ??= firstDate(v[ci], today);
      result.out.date ??= firstDate(v[co], today);
      result.in.time ??= looseTime(stripDates(v[ci]));
      result.out.time ??= looseTime(stripDates(v[co]));
    }
    if (result.in.date || result.out.date) return result;
  }

  // Inline: "Check-in: Friday 9 October 2026 from 15:00", "Check in after 3pm", label on its own line.
  const take = (re: RegExp, into: When) => {
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const m = l.match(re);
      if (!m) continue;
      if (/instructions|method|details|time is|guide/i.test(l) && !/\d/.test(l)) continue;
      const rest = l.slice((m.index ?? 0) + m[0].length);
      // Look at the rest of this line, then up to two lines below if this one is just the label.
      const scope = [rest, ...(rest.trim().length < 3 ? lines.slice(i + 1, i + 3) : [])];
      for (const part of scope) {
        // Stop at the other label: "Check-in 15:00 Check-out 11:00"
        const cut = part.split(re === CHECK_IN_LINE ? CHECK_OUT : CHECK_IN)[0];
        into.date ??= firstDate(cut, today);
        // A window ("Check-out: 8:00 am - 12:00 pm"): check in from the start, check out by the end.
        const window = stripDates(cut).split(RANGE).filter((x) => looseTime(x));
        into.time ??= looseTime(re === CHECK_OUT_LINE ? (window[window.length - 1] ?? cut) : (window[0] ?? cut));
      }
      if (into.date && into.time) return;
    }
  };
  take(CHECK_IN_LINE, result.in);
  take(CHECK_OUT_LINE, result.out);
  // Booking.com: both days on one line, "Mon, 9 Nov 2026 - Tue, 10 Nov 2026".
  if (!result.in.date || !result.out.date) {
    for (const l of lines) {
      const halves = l.replace(/\t/g, ' ').split(RANGE);
      if (halves.length !== 2) continue;
      const a = firstDate(halves[0], today);
      const b = firstDate(halves[1], today);
      if (a && b && b > a) {
        result.in.date ??= a;
        result.out.date ??= b;
        break;
      }
    }
  }
  return result;
}
const RANGE = /\s+[-–—]\s+|\s+to\s+|\s+until\s+/i;
/** Booking.com and others draw a copy icon after the address, which reads as a stray letter. */
export const strayIcon = (l: string) => {
  const m = l.match(/^(.*\S)\s+[A-Za-z]$/);
  return m && COUNTRY.test(m[1].split(/[,\s]+/).pop() ?? '') ? m[1] : l;
};
const CHECK_IN_LINE = /\bcheck[\s-]?in\b(?!\s*(instructions|method|details|guide))[\s:]*(?:from|after|time|is|at|:)?/i;
const CHECK_OUT_LINE = /\bcheck[\s-]?out\b[\s:]*(?:by|before|until|time|is|at|:)?/i;

const UI_LINE = /^(get directions|change dates|view details|view all policies|property policies|add arrival time|directions|copy( address)?|show (on )?map|open in maps|view map|map|message( the)? host|contact host|call|show more|read more|show listing|get help)$/i;
const STREET =
  /\b(street|st\.?|road|rd\.?|avenue|ave\.?|lane|ln\.?|way|drive|dr\.?|close|place|square|sq\.?|terrace|crescent|court|grove|hill|row|walk|mews|odos|odós|οδός|via|viale|piazza|rue|avenue|calle|carrer|avenida|strasse|straße|weg|platz|gasse|rua|marina|harbour|harbor|quay)\b/i;
// UK, Greek (311 00), US (CA 91108), 5-digit, Dutch (1012 AB), Canadian, 4-digit before a town (5700 Zell). Not years.
const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}|\d{3}\s\d{2}|[A-Z]{2}\s\d{5}|(?!20\d{3}\b)\d{5}|\d{4}\s?[A-Z]{2}\b|[A-Z]\d[A-Z]\s?\d[A-Z]\d|(?!(?:19|20)\d{2}\b)\d{4}(?=\s+[A-Z]\p{L}))\b/u;
const COUNTRY = /\b(greece|uk|united kingdom|england|scotland|wales|ireland|france|spain|italy|portugal|germany|austria|switzerland|netherlands|croatia|usa|united states|new zealand|australia|indonesia|thailand|vietnam|malaysia|singapore|philippines|japan|south korea|india|sri lanka|maldives|mexico|canada|brazil|argentina|peru|chile|colombia|costa rica|morocco|egypt|south africa|turkey|türkiye|cyprus|malta|belgium|denmark|sweden|norway|finland|iceland|poland|czechia|czech republic|hungary|slovenia|montenegro|albania|united arab emirates|uae)\b/i;

const SENTENCE_WORDS = /\b(you|your|we|our|the|to|before|after|things|please|will|is|are|have|has|just|when|if)\b/i;

function looksLikeAddress(l: string): boolean {
  if (l.length < 6 || l.length > 90 || UI_LINE.test(l)) return false;
  // Prose ("…before your check-in on January 13, 2021.") isn't an address.
  if (l.split(/\s+/).length > 9 || (SENTENCE_WORDS.test(l) && /[.!?]$/.test(l))) return false;
  if (SENTENCE_WORDS.test(l) && l.split(/\s+/).length > 5) return false;
  const hasNumber = /\d/.test(l);
  return (STREET.test(l) && hasNumber) || (POSTCODE.test(l) && /,/.test(l)) || (COUNTRY.test(l) && /,/.test(l) && hasNumber);
}

function findAddress(lines: string[]): string | undefined {
  const label = /^(address|location|getting there|where you('|’)?re staying|property address|the address is|address is)\b[:\s-]*(.*)$/i;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].replace(/\t/g, ' ').match(label);
    if (!m) continue;
    const parts: string[] = [];
    const inline = m[3]?.trim().replace(/[.;]+$/, '');
    if (inline && !UI_LINE.test(inline)) {
      parts.push(inline);
      // "The address is 22 Harbour Road, Lefkada 311 00." is complete on its own.
      if (/\d/.test(inline) && /,/.test(inline)) return inline;
    }
    for (const next of lines.slice(i + 1, i + 4)) {
      const n = next.replace(/\t/g, ' ').trim();
      if (!n || UI_LINE.test(n)) continue;
      const again = n.match(label);
      if (again && !again[3]?.trim()) continue; // "Getting there" then "Address"
      if (again) {
        parts.push(again[3].trim());
        continue;
      }
      if (parts.length && !(POSTCODE.test(n) || COUNTRY.test(n) || n.length < 30)) break;
      if (/^(check|wi-?fi|host|house|your|confirmation|cancell|phone|tel|email|contact|booking|reservation|pin|property|view|change)\b/i.test(n)) break;
      parts.push(n);
      if (parts.length >= 2 || COUNTRY.test(n)) break;
    }
    const a = parts.join(', ').replace(/,\s*,/g, ',');
    if (a.length >= 6) return a;
  }
  // No label: the first line that reads like a street address, plus a postcode/country line after it.
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].replace(/\t/g, ' ').trim();
    if (!looksLikeAddress(l)) continue;
    const next = lines[i + 1]?.replace(/\t/g, ' ').trim();
    if (next && !COUNTRY.test(l) && (COUNTRY.test(next) || POSTCODE.test(next)) && next.length < 40 && !UI_LINE.test(next)) return `${l}, ${next}`;
    return l;
  }
  return undefined;
}

const CODE_WORDS =
  '(?:front door|door|entry|entrance|keypad|smart lock|lock ?box|key ?box|key ?safe|key safe|lock|gate|building|access|garage|padlock)';
const CODE_RE = new RegExp(
  `\\b${CODE_WORDS}\\s*(?:code|pin|combination|number)?\\s*(?:is|:|-|=)?\\s*(?:the\\s+)?(?:code\\s+)?(?:is\\s+)?[:\\-]?\\s*([0-9]{3,8}#?|[A-Z][0-9]{3,7}|[0-9]{1,4}[- ][0-9]{1,4})(?![\\d])`,
  'i',
);
const BARE_CODE_RE = /\b(?:code|pin|combination)\s*(?:is|:|-|=)?\s*[:-]?\s*([0-9]{3,8}#?)(?!\d)/i;
const NOT_DOOR = /(confirmation|booking|post|zip|promo|discount|area|country|reservation|verification|security|pin)\s*$/i;

const CODE_NAMES: [RegExp, string][] = [
  [/lock ?box/i, 'Lockbox'],
  [/key ?(box|safe)/i, 'Key safe'],
  [/building/i, 'Building'],
  [/gate/i, 'Gate'],
  [/garage/i, 'Garage'],
  [/padlock/i, 'Padlock'],
  [/front door/i, 'Front door'],
];

function findDoorCode(text: string): string | undefined {
  const flat = text.replace(/[\t\n]+/g, ' ');
  const found: { name?: string; code: string }[] = [];
  const all = new RegExp(CODE_RE.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = all.exec(flat))) {
    const code = m[1].replace(/\s+/g, '');
    if (found.some((f) => f.code === code)) continue;
    const around = flat.slice(Math.max(0, m.index - 40), m.index + m[0].length);
    const near = CODE_NAMES.find(([re]) => re.test(m![0])) ?? CODE_NAMES.find(([re]) => re.test(around));
    found.push({ name: near?.[1], code });
  }
  if (found.length === 1) return found[0].code;
  if (found.length > 1) return found.map((f) => (f.name ? `${f.name} ${f.code}` : f.code)).join(' · ');
  // "Access code: Last four digits of your phone number"
  const words = flat.match(/\b(?:[Aa]ccess|[Dd]oor|[Ee]ntry|[Kk]eypad|[Ll]ock ?box|[Kk]ey ?box|[Kk]ey ?safe|[Gg]ate|[Bb]uilding)\s*[Cc]ode\s*[:\-]\s*([A-Za-z][^.:\n]{2,60}?)(?=\s{2,}|\s+[A-Z]{3,}|[.\n]|$)/);
  let bare: RegExpExecArray | null;
  const re = new RegExp(BARE_CODE_RE.source, 'gi');
  while ((bare = re.exec(flat))) {
    const before = flat.slice(Math.max(0, bare.index - 25), bare.index);
    if (!NOT_DOOR.test(before)) return bare[1];
  }
  return words?.[1].trim();
}

function findWifi(lines: string[]): { name?: string; password?: string } {
  const out: { name?: string; password?: string } = {};
  const clean = (v: string) => v.trim().replace(/^["“'(]+|["”'),.;]+$/g, '').trim();
  // Two-column layout: "Network\tPassword" / "SeaviewGuest\tkalimera2026"
  for (let i = 0; i + 1 < lines.length; i++) {
    const cells = lines[i].split('\t').map((c) => c.trim().toLowerCase());
    const ni = cells.findIndex((c) => /^(network|wi-?fi|wifi name|name|ssid)$/.test(c));
    const pi = cells.findIndex((c) => /^(password|pass|wi-?fi password)$/.test(c));
    const v = lines[i + 1].split('\t').map((c) => c.trim());
    if (ni >= 0 && pi >= 0 && v.length === cells.length) return { name: clean(v[ni]), password: clean(v[pi]) };
  }
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!/wi-?fi|wireless|network|ssid|internet/i.test(l)) continue;
    const window = [l, ...lines.slice(i + 1, i + 4)];
    for (const w of window) {
      // "Wifi name\tFLAT3", "Password\tblueSky!22"
      const kv = w.split('\t').map((c) => c.trim());
      if (kv.length === 2) {
        if (/^(wi-?fi |wifi )?(name|network( name)?|ssid)$/i.test(kv[0])) out.name ??= clean(kv[1]);
        if (/^(wi-?fi |wifi )?(password|passcode|pass|network key)$/i.test(kv[0])) out.password ??= clean(kv[1]);
        if (/^(wi-?fi|wifi|network)$/i.test(kv[0]) && !/password/i.test(kv[1])) out.name ??= clean(kv[1]);
      }
      const line = w.replace(/\t+/g, '  ');
      const name =
        line.match(/(?:network|ssid|wi-?fi name|wifi name|name)\s*(?:is|:|-)\s*(.+?)(?:\s{2,}|\s+(?:and\s+)?(?:the\s+)?pass(?:word)?\b|$)/i) ??
        line.match(/^(?:wi-?fi|wifi network|network)\b\s*(?::|-)?\s+(?=\S)(?!(?:password|details|info|available|is free)\b)(\S.+?)(?:\s{2,}|\s+pass(?:word)?\b|$)/i);
      if (name && !out.name) {
        const v = clean(name[1]);
        if (v && v.length <= 32 && !/^(password|available|included|free|yes|no|name|network)$/i.test(v)) out.name = v;
      }
      const pw = line.match(/\b(?:password|passcode|pass|pw|wi-?fi key|network key)\b\s*(?:is|:|-|=)?\s*[:\-]?\s*(\S+)/i);
      if (pw && !out.password) {
        const v = clean(pw[1]);
        if (v && !/^(is|for|to|and|the)$/i.test(v)) out.password = v;
      }
    }
    if (out.name && out.password) break;
  }
  return out;
}

function findPhone(text: string): string | undefined {
  const intl = text.match(/\+\d{1,3}[\d\s().-]{7,16}\d/);
  if (intl) return intl[0].replace(/\s+/g, ' ').trim();
  const local = text.match(/(?:phone|call|tel|mobile|whatsapp|contact)[^\d\n]{0,15}(0\d[\d\s-]{8,13}\d)/i);
  return local?.[1].replace(/\s+/g, ' ').trim();
}

function findHost(text: string): string | undefined {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 2; i >= Math.max(0, lines.length - 6); i--) {
    if (/^(cheers|thanks|thank you|best|regards|kind regards|warm regards|best wishes|see you soon|all the best|take care)[,!.]?$/i.test(lines[i])) {
      const name = lines[i + 1].match(/^([A-Z][\p{L}'’-]+(?:\s+(?:&|and)\s+[A-Z][\p{L}'’-]+)?)[.!]?$/u);
      if (name) return name[1];
    }
  }
  const m = text.match(/(?:[Hh]osted by|[Yy]our host,?|[Hh]ost:|[Hh]ost is)\s+([A-Z][\p{L}'’-]+(?:\s+(?:&|and)\s+[A-Z][\p{L}'’-]+)?)/u);
  return m?.[1];
}

function findTitle(lines: string[], address: string | undefined, today: Date, avoid: string[]): string | undefined {
  // The property name usually sits right above its street address.
  const street = address?.split(',')[0].trim();
  const at = street ? lines.findIndex((l) => l.replace(/\t/g, ' ').includes(street)) : -1;
  const above = at > 0 ? lines[at - 1].replace(/\t/g, ' ').trim() : '';
  if (above && above.length <= 45 && !/\d/.test(above) && !/[.!?:,]$/.test(above) && !SENTENCE_WORDS.test(above) && !/^(address|location|getting there|property|your)\b/i.test(above)) {
    return above;
  }
  // Booking.com: the property name sits right above the dates ("Mon, 9 Nov 2026 - Tue, 10 Nov 2026").
  const range = lines.findIndex((l) => {
    const h = l.split(RANGE);
    return h.length === 2 && !!firstDate(h[0], today) && !!firstDate(h[1], today);
  });
  const name = range > 0 ? lines[range - 1].replace(/\t/g, ' ').trim() : '';
  if (name && name.length <= 45 && !/\d/.test(name) && !/[.!?:,]$/.test(name) && !SENTENCE_WORDS.test(name) && !UI_LINE.test(name)) return name;
  for (const l of lines) {
    const m = l
      .replace(/\t/g, ' ')
      .match(/\b(?:stay|trip|reservation|booking|holiday)(?: is)?(?: confirmed)?(?: for)? (?:at|in|to)\s+(.{3,45}?)[.!]?$/i);
    if (m) return m[1].trim();
  }
  const t = findEventTitle(
    lines.filter(
      (l) =>
        !CHECK_IN.test(l) &&
        !CHECK_OUT.test(l) &&
        !BRAND.test(l.trim()) &&
        !/wi-?fi|password|network|host|code|address|door|key|instructions|rules|manual|directions|getting there|phone|lift|floor|parking/i.test(l) &&
        !looksLikeAddress(l.replace(/\t/g, ' ')) &&
        !avoid.some((a) => a && l.includes(a)) &&
        !/[.!?:]$/.test(l.trim()) &&
        !/^(hi|hello|hey|dear|welcome|thanks|thank you|kind regards|best)\b/i.test(l.trim()) &&
        !/^(your trips?|trips?|upcoming|reservation details)$/i.test(l.trim()),
    ),
    today,
  );
  // Fall back to the town from the address: "…, Nidri 311 00, Greece" → "Nidri"
  const town = address
    ?.split(',')
    .map((p) => p.replace(POSTCODE, '').trim())
    .filter((p) => p && !COUNTRY.test(p) && !/\d/.test(p))
    .pop();
  if (t && !/^(airbnb|booking\.com|stay|trip|details|reservation)$/i.test(t) && (t.includes(' ') || !town)) return t;
  return town ? `Stay in ${town}` : undefined;
}

/** Strip phone status bar and app chrome so the saved instructions read cleanly. */
function cleanNotes(text: string): string {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\t+/g, '  ').trim())
    .filter((l) => l && !/^\d{1,2}[:.]\d{2}\b/.test(l) && !/\b(5G|4G|LTE)\b/.test(l) && !UI_LINE.test(l))
    .join('\n')
    .slice(0, 4000);
}

export function extractStay(text: string, today = new Date()): StayFound {
  // Pasted host messages are often one long paragraph: treat each sentence as a line.
  const lines = text
    .split(/\r?\n/)
    .flatMap((l) => (l.length > 100 ? l.split(/(?<=[.!?])\s+(?=[A-Z])/) : [l]))
    .map((l) => strayIcon(l.trim()))
    .filter(Boolean);
  const when = findWhen(lines, today);
  const address = findAddress(lines);
  const wifi = findWifi(lines);
  const stay: Stay = {
    address,
    checkOutDate: when.out.date,
    checkOutTime: when.out.time,
    doorCode: findDoorCode(text),
    wifiName: wifi.name,
    wifiPassword: wifi.password,
    host: findHost(text),
    phone: findPhone(text),
    notes: cleanNotes(text) || undefined,
  };
  (Object.keys(stay) as (keyof Stay)[]).forEach((k) => stay[k] === undefined && delete stay[k]);
  return { stay, date: when.in.date, time: when.in.time, title: findTitle(lines, address, today, [wifi.name ?? '', wifi.password ?? '']) };
}
