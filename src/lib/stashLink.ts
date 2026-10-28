// "Add to Stash" links: a company puts the ticket inside the link itself, so no server is needed.
//   https://jesjg.github.io/stubs-app/add/#<data>   (web page: opens Stash, or shows the ticket)
//   stubs://import?d=<data>                                 (opens Stash directly)
// <data> is the ticket as compact JSON, UTF-8, base64url. The same format is read by docs/add and
// written by docs/maker, so keep the three in step.
import type { Detail, Kind } from './types';

export const LINK_PAGE = 'https://jesjg.github.io/stubs-app/add/';

export type LinkTicket = {
  v: 1;
  /** Title, e.g. "Nidri → Kefalonia" */
  t: string;
  /** Kind (ferry, activity, event…) */
  k?: Kind;
  /** YYYY-MM-DD */
  d: string;
  /** HH:mm */
  tm?: string;
  /** Company name */
  c?: string;
  /** Booking reference */
  ref?: string;
  /** Instructions for the day: meeting point, what to bring */
  info?: string;
  /** Shared details: [label, value] */
  sh?: [string, string][];
  /** One entry per ticket: q = QR contents, s = that ticket's details (seat, name…) */
  x: { q: string; s?: [string, string][] }[];
};

const KINDS: Kind[] = ['ferry', 'train', 'flight', 'bus', 'car', 'stay', 'gig', 'event', 'activity', 'visa', 'medical', 'other'];
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function utf8Bytes(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    let c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else {
      c = Math.min(c, 0x10ffff);
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
  }
  return out;
}

function utf8String(b: number[]): string {
  let s = '';
  for (let i = 0; i < b.length; ) {
    const x = b[i++];
    if (x < 0x80) s += String.fromCodePoint(x);
    else if (x < 0xe0) s += String.fromCodePoint(((x & 31) << 6) | (b[i++] & 63));
    else if (x < 0xf0) s += String.fromCodePoint(((x & 15) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63));
    else s += String.fromCodePoint(((x & 7) << 18) | ((b[i++] & 63) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63));
  }
  return s;
}

export function encodeLink(t: LinkTicket): string {
  const b = utf8Bytes(JSON.stringify(t));
  let out = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (i + 1 < b.length) out += B64[(n >> 6) & 63];
    if (i + 2 < b.length) out += B64[n & 63];
  }
  return out;
}

export function decodeLink(data: string): LinkTicket | null {
  try {
    const clean = data.trim().replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const bytes: number[] = [];
    for (let i = 0; i < clean.length; i += 4) {
      const n =
        (B64.indexOf(clean[i]) << 18) |
        (B64.indexOf(clean[i + 1]) << 12) |
        ((i + 2 < clean.length ? B64.indexOf(clean[i + 2]) : 0) << 6) |
        (i + 3 < clean.length ? B64.indexOf(clean[i + 3]) : 0);
      bytes.push((n >> 16) & 255);
      if (i + 2 < clean.length) bytes.push((n >> 8) & 255);
      if (i + 3 < clean.length) bytes.push(n & 255);
    }
    const t = JSON.parse(utf8String(bytes)) as LinkTicket;
    if (t.v !== 1 || typeof t.t !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(t.d) || !Array.isArray(t.x) || !t.x.length) return null;
    if (t.k && !KINDS.includes(t.k)) t.k = undefined;
    return t;
  } catch {
    return null;
  }
}

/** Pull the ticket data out of any form of the link: page URL with #data, stubs://import?d=, or the bare data. */
export function dataFromUrl(url: string): string | null {
  const hash = url.match(/#([A-Za-z0-9_-]{8,})$/);
  if (hash) return hash[1];
  const q = url.match(/[?&]d=([A-Za-z0-9_-]{8,})/);
  if (q) return q[1];
  return /^[A-Za-z0-9_-]{16,}$/.test(url) ? url : null;
}

const pairs = (p?: [string, string][]): Detail[] =>
  (p ?? []).filter((x) => Array.isArray(x) && x[0] && x[1]).map(([label, value]) => ({ label: String(label).slice(0, 24), value: String(value).slice(0, 60) }));

/** Turn a link ticket into the shared and per-ticket details Stash shows. */
export function linkDetails(t: LinkTicket): { shared: Detail[]; perTicket: Detail[][] } {
  const shared: Detail[] = [];
  if (t.c) shared.push({ label: 'Company', value: t.c.slice(0, 40) });
  shared.push(...pairs(t.sh));
  if (t.ref) shared.push({ label: 'Ref', value: t.ref.slice(0, 30) });
  return { shared, perTicket: t.x.map((x) => pairs(x.s)) };
}
