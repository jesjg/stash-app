import { File } from 'expo-file-system';
import { Image, Platform } from 'react-native';
import { dayKey, toDate } from './dates';
import { getState, setLockCard } from './store';
import { flightInfo } from './flight';
import { KINDS, type Detail, type Stub } from './types';

type Activity = typeof import('../live/TicketActivity').default;

/** Loaded lazily so the app still runs where Live Activities aren't available. */
function activity(): Activity | null {
  if (Platform.OS !== 'ios') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded lazily so non-iOS builds don't touch it
    return require('../live/TicketActivity').default as Activity;
  } catch {
    return null;
  }
}

function widgetsDir(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded lazily, see above
    return (require('expo-widgets') as typeof import('expo-widgets')).widgetsDirectory || null;
  } catch {
    return null;
  }
}

/** How long after the start time the card stays up. */
const LINGER_MS = 3 * 60 * 60 * 1000;

/** Today's stub that should be on the lock screen right now, if any. */
function pick(stubs: Stub[]): Stub | null {
  const today = dayKey();
  const now = Date.now();
  const candidates = stubs.filter((s) => {
    if (s.date !== today || s.usedAt || s.reminder === false) return false;
    if (!s.time) return true;
    return toDate(s.date, s.time).getTime() + LINGER_MS > now;
  });
  // Earliest timed one first; all-day tickets after.
  candidates.sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99'));
  return candidates[0] ?? null;
}

const LOCK_LABELS = ['Seat', 'Group', 'Row', 'Section', 'Block', 'Gate', 'Gate closes', 'Entrance', 'Door', 'Platform', 'Coach', 'Deck', 'Cabin'];

export function summary(details: Detail[] | undefined, max = 2): string {
  if (!details?.length) return '';
  const ordered = [...details].sort((a, b) => {
    const ia = LOCK_LABELS.indexOf(a.label);
    const ib = LOCK_LABELS.indexOf(b.label);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return ordered
    .filter((d) => LOCK_LABELS.includes(d.label))
    .slice(0, max)
    .map((d) => `${d.label} ${d.value}`)
    .join(' · ');
}

/** Copy the first ticket's code image somewhere the Live Activity can read it. */
async function codeImage(stub: Stub): Promise<string> {
  const dir = widgetsDir();
  const crop = stub.tickets.find((t) => t.code?.cropUri)?.code?.cropUri;
  if (!dir || !crop) return '';
  try {
    const dest = new File(dir.endsWith('/') ? dir : `${dir}/`, `code-${stub.id}.png`);
    if (!dest.exists) await new File(crop).copy(dest);
    return dest.uri;
  } catch {
    return '';
  }
}

/** The Stash app icon, copied where the Live Activity can read it ('' if it can't be). */
async function logoImage(): Promise<string> {
  const dir = widgetsDir();
  if (!dir) return '';
  try {
    const src = Image.resolveAssetSource(require('../../assets/live-logo.png'))?.uri;
    if (!src) return '';
    const dest = new File(dir.endsWith('/') ? dir : `${dir}/`, 'stash-logo.png');
    if (dest.exists) return dest.uri;
    if (/^https?:/.test(src)) await File.downloadFileAsync(src, dest);
    else await new File(src).copy(dest);
    return dest.uri;
  } catch {
    return '';
  }
}

async function propsFor(stub: Stub) {
  const kind = KINDS.find((k) => k.id === stub.kind)?.label ?? 'Ticket';
  const n = stub.tickets.length;
  const first = stub.tickets[0];
  // Flights get their own card: airline, flight number, route, boarding, gate, seat and terminal.
  const f = stub.kind === 'flight' ? flightInfo(stub) : null;
  const seats = f?.seats.filter(Boolean) ?? [];
  return {
    logo: await logoImage(),
    kind: stub.kind,
    company: f?.company ?? '',
    flightNo: f?.flight ?? '',
    from: f?.from ?? '',
    to: f?.to ?? '',
    boarding: f?.boarding ?? '',
    gate: f?.gate ?? '',
    seat: seats.length > 2 ? `${seats[0]} +${seats.length - 1}` : seats.join(', '),
    terminal: f?.terminal ?? '',
    // When boarding starts, for "Boards in 40 min" (0 if unknown).
    boardsAt: f?.boarding ? toDate(stub.date, f.boarding).getTime() : 0,
    title: stub.title.toUpperCase(),
    label: stub.kind === 'stay' ? 'CHECK-IN' : `${kind}${n > 1 ? ` · ${n} TICKETS` : ''}`.toUpperCase(),
    when: stub.time ?? 'Today',
    // Stays show where to go; the door code stays off the lock screen.
    detail: stub.kind === 'stay' ? (stub.stay?.address?.split(',').slice(0, 2).join(',') ?? '') : summary([...(first?.details ?? []), ...(stub.details ?? [])]),
    code: stub.kind === 'stay' ? '' : await codeImage(stub),
  };
}

let syncing = false;

/**
 * Keeps the lock screen card in step with today's tickets. iOS only lets an app start a
 * Live Activity while it's open, so this runs on launch, on returning to the app, and
 * whenever tickets change (opening the morning reminder counts as opening the app).
 */
export async function syncLockScreen() {
  const Factory = activity();
  if (!Factory || syncing) return;
  syncing = true;
  try {
    const { stubs, settings } = getState();
    const target = settings.lockScreen ? pick(stubs) : null;
    const running = Factory.getInstances();
    const remembered = getState().lockCard;
    let current = null as (typeof running)[number] | null;

    for (const inst of running) {
      const isOurs = remembered && inst.getId() === remembered.activityId && remembered.stubId === target?.id;
      if (isOurs && !current) {
        current = inst;
      } else {
        await inst.end('immediate');
      }
    }

    if (!target) {
      if (remembered) setLockCard(null);
      return;
    }

    const ends = target.time
      ? new Date(toDate(target.date, target.time).getTime() + LINGER_MS)
      : toDate(target.date, '23:59');

    if (current) {
      await current.update(await propsFor(target), ends);
    } else {
      const started = Factory.start(await propsFor(target), `stubs://ticket/${target.id}`, ends);
      setLockCard({ activityId: started.getId(), stubId: target.id });
    }
  } catch (e) {
    console.warn('Lock screen card not updated', e);
  } finally {
    syncing = false;
  }
}
