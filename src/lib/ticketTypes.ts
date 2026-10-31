import type { IconName } from '../components/Icon';
import { KINDS, type Kind } from './types';

/** How a ticket type looks: header colour (white, bold header text sits on it) and badge icon. */
export type TicketType = { color: string; icon: IconName; label: string };

// Twelve types, twelve colours: the logo's pink, blue, green and violet plus eight to match.
// All ticket colours live here so a palette setting can swap them later.
const FLIGHT = '#1E7BFF';

const STYLES: Partial<Record<Kind, Omit<TicketType, 'label'>>> = {
  flight: { color: FLIGHT, icon: 'typePlane' },
  train: { color: '#00D16C', icon: 'typeTrain' },
  event: { color: '#FF2D95', icon: 'typeTicket' },
  gig: { color: '#D83BFF', icon: 'typeMusic' },
  activity: { color: '#FF6B1F', icon: 'typeMountain' },
  visa: { color: '#00B4E0', icon: 'typePassport' },
  stay: { color: '#9747FF', icon: 'typeBed' },
  ferry: { color: '#00BFA6', icon: 'typeShip' },
  bus: { color: '#FF3B3B', icon: 'typeBus' },
  car: { color: '#5856FF', icon: 'typeCar' },
  medical: { color: '#FFAA00', icon: 'typeMedical' },
  other: { color: '#64748B', icon: 'typeTag' },
};

/** Every type is listed above; anything unexpected gets Flight blue and a plain ticket icon. */
export function ticketType(kind: Kind): TicketType {
  const label = (KINDS.find((k) => k.id === kind)?.label ?? 'Ticket').toUpperCase();
  return { label, ...(STYLES[kind] ?? { color: FLIGHT, icon: 'typeTicket' }) };
}

/** Transport, where the ticket's time is when it leaves. */
export const isJourney = (kind: Kind) => ['flight', 'train', 'ferry', 'bus', 'car'].includes(kind);
