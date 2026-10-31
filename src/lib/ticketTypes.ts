import type { IconName } from '../components/Icon';
import { KINDS, type Kind } from './types';

/** How a ticket type looks: header colour (white, bold header text sits on it) and badge icon. */
export type TicketType = { color: string; icon: IconName; label: string };

// The final ticket colours, matched to the logo (pink, blue, green, violet) plus orange and aqua.
// All ticket colours live here so a palette setting can swap them later.
const FLIGHT = '#1E7BFF';

const STYLES: Partial<Record<Kind, Omit<TicketType, 'label'>>> = {
  flight: { color: FLIGHT, icon: 'typePlane' },
  train: { color: '#00D16C', icon: 'typeTrain' },
  event: { color: '#FF2D95', icon: 'typeTicket' },
  gig: { color: '#FF2D95', icon: 'typeMusic' },
  activity: { color: '#FF6B1F', icon: 'typeMountain' },
  visa: { color: '#00B4E0', icon: 'typePassport' },
  stay: { color: '#9747FF', icon: 'typeBed' },
  // No colour of their own in the design: Flight blue, each with its own icon.
  ferry: { color: FLIGHT, icon: 'typeShip' },
  bus: { color: FLIGHT, icon: 'typeBus' },
  car: { color: FLIGHT, icon: 'typeCar' },
  medical: { color: FLIGHT, icon: 'typeMedical' },
  other: { color: FLIGHT, icon: 'typeTag' },
};

/** Every type is listed above; anything unexpected gets Flight blue and a plain ticket icon. */
export function ticketType(kind: Kind): TicketType {
  const label = (KINDS.find((k) => k.id === kind)?.label ?? 'Ticket').toUpperCase();
  return { label, ...(STYLES[kind] ?? { color: FLIGHT, icon: 'typeTicket' }) };
}

/** Transport, where the ticket's time is when it leaves. */
export const isJourney = (kind: Kind) => ['flight', 'train', 'ferry', 'bus', 'car'].includes(kind);
