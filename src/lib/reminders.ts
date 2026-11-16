import { Directory, File, Paths } from 'expo-file-system';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { toDate } from './dates';
import { flightInfo, flightLine } from './flight';
import type { Stub } from './types';

/** Without a time: 8am on the day. With a time: 2 hours before. */
export function reminderDate(stub: Pick<Stub, 'date' | 'time'>): Date {
  if (stub.time) {
    const at = toDate(stub.date, stub.time);
    at.setHours(at.getHours() - 2);
    return at;
  }
  return toDate(stub.date, '08:00');
}

export function configureNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export type ReminderStatus = 'on' | 'off' | 'ask';

/** 'ask' = iOS hasn't shown the permission prompt yet. */
export async function reminderStatus(): Promise<ReminderStatus> {
  if (Platform.OS === 'web') return 'off';
  try {
    const p = await Notifications.getPermissionsAsync();
    if (p.granted || p.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return 'on';
    return p.canAskAgain ? 'ask' : 'off';
  } catch {
    return 'off';
  }
}

/** Shows the iOS prompt if it hasn't been shown yet. Never caches a "no", so a later yes in Settings is picked up. */
export async function ensurePermission(): Promise<boolean> {
  const status = await reminderStatus();
  if (status === 'on') return true;
  if (status === 'off') return false;
  try {
    const asked = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
    return asked.granted;
  } catch (e) {
    console.warn('Notification permission request failed', e);
    return false;
  }
}

/** iOS moves attachment files into its own store, so hand it a copy of the code image. */
async function attachmentCopy(stub: Stub): Promise<string | undefined> {
  const crop = stub.tickets.find((t) => t.code?.cropUri)?.code?.cropUri;
  if (!crop) return undefined;
  try {
    const dir = new Directory(Paths.cache, 'notify');
    dir.create({ intermediates: true, idempotent: true });
    const dest = new File(dir, `code-${stub.id}-${Date.now()}.png`);
    await new File(crop).copy(dest);
    return dest.uri;
  } catch {
    return undefined;
  }
}

export async function scheduleReminder(stub: Stub): Promise<string | undefined> {
  if (Platform.OS === 'web' || stub.reminder === false) return undefined;
  const at = reminderDate(stub);
  if (at.getTime() <= Date.now() + 30_000) return undefined;
  // Permission is asked for by Stash's own pop-up first (see NotifyPrompt), never mid-save.
  if ((await reminderStatus()) !== 'on') return undefined;

  const count = stub.tickets.length;
  const code = await attachmentCopy(stub);
  const flight = stub.kind === 'flight' ? flightInfo(stub) : null;
  // Flights: "NZ 104 · SYD → AKL · boards 13:55" / "Gate 51 · Seat 23A · Terminal I".
  const flightTitle = flight
    ? [flight.flight, flight.from && flight.to ? `${flight.from} → ${flight.to}` : stub.title, flight.boarding ? `boards ${flight.boarding}` : stub.time ? `departs ${stub.time}` : '']
        .filter(Boolean)
        .join(' · ')
    : '';
  const flightBody = flight ? flightLine(flight) : '';
  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: flight
          ? flightTitle
          : stub.kind === 'stay'
            ? `Check-in today: ${stub.title}${stub.time ? ` from ${stub.time}` : ''}`
            : stub.time
              ? `${stub.title} at ${stub.time}`
              : `Today: ${stub.title}`,
        body: flight
          ? [flightBody, 'Tap to show your boarding pass.'].filter(Boolean).join('. ')
          : stub.kind === 'stay'
            ? [stub.stay?.address?.split(',').slice(0, 2).join(','), 'Tap for directions, door code and Wi-Fi.'].filter(Boolean).join('. ')
            : stub.details?.find((d) => d.label === 'Info')?.value ??
              (count > 1 ? `Tap to open your ${count} tickets.` : 'Tap to open your ticket.'),
        data: { stubId: stub.id },
        // Breaks through Focus modes and stays prominent on the lock screen.
        interruptionLevel: 'timeSensitive',
        // Long-press the notification to see the code itself.
        attachments: code ? [{ identifier: 'code', url: code, type: null, typeHint: 'public.png' }] : undefined,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
    });
  } catch (e) {
    console.warn('Could not schedule reminder', e);
    return undefined;
  }
}

export async function cancelReminder(id?: string) {
  if (!id || Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // Already fired or never existed.
  }
}
