import { useSyncExternalStore } from 'react';
import { addDays, dayKey, daysBetween, toDate } from './dates';
import { File } from 'expo-file-system';
import { dbFile, deleteStubFiles, newId, rebase, rootDir, stubDir } from './files';
import type { Extracted } from './extract';
import type { StayFound } from './stay';
import { cancelReminder, ensurePermission, reminderStatus, scheduleReminder } from './reminders';
import { DEFAULT_SETTINGS, type Settings, type Stub } from './types';

type State = {
  loaded: boolean;
  stubs: Stub[];
  settings: Settings;
  /** A scanned import waiting on the confirm screen. */
  draft: Stub | null;
  /** Screenshot ids already checked, so each is only offered once. */
  seenShots: string[];
  /** The lock screen card currently showing, and which stub it belongs to. */
  lockCard: { activityId: string; stubId: string } | null;
  /** A light record of every ticket ever saved (no files), kept after auto-clear for Year in tickets. */
  history: HistoryItem[];
};

export type HistoryItem = { id: string; title: string; kind: Stub['kind']; date: string; nights?: number; place?: string };

const COUNTRY = /^(greece|uk|united kingdom|england|scotland|wales|ireland|france|spain|italy|portugal|germany|austria|switzerland|usa|united states|netherlands|croatia)$/i;

/** Where it was: a stay's town, or a journey's destination (not airport codes). */
export function placeOf(s: Pick<Stub, 'kind' | 'title' | 'stay'>): string | undefined {
  if (s.kind === 'stay') {
    return s.stay?.address
      ?.split(',')
      .map((p) => p.replace(/\b[A-Z]{0,2}\s?\d[\d\s-]*[A-Z]{0,2}\b/g, '').replace(/#\S+/g, '').trim())
      .filter((p) => p && !COUNTRY.test(p) && !/\d/.test(p) && p.split(' ').length <= 4)
      .pop();
  }
  const route = s.title.split(/\s*(?:→|->)\s*/);
  if (route.length === 2 && !/^[A-Z]{3}$/.test(route[1].trim())) return route[1].trim();
  return undefined;
}

function toHistory(s: Stub): HistoryItem {
  const nights = s.kind === 'stay' && s.stay?.checkOutDate ? Math.max(0, daysBetween(s.date, s.stay.checkOutDate)) : undefined;
  return { id: s.id, title: s.title, kind: s.kind, date: s.date, nights, place: placeOf(s) };
}

let state: State = { loaded: false, stubs: [], settings: DEFAULT_SETTINGS, draft: null, seenShots: [], lockCard: null, history: [] };
const listeners = new Set<() => void>();

function set(patch: Partial<State>) {
  if (patch.stubs) {
    // Keep the history in step with what's saved (removals are handled where people delete).
    const byId = new Map((patch.history ?? state.history).map((h) => [h.id, h]));
    for (const s of patch.stubs) if (!s.sample) byId.set(s.id, toHistory(s));
    patch = { ...patch, history: [...byId.values()] };
  }
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => select(state));
}

export const getState = () => state;

// ---------- persistence ----------

function persist() {
  try {
    dbFile().write(
      JSON.stringify({ v: 1, stubs: state.stubs, settings: state.settings, seenShots: state.seenShots, lockCard: state.lockCard, history: state.history }),
    );
  } catch (e) {
    console.warn('Could not save stubs', e);
  }
}

export async function load() {
  if (state.loaded) return;
  let stubs: Stub[] = [];
  let settings = DEFAULT_SETTINGS;
  let seenShots: string[] = [];
  let lockCard: State['lockCard'] = null;
  let history: HistoryItem[] = [];
  try {
    const file = dbFile();
    if (file.exists) {
      const data = JSON.parse(await file.text());
      stubs = Array.isArray(data.stubs) ? data.stubs : [];
      settings = { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) };
      settings.themePhoto = rebase(settings.themePhoto);
      seenShots = Array.isArray(data.seenShots) ? data.seenShots : [];
      lockCard = data.lockCard ?? null;
      history = Array.isArray(data.history) ? data.history : [];
    }
  } catch (e) {
    console.warn('Could not read stubs', e);
  }
  const fixed = stubs.map(dropTrip).map(rebaseStub).map(dropDuplicateBarcodes).map(dropAutoCover);
  const moved = JSON.stringify(fixed) !== JSON.stringify(stubs);
  set({ loaded: true, history, stubs: sortStubs(fixed), settings, seenShots, lockCard });
  if (moved) persist();
}

/** Trips were removed: forget which trip a ticket was put in. */
function dropTrip(s: Stub): Stub {
  const { tripId: _trip, noTrip: _no, ...rest } = s as Stub & { tripId?: string; noTrip?: boolean };
  return rest;
}

/** Automatic (Wikipedia) covers were removed: delete those, keep photos people chose. */
function dropAutoCover(s: Stub): Stub {
  if (!s.coverCredit) return s;
  try {
    if (s.cover) {
      const f = new File(s.cover);
      if (f.exists) f.delete();
    }
  } catch {}
  const { cover: _cover, coverCredit: _credit, ...rest } = s as Stub & { coverTried?: boolean };
  delete (rest as { coverTried?: boolean }).coverTried;
  return rest;
}

/** Older imports made a separate ticket for a barcode printed next to a QR code. Drop those. */
function dropDuplicateBarcodes(s: Stub): Stub {
  const squarePages = new Set(s.tickets.filter((t) => t.code && t.code.symbology !== 'linear').map((t) => t.pageUri));
  const tickets = s.tickets.filter((t) => !(t.code?.symbology === 'linear' && squarePages.has(t.pageUri)));
  return tickets.length === s.tickets.length || !tickets.length ? s : { ...s, tickets };
}

/** Point a stub's saved files at the app's current folder (see rebase). */
function rebaseStub(s: Stub): Stub {
  return {
    ...s,
    sourceUri: rebase(s.sourceUri),
    cover: rebase(s.cover),
    pageUris: (s.pageUris ?? []).map((u) => rebase(u)),
    tickets: s.tickets.map((t) => ({
      ...t,
      pageUri: rebase(t.pageUri),
      code: t.code ? { ...t.code, cropUri: rebase(t.code.cropUri) } : t.code,
    })),
  };
}

function sortStubs(stubs: Stub[]) {
  return [...stubs].sort((a, b) =>
    a.date === b.date ? (a.time ?? '99:99').localeCompare(b.time ?? '99:99') : a.date.localeCompare(b.date),
  );
}

// ---------- drafts ----------

export function setDraft(draft: Stub | null) {
  const old = state.draft;
  if (old && old.id !== draft?.id) deleteStubFiles(old.id);
  set({ draft });
}

/** Throw away the draft and its scanned files. */
export function discardDraft() {
  setDraft(null);
}

// ---------- stubs ----------

export type EditableFields = Pick<Stub, 'title' | 'kind' | 'date' | 'time' | 'stay' | 'color' | 'holo' | 'details'>;

export async function saveDraft(fields: EditableFields) {
  const draft = state.draft;
  if (!draft) return null;
  const stub: Stub = { ...draft, ...fields, title: fields.title.trim() || (fields.kind === 'stay' ? 'Stay' : 'Ticket'), createdAt: Date.now() };
  stub.reminderId = await scheduleReminder(stub);
  // The first real ticket replaces the demo one.
  const samples = state.stubs.filter((s) => s.sample);
  for (const s of samples) await cancelReminder(s.reminderId);
  set({ draft: null, stubs: sortStubs([...state.stubs.filter((s) => !s.sample), stub]) });
  persist();
  return stub;
}

export async function updateStub(id: string, fields: Partial<EditableFields>) {
  const current = state.stubs.find((s) => s.id === id);
  if (!current) return;
  await cancelReminder(current.reminderId);
  const next: Stub = { ...current, ...fields };
  next.reminderId = await scheduleReminder(next);
  set({ stubs: sortStubs(state.stubs.map((s) => (s.id === id ? next : s))) });
  persist();
}

const pendingDeletes = new Map<string, { stub: Stub; timer: ReturnType<typeof setTimeout> }>();

/** Removes straight away from the list; files go after a few seconds unless undone. */
export function removeStub(id: string): () => void {
  const stub = state.stubs.find((s) => s.id === id);
  if (!stub) return () => {};
  cancelReminder(stub.reminderId);
  // Deleted on purpose: it shouldn't count in Year in tickets either (undo puts it back).
  set({ stubs: state.stubs.filter((s) => s.id !== id), history: state.history.filter((h) => h.id !== id) });
  persist();

  const timer = setTimeout(() => {
    pendingDeletes.delete(id);
    deleteStubFiles(id);
  }, 8000);
  pendingDeletes.set(id, { stub, timer });

  return async () => {
    const pending = pendingDeletes.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingDeletes.delete(id);
    const restored = { ...pending.stub, reminderId: await scheduleReminder(pending.stub) };
    set({ stubs: sortStubs([...state.stubs, restored]) });
    persist();
  };
}

/** Delete everything in Archive. */
export function clearPast() {
  const old = state.stubs.filter((s) => isArchived(s));
  old.forEach((s) => {
    cancelReminder(s.reminderId);
    deleteStubFiles(s.id);
  });
  set({ stubs: state.stubs.filter((s) => !isArchived(s)) });
  persist();
}

/** Apply details read off a saved ticket. Fills gaps only; never overwrites what the person set. */
export async function applyReread(id: string, found: Extracted & { stayFound?: StayFound }): Promise<number> {
  const current = state.stubs.find((s) => s.id === id);
  if (!current) return 0;
  const tickets = current.tickets.map((t, i) =>
    found.perTicket[i]?.length ? { ...t, details: found.perTicket[i] } : t,
  );
  const next: Stub = {
    ...current,
    tickets,
    details: found.shared.length ? found.shared : current.details,
    kind: (current.kind === 'event' || current.kind === 'other') && found.kind ? found.kind : current.kind,
    time: current.time ?? found.time,
    title: found.title && /^(ticket|tickets|e-?tickets?|screenshot|image|photo)?$/i.test(current.title.trim()) ? found.title : current.title,
  };
  if (found.stayFound) {
    // Asked to re-read a stay: what the reader finds now replaces its earlier guesses.
    const st = found.stayFound.stay;
    next.stay = { ...current.stay, ...Object.fromEntries(Object.entries(st).filter(([, v]) => v)), notes: current.stay?.notes ?? st.notes };
    next.kind = 'stay';
    if (found.stayFound.time) next.time = found.stayFound.time;
    if (found.stayFound.date) next.date = found.stayFound.date;
    if (found.stayFound.title) next.title = found.stayFound.title;
  }
  if (next.time !== current.time || next.date !== current.date) {
    await cancelReminder(current.reminderId);
    next.reminderId = await scheduleReminder(next);
  }
  set({ stubs: state.stubs.map((s) => (s.id === id ? next : s)) });
  persist();
  const stayCount = found.stayFound ? Object.keys(found.stayFound.stay).filter((k) => k !== 'notes').length : 0;
  return found.shared.length + found.perTicket.reduce((n, d) => n + d.length, 0) + stayCount;
}

/** Archive it (swipe left, or Used) or bring it back. Returns an undo. */
export async function setUsed(id: string, used: boolean): Promise<() => void> {
  const current = state.stubs.find((s) => s.id === id);
  if (!current) return () => {};
  let next: Stub;
  if (used) {
    await cancelReminder(current.reminderId);
    next = { ...current, usedAt: Date.now(), reminderId: undefined };
  } else {
    next = { ...current, usedAt: undefined };
    next.reminderId = await scheduleReminder(next);
  }
  set({ stubs: state.stubs.map((s) => (s.id === id ? next : s)) });
  persist();
  return () => {
    setUsed(id, !used);
  };
}

export function setSettings(patch: Partial<Settings>) {
  set({ settings: { ...state.settings, ...patch } });
  persist();
}

/**
 * Schedules any reminder that's missing (e.g. tickets saved before permission was given).
 * Pass ask=true to show the iOS prompt first if it hasn't been shown yet.
 */
export async function ensureReminders(ask = false) {
  // Ask first (even with no tickets yet: the button in Settings and the intro must work on a fresh install).
  if (ask ? !(await ensurePermission()) : (await reminderStatus()) !== 'on') return;
  const upcoming = state.stubs.filter((s) => s.date >= dayKey() && !s.usedAt);
  if (!upcoming.length) return;
  let changed = false;
  const next = await Promise.all(
    state.stubs.map(async (s) => {
      if (s.reminderId || s.date < dayKey() || s.usedAt) return s;
      const reminderId = await scheduleReminder(s);
      if (!reminderId) return s;
      changed = true;
      return { ...s, reminderId };
    }),
  );
  if (changed) {
    set({ stubs: next });
    persist();
  }
}

export function setLockCard(lockCard: State['lockCard']) {
  set({ lockCard });
  persist();
}

/** Remember screenshots we've looked at (newest 300). */
export function markShotsSeen(ids: string[]) {
  if (!ids.length) return;
  const next = [...ids, ...state.seenShots.filter((id) => !ids.includes(id))].slice(0, 300);
  set({ seenShots: next });
  persist();
}

// ---------- selectors ----------

/** How long after its start time a ticket stays "live" before it counts as past. */
export const PAST_AFTER_MS = 3 * 60 * 60 * 1000;

/** The last day a stub is needed: check-out for stays, otherwise its date. */
export function lastDay(s: Stub): string {
  const out = s.kind === 'stay' ? s.stay?.checkOutDate : undefined;
  return out && out > s.date ? out : s.date;
}

/** Only the person archives a ticket (swipe left, or Used); past ones stay on the home screen. */
export function isArchived(s: Stub): boolean {
  return !!s.usedAt;
}

/** Its day is over, or it started more than a few hours ago. */
export function isPast(s: Stub, now = Date.now(), today = dayKey()): boolean {
  if (s.kind === 'stay') {
    // Stays stay put (Wi-Fi, door code) until check-out, not 3 hours after check-in.
    const end = lastDay(s);
    if (end < today) return true;
    if (end === today && s.stay?.checkOutTime) return toDate(end, s.stay.checkOutTime).getTime() + 60 * 60 * 1000 < now;
    return false;
  }
  if (s.date < today) return true;
  if (s.date === today && s.time) return toDate(s.date, s.time).getTime() + PAST_AFTER_MS < now;
  return false;
}

export function groupStubs(stubs: Stub[], today = dayKey(), now = Date.now()) {
  const kept = stubs.filter((s) => !isArchived(s));
  const live = kept.filter((s) => !isPast(s, now, today));
  return {
    // Includes stays that started earlier and run to a later check-out.
    today: live.filter((s) => s.date <= today),
    upcoming: live.filter((s) => s.date > today),
    /** Over but not archived yet: stays on the home screen. Most recent first. */
    past: kept
      .filter((s) => isPast(s, now, today))
      .sort((a, b) => b.date.localeCompare(a.date) || (b.time ?? '').localeCompare(a.time ?? '')),
    /** Archived by the person. Most recently archived first. */
    archive: stubs
      .filter(isArchived)
      .sort((a, b) => (b.usedAt ?? 0) - (a.usedAt ?? 0) || b.date.localeCompare(a.date)),
  };
}

/**
 * A demo ticket for today (two seats, so swiping shows too), so new people and App Review
 * can see the code, details and lock screen card without importing anything.
 */
export function addSampleTicket(): Stub {
  const existing = state.stubs.find((s) => s.sample);
  if (existing) return existing;
  // Starts a couple of hours from now so it stays in Today; late at night, tomorrow evening.
  const start = new Date(Date.now() + 2 * 3600_000);
  start.setMinutes(start.getMinutes() <= 30 ? 30 : 60, 0, 0);
  const sameDay = dayKey(start) === dayKey();
  const id = newId();
  const ticket = (n: number, seat: string) => ({
    id: `${id}-${n}`,
    pageUri: '',
    code: { symbology: 'qr', payload: `STASH-SAMPLE-${n}`, cropUri: '' },
    details: [
      { label: 'Row', value: 'J' },
      { label: 'Seat', value: seat },
    ],
  });
  const stub: Stub = {
    id,
    sample: true,
    title: 'Sample show',
    kind: 'event',
    date: sameDay ? dayKey() : addDays(dayKey(), 1),
    time: sameDay ? `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}` : '19:30',
    tickets: [ticket(1, '12'), ticket(2, '13')],
    details: [
      { label: 'Section', value: 'Stalls' },
      { label: 'Entrance', value: 'B' },
      { label: 'Ref', value: 'SAMPLE1' },
    ],
    sourceUri: '',
    sourceName: 'Sample',
    pageUris: [],
    createdAt: Date.now(),
  };
  set({ stubs: sortStubs([...state.stubs, stub]) });
  persist();
  return stub;
}

/** Set (copying the photo into the ticket's folder) or clear a ticket's cover photo. */
export async function setCover(id: string, photoUri: string | null) {
  const current = state.stubs.find((s) => s.id === id);
  if (!current) return;
  let cover: string | undefined;
  if (photoUri) {
    const ext = photoUri.match(/\.(jpe?g|png|heic|webp)$/i)?.[1]?.toLowerCase() ?? 'jpg';
    // New name each time so the image cache shows the new photo straight away.
    const dest = new File(stubDir(id), `cover-${Date.now()}.${ext}`);
    await new File(photoUri).copy(dest);
    cover = dest.uri;
  }
  if (current.cover) {
    try {
      const old = new File(current.cover);
      if (old.exists) old.delete();
    } catch {}
  }
  const latest = state.stubs.find((s) => s.id === id) ?? current;
  set({ stubs: state.stubs.map((s) => (s.id === id ? { ...latest, cover, coverCredit: undefined } : s)) });
  persist();
}

/** Set (copying it into Stash) or clear the background photo used for every ticket card. */
export async function setThemePhoto(photoUri: string | null) {
  const old = state.settings.themePhoto;
  let themePhoto: string | undefined;
  if (photoUri) {
    const ext = photoUri.match(/\.(jpe?g|png|heic|webp)$/i)?.[1]?.toLowerCase() ?? 'jpg';
    rootDir().create({ intermediates: true, idempotent: true });
    const dest = new File(rootDir(), `theme-${Date.now()}.${ext}`);
    await new File(photoUri).copy(dest);
    themePhoto = dest.uri;
  }
  if (old) {
    try {
      const f = new File(old);
      if (f.exists) f.delete();
    } catch {}
  }
  set({ settings: { ...state.settings, themePhoto } });
  persist();
}
