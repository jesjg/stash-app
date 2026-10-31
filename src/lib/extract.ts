// Reads the useful bits off a ticket's text: event date and time, seat, gate, platform,
// booking reference and so on. Pure functions, no I/O, so it's easy to test.
import type { Detail, Kind } from './types';
import { looksLikeStay } from './stay';

/** A page's text, how many tickets the importer made from it, and those tickets' barcode contents. */
export type PageText = { text: string; codes: number; payloads?: (string | undefined)[] };

export type Extracted = {
  date?: string; // YYYY-MM-DD
  time?: string; // HH:mm
  kind?: Kind;
  title?: string;
  /** Facts that apply to every ticket (gate, platform, booking ref, doors). */
  shared: Detail[];
  /** One list per ticket, in the order the tickets were found. */
  perTicket: Detail[][];
};

// ---------- labels ----------

type LabelDef = { label: string; words: string[]; perTicket?: boolean; value?: RegExp; wordValues?: boolean };

const SHORT = /^[A-Z0-9][A-Z0-9/-]{0,7}$/i; // "14", "F", "112", "A-12", "3/4"
const REF = /^[A-Z0-9][A-Z0-9-]{4,19}$/i; // "KX4-82Q1", "8F3QLJ7"
const TIME_VALUE = /^\d{1,2}[:.]\d{2}(\s?[ap]\.?m\.?)?$/i;

const LABELS: LabelDef[] = [
  { label: 'Seat', words: ['seat', 'seats', 'seat(s)', 'seat no', 'seat nos', 'seat number', 'seat numbers', 'sitz', 'sitzplatz', 'platz', 'posto', 'asiento', 'siège', 'place', 'θέση'], perTicket: true },
  { label: 'Row', words: ['row', 'reihe', 'fila', 'rang', 'σειρά'], perTicket: true },
  { label: 'Section', wordValues: true, words: ['section', 'sec', 'sector', 'sektor', 'settore', 'stand', 'tribune', 'tribüne'], perTicket: true },
  { label: 'Block', wordValues: true, words: ['block', 'bloc', 'blocco', 'area', 'zone', 'zona'], perTicket: true },
  { label: 'Coach', words: ['coach', 'carriage', 'car', 'wagen', 'carrozza', 'voiture', 'coche'], perTicket: true },
  { label: 'Cabin', words: ['cabin', 'kabine', 'cabina', 'καμπίνα'], perTicket: true },
  { label: 'Berth', words: ['berth', 'bed'], perTicket: true },
  { label: 'Gate', wordValues: true, words: ['gate', 'tor', 'porta', 'puerta', 'πύλη'] },
  { label: 'Entrance', wordValues: true, words: ['entrance', 'entry', 'enter via', 'use entrance', 'eingang', 'ingresso', 'entrada', 'entrée', 'είσοδος'] },
  { label: 'Door', wordValues: true, words: ['door', 'turnstile', 'portal', 'vomitory'] },
  { label: 'Platform', words: ['platform', 'gleis', 'binario', 'andén', 'quai'] },
  { label: 'Deck', wordValues: true, words: ['deck', 'class'] },
  { label: 'Doors', words: ['doors', 'doors open', 'gates open', 'einlass', 'check-in closes'], value: TIME_VALUE },
  { label: 'Boarding', words: ['boarding', 'boarding time', 'boards', 'boarding starts'], value: TIME_VALUE },
  { label: 'Gate closes', words: ['gate closes', 'gate close', 'gate closing', 'gate closure'], value: TIME_VALUE },
  { label: 'Departs', words: ['departs', 'departure', 'departure time', 'dep time', 'std', 'abfahrt', 'partenza', 'salida'], value: TIME_VALUE },
  { label: 'Steps', wordValues: true, words: ['steps', 'boarding steps', 'board via', 'boarding door'] },
  { label: 'Terminal', wordValues: true, words: ['terminal', 'term'] },
  { label: 'Group', words: ['boarding group', 'group', 'zone', 'boarding zone', 'priority'], perTicket: true },
  { label: 'Flight', words: ['flight', 'flight no', 'flight number', 'flug', 'volo', 'vuelo', 'vol'], value: /^[A-Z0-9]{2,3}\s?\d{1,4}[A-Z]?$/i },
  {
    label: 'Ref',
    words: ['booking reference', 'booking ref', 'booking no', 'no. booking', 'booking number', 'voucher no', 'voucher number', 'voucher code', 'levy voucher no', 'booking code', 'reference', 'ref', 'order', 'order no', 'order number', 'confirmation', 'confirmation code', 'pnr', 'reservation', 'reservation no', 'ticket no', 'ticket number', 'visa number', 'visa no', 'application number', 'application no', 'permit number', 'authorisation number', 'authorization number', 'buchungsnummer', 'κωδικός κράτησης'],
    value: REF,
  },
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Longest words first so "booking reference" wins over "reference".
const WORD_INDEX = LABELS.flatMap((def) => def.words.map((w) => ({ def, w })))
  .sort((a, b) => b.w.length - a.w.length)
  .map(({ def, w }) => ({ def, re: new RegExp(`^${escapeRe(w)}\\.?\\s*(?:no\\.?|#|nr\\.?)?\\s*[:#.\\-–]?\\s*`, 'i') }));

const WORD_TO_DEF = new Map(LABELS.flatMap((def) => def.words.map((w) => [w.toLowerCase(), def] as const)));
const ALL_WORDS = [...WORD_TO_DEF.keys()].sort((a, b) => b.length - a.length).map(escapeRe).join('|');
const INLINE_RE = new RegExp(`(?<![\\p{L}])(${ALL_WORDS})(?![\\p{L}])\\.?(?:\\s*(?:(?:no|nr)(?![\\p{L}])\\.?|#))?\\s*[:#\\-–]?\\s*`, 'giu');
const INLINE_RE_TEST = new RegExp(`(?<![\\p{L}])(${ALL_WORDS})(?![\\p{L}])`, 'iu');

function labelAt(cell: string): { def: LabelDef; rest: string } | null {
  const c = cell.trim();
  for (const { def, re } of WORD_INDEX) {
    const m = c.match(re);
    if (m) {
      const rest = c.slice(m[0].length).trim();
      // "Section" must be the whole word, not the start of "Sections apply"
      if (rest && /^[a-z]/.test(rest) && !/^[a-z]{1,2}\d/i.test(rest) && rest.length > 3 && /[a-z]{3}/.test(rest)) continue;
      return { def, rest };
    }
  }
  return null;
}

const STOP = new Set(
  'the and via at of in on for to from by is are be this that your you with open opens opening closes closed fee fees number information details detail time date only please see free all any none here there per includes include included including remains remain must may will can not required requirements subject valid applies apply'.split(' '),
);

// Theatre and venue areas: "Stalls", "Dress Circle", "Grand Circle", "Upper Tier", "Box C".
const AREA_WORDS = `(?:(?:royal|dress|grand|upper|lower|front|rear|middle|family)\\s+)?(?:stalls|circle|balcony|mezzanine|orchestra|gallery|loge|parterre)|(?:upper|lower|middle)\\s+(?:tier|level)|box\\s+[A-Z0-9]{1,3}`;
const AREA_START = new RegExp(`^(${AREA_WORDS})(?![\\p{L}])`, 'iu');
const AREA_ANY = new RegExp(`(?<![\\p{L}])(${AREA_WORDS})(?![\\p{L}])`, 'iu');
const niceArea = (a: string) =>
  a.replace(/\s+/g, ' ').toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase()).replace(/ ([a-z0-9]{1,3})$/i, (m) => m.toUpperCase());

// A single seat: "12", "J12", "J 12", "112A".
const SEAT_CODE = /^([A-Z]{1,2})?\s?(\d{1,3}[A-Z]?)$/i;

/** "J11, J12", "J11 & J12", "11-13", "J11–J13" → each seat; null if it isn't a list. */
function seatList(raw: string): string[] | null {
  const v = raw.trim().replace(/^[:#.\-–\s]+/, '').split(/\s{2,}|\t/)[0].trim();
  const range = v.match(/^([A-Z]{1,2})?\s?(\d{1,3})\s*[-–]\s*(?:\1)?\s?(\d{1,3})(?!\d)/i);
  if (range) {
    const a = +range[2], b = +range[3];
    if (b > a && b - a < 10) return Array.from({ length: b - a + 1 }, (_, k) => `${(range[1] ?? '').toUpperCase()}${a + k}`);
  }
  const parts = v.split(/\s*(?:,|&|\+|\/|\band\b)\s*/i).filter(Boolean);
  if (parts.length < 2) return null;
  const seats: string[] = [];
  let row = '';
  for (const part of parts) {
    const m = part.match(SEAT_CODE);
    if (!m) break;
    row = m[1] ? m[1].toUpperCase() : row;
    seats.push(`${row}${m[2].toUpperCase()}`);
  }
  return seats.length >= 2 ? seats : null;
}

function cleanValue(def: LabelDef, raw: string): string | null {
  let v = raw.trim().replace(/^[:#.\-–\s(]+/, '').replace(/\)\s*$/, '').split(/\s{2,}|\t/)[0].trim();
  if (def.wordValues) {
    const area = v.match(AREA_START);
    if (area) return niceArea(area[1]);
  }
  // "Seat J 12" → "J12"
  if (def.label === 'Seat') v = v.replace(/^([A-Z]{1,2})\s(\d{1,3}[A-Z]?)(?![\d\p{L}])/iu, '$1$2');
  if (def.value === TIME_VALUE) {
    const t = parseTime(v);
    return t ?? null;
  }
  if (def.value && def.value !== REF) {
    const parts = v.split(/\s+/);
    const two = parts.slice(0, 2).join(' ');
    const one = parts[0];
    const hit = [two, one].find((c) => def.value!.test(c));
    return hit ? hit.replace(/\s+/, '').toUpperCase() : null;
  }
  if (def.value === REF) {
    v = v.split(/\s/)[0];
    return REF.test(v) && /\d/.test(v) ? v.toUpperCase() : null;
  }
  // Keep things like "Upper Tier 2" short; most values are one token.
  const first = v.split(/\s+/).slice(0, 2).join(' ');
  const token = SHORT.test(v.split(/\s+/)[0]) ? v.split(/\s+/)[0] : first;
  if (!token || token.length > 12) return null;
  if (/^(no|number|nr|n\/a|na|-|tbc|tba)$/i.test(token)) return null;
  const isWord = /^\p{L}{2,12}$/u.test(token) && !STOP.has(token.toLowerCase());
  if (!/\d/.test(token) && !/^[A-Z]{1,3}$/.test(token) && !(def.wordValues && isWord)) return null;
  // "CIRCLE" → "Circle", but keep codes like "C", "23A", "AB".
  if (/^\p{L}{4,}$/u.test(token)) return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
  return token;
}

/** A heading for someone's name: "Name", "Full name", "Name (Same as Passport)", "Passenger name". */
const NAME_HEAD = /^(?:full\s+)?(?:name|passenger(?:\s+name)?|guest(?:\s+name)?|holder)(?:\s*\([^)]*\))?\s*:?$/i;
/** Two to four words of letters: a person's name, as printed. */
const PERSON = /^[\p{L}'.-]+(?:\s+[\p{L}'.-]+){1,3}$/u;

/** All label/value pairs on a page, in reading order. */
function findDetails(text: string): Detail[] {
  const out: Detail[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const soloLabel = (l: string | undefined) => {
    if (!l || /\t|\s{3,}/.test(l)) return null;
    const x = labelAt(l);
    return x && !x.rest ? x : null;
  };

  for (let i = 0; i < lines.length; i++) {
    // Labels stacked above their values (OCR reads columns top to bottom): "ROW" "SEAT" "J" "12"
    const run: LabelDef[] = [];
    for (let j = i, x = soloLabel(lines[j]); x; x = soloLabel(lines[++j])) run.push(x.def);
    if (run.length >= 2 && i + run.length * 2 <= lines.length) {
      const vals = lines.slice(i + run.length, i + run.length * 2);
      if (vals.every((v) => !INLINE_RE_TEST.test(v))) {
        run.forEach((def, k) => {
          const v = cleanValue(def, vals[k]);
          if (v) out.push({ label: def.label, value: v });
        });
        i += run.length * 2 - 1;
        continue;
      }
    }

    const cells = lines[i].split(/\t|\s{3,}|\s\|\s/).map((c) => c.trim()).filter(Boolean);
    const labels = cells.map(labelAt);

    // Header row of labels with a row of values below: "SECTION  ROW  SEAT" / "112  F  14"
    const isName = (c: string) => NAME_HEAD.test(c);
    const isHeading = (c: string, l: ReturnType<typeof labelAt>) =>
      (l && !l.rest) || isName(c) || /^[A-Z][A-Z /&.-]{1,20}:?$/.test(c) || /^[A-Z][\p{Ll}]+(?: [\p{L}().]+){0,3}:?$/u.test(c);
    const labelCount = labels.filter((l, k) => (l && !l.rest) || isName(cells[k])).length;
    if (labels.length > 1 && labelCount >= 1 && cells.every((c, k) => isHeading(c, labels[k])) && i + 1 < lines.length) {
      let values = lines[i + 1].split(/\t|\s{2,}|\s\|\s/).map((c) => c.trim()).filter(Boolean);
      if (values.length !== labels.length) {
        // One OCR box for the whole row: "STALLS J 12", keeping "Dress Circle" together.
        const area = lines[i + 1].match(AREA_START)?.[1];
        const rest = (area ? lines[i + 1].slice(area.length) : lines[i + 1]).trim().split(/\s+/).filter(Boolean);
        const words = area ? [area, ...rest] : rest;
        if (words.length === labels.length) values = words;
      }
      if (values.length === labels.length) {
        labels.forEach((l, k) => {
          // "Name (Same as Passport)" over "GABIJA DUBICKAITE"
          if (isName(cells[k]) && PERSON.test(values[k])) out.push({ label: 'Passenger', value: titleCase(values[k]) });
          if (!l || l.rest) return;
          const v = cleanValue(l.def, values[k]);
          if (v) out.push({ label: l.def.label, value: v });
        });
        i++;
        continue;
      }
    }

    // "Name : Jes Jones Gardner, Mr." or "Passenger: Ms Gabija Dubickaite"
    const who = lines[i].match(/^(?:name|passenger(?:\s+name)?|lead\s+passenger|guest(?:\s+name)?|traveller)\s*:\s*(?:(?:mr|mrs|ms|miss|dr)\.?\s+)?([\p{L}][\p{L} .'-]{2,40}?)(?:,?\s*(?:mr|mrs|ms|miss|dr)\.?)?\s*$/iu);
    if (who && who[1].trim().split(/\s+/).length >= 2) {
      out.push({ label: 'Passenger', value: who[1].trim() });
      continue;
    }

    // Every label on the line, each taking the text up to the next label as its value:
    // "Row G Seat 5", "Dep 08:15  Platform 4", "Coach C\tSeat 42".
    const hits = [...lines[i].matchAll(INLINE_RE)];
    hits.forEach((m, k) => {
      const def = WORD_TO_DEF.get(m[1].toLowerCase());
      if (!def) return;
      const startV = (m.index ?? 0) + m[0].length;
      const endV = k + 1 < hits.length ? hits[k + 1].index ?? lines[i].length : lines[i].length;
      const seats = def.label === 'Seat' ? seatList(lines[i].slice(startV, endV)) : null;
      if (seats) {
        seats.forEach((value) => out.push({ label: 'Seat', value }));
        return;
      }
      let v = cleanValue(def, lines[i].slice(startV, endV));
      // In a sentence ("entry remains the right of…", "Silver class includes…") a plain word after
      // the label isn't its value; a printed label has a colon, or a code with digits after it.
      const prose = lines[i].split(/\s+/).length >= 6 && !/[:#]\s*$/.test(m[0]);
      if (v && prose && !/\d/.test(v) && !/^[A-Z]{1,3}$/.test(v)) v = null;
      // Label alone at the end of a line: value on the next line, if that line isn't labels
      // (or the one after, when a watermark like "ADULT TICKET" got read in between).
      if (!v && k === hits.length - 1 && !lines[i].slice(startV).trim()) {
        for (const next of [lines[i + 1], lines[i + 2]]) {
          // Another label ("Location :") means this one was left blank.
          if (!next || INLINE_RE_TEST.test(next) || /:\s*$/.test(next)) break;
          v = cleanValue(def, next);
          if (v) break;
        }
      }
      if (v) out.push({ label: def.label, value: v });
    });

    // Theatre style without labels: "Stalls J12", "Dress Circle, Row B, Seat 14", "GRAND CIRCLE B 14".
    const hasLabel = (name: string) => hits.some((m) => WORD_TO_DEF.get(m[1].toLowerCase())?.label === name);
    for (const cell of cells) {
      const area = cell.length <= 45 ? cell.match(AREA_START) : null;
      if (!area) continue;
      if (!hasLabel('Section') && !hasLabel('Block')) out.push({ label: 'Section', value: niceArea(area[1]) });
      const after = cell.slice(area[0].length).match(/^\s*[,:\-–·|]?\s*([A-Z]{1,2})\s?-?\s?(\d{1,3})(?![\d\p{L}])/u);
      if (after && !hasLabel('Seat') && !hasLabel('Row')) out.push({ label: 'Seat', value: `${after[1].toUpperCase()}${after[2]}` });
    }
  }
  return out;
}

// ---------- dates and times ----------

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, januar: 1, gennaio: 1, enero: 1, janvier: 1,
  feb: 2, february: 2, februar: 2, febbraio: 2, febrero: 2, février: 2,
  mar: 3, march: 3, märz: 3, marzo: 3, mars: 3,
  apr: 4, april: 4, aprile: 4, abril: 4, avril: 4,
  may: 5, mai: 5, maggio: 5, mayo: 5,
  jun: 6, june: 6, juni: 6, giugno: 6, junio: 6, juin: 6,
  jul: 7, july: 7, juli: 7, luglio: 7, julio: 7, juillet: 7,
  aug: 8, august: 8, agosto: 8, août: 8,
  sep: 9, sept: 9, september: 9, settembre: 9, septiembre: 9, septembre: 9,
  oct: 10, october: 10, okt: 10, oktober: 10, ottobre: 10, octubre: 10, octobre: 10,
  nov: 11, november: 11, novembre: 11, noviembre: 11,
  dec: 12, december: 12, dez: 12, dezember: 12, dicembre: 12, diciembre: 12, décembre: 12,
};
const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');

const GOOD_CONTEXT = /\b(date|event|departure|depart|departs|travel|journey|valid|show|performance|match|kick.?off|doors|start|on|sailing|outbound|arrival|datum|data|fecha|ημερομηνία)\b/i;
const BAD_CONTEXT = /\b(date\s+of\s+issue|issue\s+date|(?:must\s+be\s+)?used\s+before|use\s+before|date\s*stamp|time\s*stamp|timestamp|issued|purchased|purchase|bought|order(ed)?\s*date|booking\s*date|booked|printed|created|transaction|invoice|payment|paid|generated|expires|expiry|dob|birth)\b/i;

const pad = (n: number) => String(n).padStart(2, '0');

function validDate(y: number, m: number, d: number) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d);
  return dt.getMonth() === m - 1 ? `${y}-${pad(m)}-${pad(d)}` : null;
}

function fullYear(y: string | undefined, m: number, d: number, today: Date): number {
  if (y) return y.length === 2 ? 2000 + Number(y) : Number(y);
  // No year printed: the next time that day comes round.
  const thisYear = today.getFullYear();
  const candidate = new Date(thisYear, m - 1, d);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return candidate < startOfToday ? thisYear + 1 : thisYear;
}

export type DateHit = { date: string; line: number; score: number };

export function findDates(lines: string[], today: Date): DateHit[] {
  const hits: DateHit[] = [];
  const add = (date: string | null, line: number) => {
    if (!date) return;
    const l = lines[line];
    let score = 0;
    if (GOOD_CONTEXT.test(l) || (line > 0 && GOOD_CONTEXT.test(lines[line - 1]) && lines[line - 1].length < 30)) score += 2;
    if (BAD_CONTEXT.test(l) || (line > 0 && BAD_CONTEXT.test(lines[line - 1]) && lines[line - 1].length < 30)) score -= 5;
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const t = new Date(date).getTime();
    if (t >= start - 86_400_000) score += 1; // upcoming beats past
    if (/\b20\d{2}\b/.test(l)) score += 1; // a full date ("26 Nov 2026") beats a passing mention ("(Per 1 Nov)")
    if (t > start + 2 * 365 * 86_400_000) score -= 2; // far future is likely an expiry
    hits.push({ date, line, score });
  };

  lines.forEach((l, i) => {
    let m: RegExpExecArray | null;
    // 2027-04-14
    const iso = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g;
    while ((m = iso.exec(l))) add(validDate(+m[1], +m[2], +m[3]), i);
    // 14/04/2027, 14.04.27, 14-04-2027 (day first; month first only when it's the only valid reading)
    const num = /\b(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})\b/g;
    while ((m = num.exec(l))) {
      const a = +m[1], b = +m[2];
      const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
      add(a > 12 || b <= 12 ? validDate(y, b, a) : validDate(y, a, b), i);
    }
    // 14 Apr 2027, Wed 14th April, 14. April 2027
    const dm = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th|\\.)?\\s+(${MONTH_RE})\\.?,?(?:\\s+(\\d{4}|'?\\d{2}))?\\b`, 'gi');
    while ((m = dm.exec(l))) {
      const d = +m[1], mo = MONTHS[m[2].toLowerCase()];
      const y = m[3]?.replace("'", '');
      add(validDate(fullYear(y, mo, d, today), mo, d), i);
    }
    // April 14, 2027 / Apr 14th
    const md = new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?(?:\\s+(\\d{4}))?\\b`, 'gi');
    while ((m = md.exec(l))) {
      const mo = MONTHS[m[1].toLowerCase()], d = +m[2];
      add(validDate(fullYear(m[3], mo, d, today), mo, d), i);
    }
  });
  return hits;
}

export function parseTime(s: string): string | null {
  const m = s.match(/\b(\d{1,2})[:.h](\d{2})\s*(a\.?m\.?|p\.?m\.?)?(?![\d.])/i);
  if (!m) return null;
  let h = +m[1];
  const min = +m[2];
  const ap = m[3]?.toLowerCase().replace(/\./g, '');
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

const TIME_GOOD = /\b(depart|departure|departs|dep|start|starts|show|kick.?off|performance|time|sailing|abfahrt|partenza|salida|αναχώρηση)\b/i;
const TIME_DOORS = /\b(doors|gates open|einlass|check.?in|boarding)\b/i;

function findTime(lines: string[], dateLine: number | undefined): string | undefined {
  const timeOn = (l: string) => (BAD_CONTEXT.test(l) ? null : parseTime(l));
  // Same line as the event date, or just below it.
  if (dateLine != null) {
    for (const i of [dateLine, dateLine + 1, dateLine + 2]) {
      const l = lines[i];
      // "Date/time purchased" starts a different date: stop looking here.
      if (i > dateLine && l && BAD_CONTEXT.test(l)) break;
      if (l && !TIME_DOORS.test(l)) {
        const t = timeOn(l);
        if (t) return t;
      }
    }
  }
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (TIME_GOOD.test(l) && !TIME_DOORS.test(l) && !BAD_CONTEXT.test(l)) {
      const t = timeOn(l) ?? (l.length < 30 ? timeOn(lines[i + 1] ?? '') : null);
      if (t) return t;
    }
  }
  return undefined;
}

// ---------- kind and title ----------

// Which kind each known company sells. A company on the ticket is the strongest clue there is.
const COMPANY_KIND: Record<string, Kind> = {};
const kindFor = (k: Kind, names: string[]) => names.forEach((n) => (COMPANY_KIND[n.toLowerCase()] = k));
kindFor('flight', ['Jet2', 'easyJet', 'Ryanair', 'British Airways', 'Wizz Air', 'Aegean', 'Sky Express', 'Olympic Air', 'Lufthansa', 'KLM', 'Air France', 'Vueling', 'Iberia', 'Aer Lingus', 'Emirates', 'Qatar Airways', 'Virgin Atlantic', 'Norwegian', 'SAS', 'Swiss', 'Austrian Airlines', 'ITA Airways', 'Air New Zealand', 'Loganair', 'Eurowings', 'Transavia', 'Volotea', 'Turkish Airlines']);
kindFor('ferry', ['Ionian Lines', 'Kefalonian Lines', 'Levante Ferries', 'Minoan Lines', 'ANEK', 'Blue Star Ferries', 'Seajets', 'Hellenic Seaways', 'Superfast Ferries', 'Golden Star Ferries', 'Ferryhopper', 'Brittany Ferries', 'P&O Ferries', 'Stena Line', 'DFDS', 'Irish Ferries', 'Red Funnel', 'Wightlink', 'CalMac', 'Condor Ferries', 'Grimaldi', 'Moby', 'Tirrenia', 'Corsica Ferries', 'Baleària']);
kindFor('train', ['SplitSave', 'TrainPal', 'Seatfrog', 'Raileasy', 'SplitMyFare', 'Eurostar', 'Trainline', 'LNER', 'GWR', 'Avanti West Coast', 'CrossCountry', 'ScotRail', 'Southern', 'Thameslink', 'Northern', 'TransPennine Express', 'Southeastern', 'South Western Railway', 'Chiltern Railways', 'Trenitalia', 'Italo', 'SNCF', 'Deutsche Bahn', 'ÖBB', 'Renfe', 'Hellenic Train']);
kindFor('bus', ['FlixBus', 'National Express', 'Megabus', 'KTEL']);
kindFor('stay', ['Booking.com', 'Airbnb', 'Hotels.com']);
kindFor('activity', ['GetYourGuide', 'Viator', 'Klook', 'Tiqets', 'Fever']);

// Each kind scores points for the words on the ticket; the best score wins. Strong clues
// (words only that kind of ticket uses) count 3, weaker ones 1. Ticket words like
// "ticket" or "admission" are on every kind of ticket, so they only decide when nothing else does.
const CLUES: [Kind, number, RegExp][] = [
  ['ferry', 3, /\b(ferry|ferries|vessel|sailing|embarkation|deck passenger|vehicle deck)\b|ναυτιλ|πλοίο/giu],
  ['ferry', 1, /\b(port|ship|crossing|quay|harbour|harbor)\b/gi],
  ['flight', 3, /\b(boarding pass|flight|airline|gate closes|boarding time|baggage|cabin bag|check-?in closes)\b/gi],
  ['flight', 1, /\b(terminal|airport|gate|seq|priority)\b/gi],
  ['train', 3, /\b(train|rail|railway|railcard|off-?peak|super off-?peak|anytime (day )?(single|return)|advance single|any permitted|route:? any|valid (on|until)|platform|carriage|coach [a-z]\b|seat reservation|station|bahn|trenitalia|eurostar|e-?ticket for travel)\b/gi],
  ['train', 1, /\b(single|return|outward|inbound|depart(s|ure)?|arriv(e|es|al)|reservation)\b/gi],
  ['bus', 3, /\b(bus|coach station|ktel|flixbus|national express|megabus)\b/gi],
  ['visa', 3, /\b(e-?visa|visa|e-?voa|esta|electronic travel authori[sz]ation|entry permit|passport|immigration|levy|tourist tax|arrival card)\b/gi],
  ['car', 3, /\b(car hire|car rental|rental agreement|pick-?up location|hertz|avis|europcar|sixt|enterprise rent|parking)\b/gi],
  ['medical', 3, /\b(appointment|clinic|hospital|vaccination|vaccine|pharmacy|gp|dentist|medical)\b/gi],
  ['event', 3, /\b(theatre|theater|musical|matinee|stalls|dress circle|royal circle|grand circle|upper circle|west end|broadway|performance|ballet|opera|comedy)\b/gi],
  ['gig', 3, /\b(concert|gig|festival|doors open|support act|headliner|standing|live music)\b/gi],
  ['gig', 1, /\b(tour|live|arena|academy|o2)\b/gi],
  ['activity', 3, /\b(excursion|activity|experience|lesson|boat trip|day trip|guided tour|waterpark|aquapark|theme park|zoo|meeting point|tour guide|skip the line)\b/gi],
  ['activity', 1, /\b(museum|cruise|class|tour|attraction)\b/gi],
  ['event', 1, /\b(admission|entry|venue|match|stadium|race|kick-?off|ground)\b/gi],
];

/** Score every kind and pick the best, so one stray word ("tour", "port") can't win on its own. */
export function guessKind(text: string): Kind | undefined {
  if (looksLikeStay(text)) return 'stay';
  const company = findCompany(text);
  const byCompany = company ? COMPANY_KIND[company.toLowerCase()] : undefined;
  // A ticket seller like GetYourGuide sells all sorts, so only trust it if nothing else is clearer.
  if (byCompany && byCompany !== 'activity' && byCompany !== 'stay') return byCompany;
  const score = new Map<Kind, number>();
  for (const [kind, points, re] of CLUES) {
    const hits = text.match(re)?.length ?? 0;
    if (hits) score.set(kind, (score.get(kind) ?? 0) + points * Math.min(hits, 3));
  }
  if (byCompany) score.set(byCompany, (score.get(byCompany) ?? 0) + 3);
  let best: Kind | undefined;
  let top = 0;
  for (const [kind, n] of score) if (n > top) [best, top] = [kind, n];
  if (best) return best;
  return /\b(tickets?|admit)\b/i.test(text) ? 'event' : undefined;
}

function findRoute(lines: string[]): string | undefined {
  let from: string | undefined;
  let to: string | undefined;
  let arrowLine = -1;
  const place = (s: string) => {
    const v = s.replace(/^[:\-–\s]+/, '').split(/\t|\s{2,}|\d{1,2}[:.]\d{2}|\(/)[0].trim();
    return v.length >= 3 && v.length <= 30 && /^[\p{L}][\p{L} .'-]+$/u.test(v) ? v : undefined;
  };
  const UI = /^(add|share|save|view|go|back|open|apple|wallet|download|print|email|send|next|previous|close|options|ticket|route|adult|child|valid)\b/i;
  const notPlace = (x: string) => UI.test(x.trim()) || INLINE_RE_TEST.test(x) || AREA_ANY.test(x);
  const ARROW = [
    /^([\p{L} .'-]{3,30}?)\s*(?:→|->|>|⇒|=>)\s*([\p{L} .'-]{3,30})$/u,
    /^([\p{L} .'-]{3,30}?)\s+(?:–|—|-|to)\s+([\p{L} .'-]{3,30})$/u,
  ];
  lines.forEach((l, i) => {
    const f = l.match(/^(from|departure port|origin|von|da|desde|από)\b[:\s]*(.*)$/i);
    const t = l.match(/^(to|arrival port|destination|nach|a|hasta|προς)\b[:\s]*(.*)$/i);
    if (f && !from) from = place(f[2]) ?? place(lines[i + 1] ?? '');
    if (t && !to) to = place(t[2]) ?? place(lines[i + 1] ?? '');
    if (from || to) return;
    // "Cardiff → London", or "SSD - BIS" sitting in one cell of a row ("Route : Bangsal - Padang Bai" too)
    for (const cell of [l.replace(/\t/g, ' '), ...l.split('\t')]) {
      const c = cell.trim().replace(/^(route|journey|trip|sailing|line)\s*:\s*/i, '');
      const arrow = ARROW.map((re) => c.match(re)).find(Boolean);
      if (arrow && /[A-Z]/.test(arrow[1][0]) && !notPlace(arrow[1]) && !notPlace(arrow[2])) {
        from = place(arrow[1]);
        to = place(arrow[2]);
        if (from && to) {
          arrowLine = i;
          return;
        }
        from = to = undefined;
      }
    }
  });
  if (!from || !to) return undefined;
  // Station or airport codes ("SSD → BIS"): use the full names printed next to them if there are any.
  const isCode = (x: string) => /^[A-Z]{3}$/.test(x.trim());
  if (isCode(from) && isCode(to) && arrowLine >= 0) {
    const near = lines.slice(Math.max(0, arrowLine - 3), arrowLine + 4);
    const names: string[] = [];
    for (const l of near) {
      const cells = l.split('\t').map((c) => c.trim());
      const ok = cells.filter((c) => c.length > 4 && !isCode(c) && /\p{Ll}/u.test(c) && place(c) && !notPlace(c) && !/\d/.test(c));
      if (cells.length === 2 && ok.length === 2) {
        names.splice(0, names.length, ...ok);
        break;
      }
      if (cells.length === 1 && ok.length === 1 && names.length < 2) names.push(ok[0]);
    }
    if (names.length === 2) [from, to] = names;
  }
  return `${titleCase(from)} → ${titleCase(to)}`;
}

const titleCase = (s: string) =>
  s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (c) => c.toUpperCase()) : s;

// ---------- event titles (screenshots have no useful file name) ----------

const BRANDS = /^(splitsave|split save|splitmyfare|trainpal|seatfrog|raileasy|railsmartr|national rail|omio|ticketmaster|live nation|atg|atg tickets|axs|see tickets|seetickets|eventim|eventbrite|dice|skiddle|todaytix|lovetheatre|love theatre|london theatre direct|delfont|mackintosh|delfont mackintosh( theatres)?|theatres|nimax( theatres)?|ambassador theatre group|trainline|gigantic|fatsoma|tixr|stubhub|viagogo|twickets|ticketswap|fever|klook|getyourguide|viator|tiqets)$/i;
const UI_TEXT = /^(log ?in|sign ?in|sign up|log out|my account|back|done|close|cancel|share|edit|more|menu|home|account|help|info|information|details|(ticket|event|order|booking) details|(my|your) (tickets?|orders?|bookings?)|tickets?|e-?tickets?|mobile tickets?|m-?tickets?|(view|show|see) (tickets?|order|details|more)|orders?|upcoming|past|events?|add to (apple )?wallet|add to google (wallet|pay)|transfer|sell|resale|directions|get directions|map|show more|admit one|admission|general admission|standard|adult|child|concession|full price|venue|date|time|location|barcode|qr code|ticket holder|name|today|tomorrow|tonight|booking confirmed|order confirmed|confirmed|you'?re going!?|enjoy the show!?|search|settings|wallet|for you|discover|available offline|offline|options|your ticket|your tickets|show ticket details|ticket details|show details|add to apple wallet|valid until|ticket type|route|railcard)$/i;
/** Apps a screenshot's status bar offers to go back to ("◀ Gmail"). */
const BACK_APP = /^(\d{1,2}\s+)?(?:<\s*)?(gmail|mail|outlook|safari|chrome|photos|messages|whatsapp|instagram|facebook|messenger|notes|files|wallet|app store|telegram|slack|teams|yahoo mail|spark)$/i;
const NOT_TITLE = /^(adult|child|children|senior|family|student|infant|concession|day pass|season pass|qty|quantity|price|total|scan|present|show this|please|this ticket|ticket \d|\d+ of \d+|\d+ tickets?|order|booking|ref|subtotal|fee|terms|conditions|t&cs|doors|gates|age|over|under)\b/i;
const VENUE = /\b(theatres?|theaters?|arena|stadium|hall|academy|centre|center|club|palace|pavilion|opera house|coliseum|apollo|lyceum|forum|ballroom|playhouse|dome|bowl|gardens?|ground|square|street|road|lane|london|manchester|glasgow|dublin|birmingham)\b/i;
const SMALL = new Set(['of', 'the', 'and', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'de', 'la', 'le', 'du', 'des', 'et']);

function niceTitle(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t !== t.toUpperCase()) return t;
  return t
    .toLowerCase()
    .split(' ')
    .map((w, k) =>
      /\p{L}\.\p{L}/u.test(w) ? w.toUpperCase() : k > 0 && SMALL.has(w) ? w : w.replace(/^(\P{L}*)(\p{L})/u, (_, a, b) => a + b.toUpperCase()),
    )
    .join(' ');
}

/** The show, match or attraction name: near the top, not a date, label, button, brand or venue. */
export function findEventTitle(lines: string[], today = new Date()): string | undefined {
  let best: { title: string; score: number } | undefined;
  const top = lines.slice(0, 25);
  const isWhen = (x: string | undefined) => !!x && (findDates([x], today).length > 0 || !!parseTime(x));
  top.forEach((line, i) => {
    const cells = line.split(/\t/);
    cells.forEach((raw, k) => {
      const c = raw
        .trim()
        .replace(/^[<‹←❮>›•·●○◦▪■□*|©®@]+\s*/, '')
        .replace(/\s*[>›→]+$/, '')
        .trim();
      const letters = (c.match(/\p{L}/gu) ?? []).length;
      const digits = (c.match(/\d/g) ?? []).length;
      if (c.length < 3 || c.length > 50 || letters < 3) return;
      if (digits / c.length > 0.25) return;
      if (/^\d{1,2}[:.]\d{2}/.test(c) || /\b(5G|4G|LTE)\b/.test(c) || /%$/.test(c)) return;
      // The phone's status bar: "◀ Gmail" (back to the app you came from), often read with the clock as "4 Gmail".
      if (i < 3 && (/[◀◂]/.test(c) || BACK_APP.test(c.replace(/^</, '').trim()))) return;
      if (UI_TEXT.test(c) || BRANDS.test(c) || NOT_TITLE.test(c) || labelAt(c) || AREA_ANY.test(c)) return;
      if (/@|www\.|https?:|\.(com|co\.uk|org|net)\b/i.test(c)) return;
      if (/[-–]$/.test(c)) return; // a word cut off at the edge of a poster
      if (isWhen(c)) return;
      const words = c.split(/\s+/).length;
      if (words > 9 || (words > 5 && /[.!?]$/.test(c))) return;

      let score = 20 - i;
      // Mixed case reads as a real title; lone capitalised words are usually logos or poster art.
      if (c !== c.toUpperCase()) score += 2;
      if (words === 1) score -= 3;
      if (/^the\s/i.test(c)) score += 1;
      if (VENUE.test(c)) score -= 7;
      if (/ticket|order|booking|confirmation|receipt/i.test(c)) score -= 6;
      if (/^(mr|mrs|ms|miss|dr)\.?\s/i.test(c)) score -= 10;
      // Titles sit just above the date or venue, best of all in the same column.
      const next = top[i + 1]?.split(/\t/);
      const sameColumn = next && next.length === cells.length ? next[k] : next?.length === 1 ? next[0] : undefined;
      // Some apps (GetYourGuide) put the title just under the date instead.
      if (isWhen(top[i - 1]) && !isWhen(c)) score += 4;
      if (isWhen(sameColumn) || (sameColumn && VENUE.test(sameColumn))) score += 8;
      else {
        const below = top.slice(i + 1, i + 3).join(' ');
        if (VENUE.test(below) || isWhen(below)) score += 4;
      }
      if (!best || score > best.score) best = { title: niceTitle(c), score };
    });
  });
  return best && best.score > 0 ? best.title : undefined;
}

// ---------- company (airline, ferry line, ticket seller) ----------

const COMPANIES = [
  // airlines
  'Jet2', 'easyJet', 'Ryanair', 'British Airways', 'Wizz Air', 'TUI', 'Aegean', 'Sky Express', 'Olympic Air', 'Lufthansa', 'KLM',
  'Air France', 'Vueling', 'Iberia', 'Aer Lingus', 'Emirates', 'Qatar Airways', 'Virgin Atlantic', 'Norwegian', 'SAS', 'Swiss',
  'Austrian Airlines', 'ITA Airways', 'Air New Zealand', 'Loganair', 'Eurowings', 'Transavia', 'Volotea', 'Turkish Airlines',
  // ferries
  'Ionian Lines', 'Kefalonian Lines', 'Levante Ferries', 'Minoan Lines', 'ANEK', 'Blue Star Ferries', 'Seajets', 'Hellenic Seaways',
  'Superfast Ferries', 'Golden Star Ferries', 'Ferryhopper', 'Brittany Ferries', 'P&O Ferries', 'Stena Line', 'DFDS', 'Irish Ferries',
  'Red Funnel', 'Wightlink', 'CalMac', 'Condor Ferries', 'Grimaldi', 'Moby', 'Tirrenia', 'Corsica Ferries', 'Baleària',
  // trains and coaches
  'Eurostar', 'Trainline', 'LNER', 'GWR', 'Avanti West Coast', 'CrossCountry', 'ScotRail', 'Southern', 'Thameslink', 'Northern',
  'TransPennine Express', 'Southeastern', 'South Western Railway', 'Chiltern Railways', 'Trenitalia', 'Italo', 'SNCF', 'Deutsche Bahn',
  'ÖBB', 'Renfe', 'Hellenic Train', 'SplitSave', 'TrainPal', 'Seatfrog', 'Raileasy', 'SplitMyFare', 'FlixBus', 'National Express', 'Megabus', 'KTEL', 'Omio',
  // tickets and venues
  'Ticketmaster', 'AXS', 'See Tickets', 'Eventim', 'DICE', 'Eventbrite', 'Skiddle', 'Fatsoma', 'ATG Tickets', 'Delfont Mackintosh',
  'Nimax', 'LW Theatres', 'LOVEtheatre', 'TodayTix', 'Live Nation', 'Gigantic', 'Twickets', 'Universe', 'Tixr', 'GetYourGuide',
  'Viator', 'Klook', 'Tiqets', 'Fever', 'Booking.com', 'Airbnb', 'Expedia', 'Hotels.com',
];
// Spaces in names match any gap, so logos split over lines ("DELFONT\nMACKINTOSH") still count.
const COMPANY_RE = new RegExp(
  `(?<![\\p{L}\\d])(${COMPANIES.map((c) => escapeRe(c).replace(/ /g, '\\s+')).sort((a, b) => b.length - a.length).join('|')})(?![\\p{L}])`,
  'iu',
);

/** A line that is only an operator's name: one to three words, then a word like Ferry, Lines or Airways. */
const OPERATOR_RE = /^[ \t]*((?:[\p{Lu}][\p{L}&'.-]*[ \t]+){1,3}(?:fast[ \t]+ferry|fast[ \t]+boats?|ferries|ferry|lines|shipping|airlines|airways|railways?|coaches|cruises))[ \t]*$/imu;

/** The airline, ferry line or ticket seller named on the ticket, if it's one we know. */
export function findCompany(text: string): string | undefined {
  const m = text.match(COMPANY_RE);
  if (!m) {
    // Logos OCR badly; some companies give themselves away another way.
    if (/\bget\s*your\s*guide\b|\bGYG[A-Z0-9]{6,}\b/i.test(text)) return 'GetYourGuide';
    if (/\bsplit\s*save\b/i.test(text)) return 'SplitSave';
    // Not one we know: a heading that names a ferry line, airline or coach company ("EKAJAYA FAST FERRY").
    const named = text.match(OPERATOR_RE);
    return named ? titleCase(named[1].replace(/\s+/g, ' ')) : undefined;
  }
  const found = m[1].replace(/\s+/g, ' ').toLowerCase();
  return COMPANIES.find((c) => c.toLowerCase() === found) ?? m[1];
}

// ---------- boarding passes (IATA BCBP, the standard in airline barcodes) ----------

export type BoardingPass = {
  name: string;
  ref: string;
  from: string;
  to: string;
  flight: string;
  date?: string;
  seat?: string;
};

export function parseBoardingPass(payload: string | undefined, today = new Date()): BoardingPass | null {
  if (!payload || payload.length < 58 || !/^M[1-9]/.test(payload)) return null;
  const from = payload.slice(30, 33);
  const to = payload.slice(33, 36);
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) return null;
  const carrier = payload.slice(36, 39).trim();
  const number = payload.slice(39, 44).trim().replace(/^0+(?=\d)/, '');
  const julian = Number(payload.slice(44, 47));
  const seat = payload.slice(48, 52).trim().replace(/^0+(?=\d)/, '');
  let date: string | undefined;
  if (julian >= 1 && julian <= 366) {
    // The pass only carries the day of the year: pick the nearest year that isn't long past.
    const thisYear = today.getFullYear();
    let d = new Date(thisYear, 0, julian);
    if (d.getTime() < today.getTime() - 60 * 86_400_000) d = new Date(thisYear + 1, 0, julian);
    date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  const rawName = payload.slice(2, 22).trim();
  const [last, firstRaw] = rawName.split('/');
  const first = firstRaw?.replace(/\s*(MRS|MR|MS|MISS|MSTR|DR|PROF|SIR|REV)$/i, '').trim();
  const nice = (w?: string) => (w ? w.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (c) => c.toUpperCase()) : '');
  return {
    name: [nice(first), nice(last)].filter(Boolean).join(' '),
    ref: payload.slice(23, 30).trim(),
    from,
    to,
    flight: `${carrier}${number}`,
    date,
    seat: seat && seat !== '0' && !/^[A-Z]*$/.test(seat) ? seat : undefined,
  };
}

/** Find the printed form of a barcode name, e.g. "JONESGARDNER/RIVER" → "River Jones-Gardner". */
export function printedName(barcodeName: string, text: string): string | undefined {
  const key = (x: string) => x.toLowerCase().replace(/[^\p{L}]/gu, '');
  const parts = barcodeName.split(' ').filter(Boolean);
  if (parts.length < 2) return undefined;
  const want = new Set([key(parts.join('')), key([...parts.slice(1), parts[0]].join(''))]);
  const TITLE = /^(mr|mrs|ms|miss|mstr|dr|prof|sir|rev)\.?$/i;
  for (const line of text.split(/\r?\n/)) {
    for (const cell of line.split(/\t|\s{2,}|\s\/\s/)) {
      const words = cell.trim().split(/\s+/).filter((w) => !TITLE.test(w) && /\p{L}/u.test(w));
      for (let a = 0; a < words.length; a++) {
        for (let b = a + 2; b <= Math.min(words.length, a + 5); b++) {
          const candidate = words.slice(a, b);
          if (want.has(key(candidate.join('')))) {
            return candidate
              .join(' ')
              .toLowerCase()
              .replace(/(^|[\s'\-])\p{L}/gu, (c) => c.toUpperCase());
          }
        }
      }
    }
  }
  return undefined;
}

// ---------- main ----------

const uniq = (ds: Detail[]) => {
  const seen = new Set<string>();
  return ds.filter((d) => {
    const k = `${d.label}|${d.value}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

const PER_TICKET = new Set([...LABELS.filter((l) => l.perTicket).map((l) => l.label), 'Flight', 'Passenger']);

/**
 * @param pages each page's text and how many codes were found on it, in order
 * @param ticketCount total tickets the importer created
 */
/** Travel documents say what they are: "Bali Tourist Levy", "Indonesia Visa on Arrival". */
function documentTitle(text: string): string | undefined {
  const doc = /levy\s+voucher|tourist\s+levy|tourism\s+levy/i.test(text)
    ? 'Tourist Levy'
    : /\be-?voa\b|visa\s+on\s+arrival/i.test(text)
      ? 'Visa on Arrival'
      : /\be-?visa\b/i.test(text)
        ? 'e-Visa'
        : /\besta\b/i.test(text)
          ? 'ESTA'
          : /electronic\s+travel\s+authori[sz]ation/i.test(text)
            ? 'ETA'
            : undefined;
  if (!doc) return undefined;
  // Where it's for: "Bali Provincial Government", "Republic of Indonesia", "Indonesia Immigration".
  const place =
    text.match(/\b([A-Z][a-z]+)\s+Provincial\s+Government\b/)?.[1] ??
    text.match(/\bRepublic\s+of\s+([A-Z][a-z]+)\b/)?.[1] ??
    text.match(/\b([A-Z][a-z]+)\s+Immigration\b/)?.[1];
  return place ? `${place} ${doc}` : doc;
}

export function extractDetails(pages: PageText[], ticketCount: number, today = new Date()): Extracted {
  const allText = pages.map((p) => p.text).join('\n');
  const lines = allText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const dates = findDates(lines, today);
  dates.sort((a, b) => b.score - a.score || a.date.localeCompare(b.date));
  const best = dates[0] && dates[0].score >= 0 ? dates[0] : undefined;
  const time = findTime(lines, best?.line);

  // Details per page, then split into shared and per-ticket.
  const pageDetails = pages.map((p) => uniq(findDetails(p.text)));
  const shared: Detail[] = [];
  const perTicket: Detail[][] = [];

  const first: { pass: BoardingPass | null } = { pass: null };
  pages.forEach((p, i) => {
    const ds = pageDetails[i];
    const passes = (p.payloads ?? []).map((x) => parseBoardingPass(x, today));
    const mine = ds.filter((d) => PER_TICKET.has(d.label));
    ds.filter((d) => !PER_TICKET.has(d.label)).forEach((d) => {
      if (!shared.some((s) => s.label === d.label)) shared.push(d);
    });
    const slots = p.codes;
    if (!slots) return;
    // Several codes on one page: hand out each label's values in order if the counts match.
    const byLabel = new Map<string, string[]>();
    mine.forEach((d) => byLabel.set(d.label, [...(byLabel.get(d.label) ?? []), d.value]));
    for (let k = 0; k < slots; k++) {
      const list: Detail[] = [];
      const bp = passes[k];
      if (bp) {
        first.pass = first.pass ?? bp;
        list.push({ label: 'Flight', value: bp.flight });
        if (bp.seat) list.push({ label: 'Seat', value: bp.seat });
        if (bp.name) list.push({ label: 'Passenger', value: printedName(bp.name, p.text) ?? bp.name });
      }
      byLabel.forEach((values, label) => {
        if (list.some((d) => d.label === label)) return; // the barcode already said
        if (values.length === slots) list.push({ label, value: values[k] });
        else if (values.length === 1) list.push({ label, value: values[0] });
        else if (slots === 1) list.push({ label, value: values.join(', ') });
      });
      perTicket.push(list);
    }
  });
  while (perTicket.length < ticketCount) perTicket.push([]);

  // Booking reference from the boarding pass if the text didn't show one; flight number isn't a shared detail.
  const pass = first.pass;
  if (pass && !shared.some((d) => d.label === 'Ref') && pass.ref) shared.push({ label: 'Ref', value: pass.ref });
  for (let i = shared.length - 1; i >= 0; i--) if (shared[i].label === 'Flight' && pass) shared.splice(i, 1);

  // No start time printed: use doors so the reminder still lands sensibly (boarding stays a detail).
  const doors = shared.find((d) => d.label === 'Doors') ?? (time ? undefined : shared.find((d) => d.label === 'Boarding'));
  const departs = shared.find((d) => d.label === 'Departs');
  if (departs) shared.splice(shared.indexOf(departs), 1);
  const startTime = departs?.value ?? time ?? doors?.value;
  if (doors && doors.value === startTime) shared.splice(shared.indexOf(doors), 1);

  const company = findCompany(allText);
  if (company && !shared.some((d) => d.label === 'Company')) shared.unshift({ label: 'Company', value: company });

  const bp = pass;
  const kind: Kind | undefined = bp ? 'flight' : guessKind(allText);

  // A long code under "group" is a booking code (GetYourGuide), not a boarding group.
  for (const list of [shared, ...perTicket]) for (const d of list) if (d.label === 'Group' && /^[A-Z0-9]{8,}$/i.test(d.value)) d.label = 'Ref';
  // UK rail: the fare and railcard are what the guard checks.
  if (kind === 'train') {
    const fare = allText.match(/\b((?:super\s+)?off-?peak(?:\s+day)?|anytime(?:\s+day)?|advance|flexi(?:\s*season)?)\s+(single|return)\b/i);
    if (fare && !shared.some((d) => d.label === 'Fare')) shared.push({ label: 'Fare', value: niceTitle(fare[0].replace(/\s+/g, ' ')) });
    const card = allText.match(/\b(16-25|26-30|16-17|senior|two together|family (?:&|and) friends|network|disabled persons|veterans|hm forces|santander|gold card)\s+railcard\b/i);
    if (card && !shared.some((d) => d.label === 'Railcard')) shared.push({ label: 'Railcard', value: niceTitle(card[1]) });
  }
  const route = findRoute(lines) ?? (bp ? `${bp.from} → ${bp.to}` : undefined);
  const firstPage = (pages[0]?.text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const travel = kind === 'ferry' || kind === 'train' || kind === 'bus' || kind === 'flight';
  const title =
    (kind === 'visa' ? documentTitle(allText) : undefined) ??
    (travel ? route ?? findEventTitle(firstPage, today) : findEventTitle(firstPage, today) ?? route);
  return {
    date: best?.date ?? bp?.date,
    time: startTime,
    kind,
    title,
    shared,
    perTicket: perTicket.slice(0, ticketCount),
  };
}
