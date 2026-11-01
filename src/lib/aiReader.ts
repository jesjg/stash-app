// Combines what Apple's on-device model read with what Stash's own reader found.
// Stash's reader goes first; the model only fills gaps and fixes titles, and only with
// values that can be found printed on the ticket, so a made-up answer is never used.
// Pure functions, no I/O, so it's easy to test.
import type { Extracted } from './extract';
import type { Detail, Kind } from './types';

/** Same shape as AIRead in modules/stubs-scanner (kept separate so tests don't load native code). */
export type AIAnswer = {
  kind?: string;
  title?: string;
  company?: string;
  date?: string;
  time?: string;
  details?: { label: string; value: string }[];
};

const KINDS: Kind[] = ['flight', 'train', 'ferry', 'bus', 'car', 'stay', 'gig', 'event', 'activity', 'visa', 'medical', 'other'];
const TRAVEL = new Set<Kind>(['flight', 'train', 'ferry', 'bus']);

/** Labels the model may add, as Stash names them. */
const LABELS = new Map(
  ['Seat', 'Row', 'Section', 'Block', 'Coach', 'Cabin', 'Gate', 'Entrance', 'Door', 'Platform', 'Terminal', 'Deck', 'Doors', 'Boarding', 'Flight', 'Ref', 'Passenger'].map(
    (l) => [l.toLowerCase(), l] as const,
  ),
);
const PER_TICKET = new Set(['Seat', 'Row', 'Section', 'Block', 'Coach', 'Cabin', 'Passenger', 'Flight']);

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const bare = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** True if the value is printed on the ticket (ignoring case, spacing and punctuation). */
export function printed(value: string, text: string): boolean {
  const v = bare(value);
  if (v.length < 1) return false;
  if (squash(text).includes(squash(value))) return true;
  return v.length >= 3 && bare(text).includes(v);
}

/** True if most of the title's words are on the ticket (the arrow and joining words don't count). */
function titleOnTicket(title: string, text: string): boolean {
  const words = title
    .split(/[\s→\-–—:,/|()]+/)
    .map(bare)
    .filter((w) => w.length >= 3 && !['the', 'and', 'for', 'with', 'from', 'tour', 'ticket'].includes(w));
  if (!words.length) return false;
  const hay = bare(text);
  const hits = words.filter((w) => hay.includes(w)).length;
  return hits / words.length >= 0.75;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** True if the date can be seen on the ticket in some common form. */
function dateOnTicket(date: string, text: string): boolean {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const [, y, mo, d] = m;
  const day = String(Number(d));
  const month = Number(mo);
  if (month < 1 || month > 12 || Number(d) < 1 || Number(d) > 31) return false;
  const t = text.toLowerCase();
  if (t.includes(date)) return true;
  // 14/11/2026, 14.11.26, 11/14/2026
  const num = new RegExp(`\\b0?${day}[./-]0?${month}[./-](${y}|${y.slice(2)})\\b|\\b0?${month}[./-]0?${day}[./-](${y}|${y.slice(2)})\\b`);
  if (num.test(t)) return true;
  // 14 Nov, Nov 14, 14NOV, November 14th
  const mon = MONTHS[month - 1];
  return new RegExp(`\\b0?${day}(st|nd|rd|th)?\\s*${mon}|\\b${mon}[a-z]*\\.?\\s*0?${day}(st|nd|rd|th)?\\b`).test(t);
}

/** True if the time is printed: 14:05, 14.05, 1405, 2:05 pm. */
function timeOnTicket(time: string, text: string): boolean {
  const m = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return false;
  const h = Number(m[1]);
  const min = m[2];
  if (h > 23 || Number(min) > 59) return false;
  const t = text.toLowerCase();
  if (new RegExp(`(^|[^\\d])0?${h}[:.h]${min}(?!\\d)`).test(t)) return true;
  if (new RegExp(`(^|[^\\d])${String(h).padStart(2, '0')}${min}(?!\\d)`).test(t)) return true;
  const h12 = h % 12 || 12;
  const ampm = h < 12 ? 'a' : 'p';
  const clock = min === '00' ? `([:.]00)?` : `[:.]${min}`;
  return new RegExp(`(^|[^\\d])0?${h12}${clock}\\s*${ampm}\\.?m`).test(t);
}

/**
 * Adds what the model read to what Stash found. Returns a new result plus which fields the
 * model supplied (for the hint on the confirm screen).
 */
export function mergeAI(found: Extracted, ai: AIAnswer | null, text: string, ticketCount: number): Extracted & { fromAI: string[] } {
  const out: Extracted & { fromAI: string[] } = {
    ...found,
    shared: [...found.shared],
    perTicket: found.perTicket.map((l) => [...l]),
    fromAI: [],
  };
  if (!ai) return out;

  const kind = KINDS.find((k) => k === ai.kind);
  if (!out.kind && kind) {
    out.kind = kind;
    out.fromAI.push('kind');
  }

  if (!out.date && ai.date && dateOnTicket(ai.date, text)) {
    out.date = ai.date;
    out.fromAI.push('date');
  }
  if (!out.time && ai.time && timeOnTicket(ai.time, text)) {
    out.time = ai.time;
    out.fromAI.push('time');
  }

  // A route read from labelled From/To fields is reliable; otherwise the model is better at titles.
  const title = ai.title?.trim();
  const keepRoute = !!out.title && out.title.includes('→') && TRAVEL.has(out.kind as Kind);
  if (title && title.length >= 3 && title.length <= 60 && !keepRoute && titleOnTicket(title, text) && title !== out.title) {
    out.title = title;
    out.fromAI.push('title');
  }

  const has = (label: string) => out.shared.some((d) => d.label === label) || out.perTicket.some((l) => l.some((d) => d.label === label));
  const company = ai.company?.trim();
  if (company && company.length <= 40 && !has('Company') && printed(company, text)) {
    out.shared.unshift({ label: 'Company', value: company });
  }

  for (const raw of ai.details ?? []) {
    const label = LABELS.get(raw.label?.trim().toLowerCase() ?? '');
    const value = raw.value?.trim();
    if (!label || !value || value.length > 40 || has(label) || !printed(value, text)) continue;
    const detail: Detail = { label, value };
    if (!PER_TICKET.has(label)) out.shared.push(detail);
    // With several tickets the model can't say whose seat it is: leave those to Stash's reader.
    else if (ticketCount === 1) (out.perTicket[0] ??= []).push(detail);
  }
  return out;
}
