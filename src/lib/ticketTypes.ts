import type { IconName } from '../components/Icon';
import { KINDS, type Kind } from './types';

/** How a ticket type looks: header colour (white text on it passes 4.5:1) and badge icon. */
export type TicketType = { color: string; icon: IconName; label: string };

const FLIGHT = '#2563FF';

const STYLES: Partial<Record<Kind, Omit<TicketType, 'label'>>> = {
  flight: { color: FLIGHT, icon: 'typePlane' },
  train: { color: '#00825A', icon: 'typeTrain' },
  event: { color: '#E0007A', icon: 'typeTicket' },
  gig: { color: '#E0007A', icon: 'typeTicket' },
  activity: { color: '#D14000', icon: 'typeMountain' },
  visa: { color: '#007A9E', icon: 'typePassport' },
  stay: { color: '#8B3DFF', icon: 'typeBed' },
};

/** Types without their own colour use Flight blue and a plain ticket icon. */
export function ticketType(kind: Kind): TicketType {
  const label = (KINDS.find((k) => k.id === kind)?.label ?? 'Ticket').toUpperCase();
  return { label, ...(STYLES[kind] ?? { color: FLIGHT, icon: 'typeTicket' }) };
}

/** Transport, where the ticket's time is when it leaves. */
export const isJourney = (kind: Kind) => ['flight', 'train', 'ferry', 'bus', 'car'].includes(kind);
