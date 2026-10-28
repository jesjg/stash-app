import { useMemo } from 'react';
import { isArchived, isPast, useStore } from './store';
import { buildTrips, type Trip } from './trips';
import type { Kind } from './types';

/** Trips among the tickets and stays still ahead. */
export function useTrips(): Trip[] {
  const stubs = useStore((s) => s.stubs);
  const names = useStore((s) => s.tripNames);
  return useMemo(() => buildTrips(stubs.filter((s) => !isArchived(s) && !isPast(s)), names), [stubs, names]);
}

export const tripOf = (trips: Trip[], stubId: string) => trips.find((t) => t.items.some((s) => s.id === stubId));

export const KIND_ICON: Partial<Record<Kind, 'plane' | 'ferry' | 'train' | 'bus' | 'car' | 'home' | 'ticket'>> = {
  flight: 'plane',
  ferry: 'ferry',
  train: 'train',
  bus: 'bus',
  car: 'car',
  stay: 'home',
};
export const iconFor = (k: Kind) => KIND_ICON[k] ?? 'ticket';
