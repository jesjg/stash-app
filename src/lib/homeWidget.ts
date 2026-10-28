import { Platform } from 'react-native';
import { addDays, daysBetween, dayKey, fmt, toDate } from './dates';
import { ticketAccent, ticketDeep } from './palette';
import { getState, isArchived, isPast } from './store';
import { KINDS, type Stub } from './types';
import { colors } from '../theme';
import type { NextTicketProps } from '../live/NextTicketWidget';

type WidgetT = typeof import('../live/NextTicketWidget').default;

/** Loaded lazily: only builds with the widget extension have it. */
function widget(): WidgetT | null {
  if (Platform.OS !== 'ios') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded lazily, see above
    return require('../live/NextTicketWidget').default as WidgetT;
  } catch {
    return null;
  }
}

function propsFor(stub: Stub | undefined, day: string): NextTicketProps {
  if (!stub) return { title: '', label: '', days: 0, when: '', url: 'stubs://', accent: colors.accent, deep: '#111111' };
  const kind = KINDS.find((k) => k.id === stub.kind)?.label ?? 'Ticket';
  return {
    title: stub.title.toUpperCase(),
    label: stub.kind === 'stay' ? 'CHECK-IN' : kind.toUpperCase(),
    days: Math.max(0, daysBetween(day, stub.date)),
    when: [fmt.short(stub.date), stub.time].filter(Boolean).join(' · '),
    url: `stubs://ticket/${stub.id}`,
    accent: ticketAccent(stub.color, colors.accent),
    deep: ticketDeep(stub.color, '#111111'),
  };
}

/**
 * Keeps the home-screen widget showing the next ticket and its countdown. Schedules one entry per
 * day for two weeks so the number ticks down (and moves on to the next ticket) without opening Stash.
 */
export function syncHomeWidget() {
  const W = widget();
  if (!W) return;
  try {
    const live = getState()
      .stubs.filter((s) => !s.sample && !isArchived(s) && !isPast(s))
      .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '99').localeCompare(b.time ?? '99'));
    const today = dayKey();
    const entries = Array.from({ length: 14 }, (_, i) => {
      const day = addDays(today, i);
      const next = live.find((s) => s.date >= day);
      return { date: i === 0 ? new Date() : toDate(day, '00:00'), props: propsFor(next, day) };
    });
    W.updateTimeline(entries);
  } catch (e) {
    console.warn('Widget not updated', e);
  }
}
