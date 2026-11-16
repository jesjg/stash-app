// A flight's details, wherever they're kept: shared ones (boarding, gate, terminal, ref, company)
// on the stub, per-person ones (flight number, seat, passenger) on each ticket.
import type { Detail, Stub } from './types';

export type FlightInfo = {
  company?: string;
  flight?: string;
  from?: string;
  to?: string;
  boarding?: string;
  departs?: string;
  gate?: string;
  terminal?: string;
  ref?: string;
  seats: string[];
  passengers: string[];
};

const find = (list: Detail[] | undefined, label: string) => list?.find((d) => d.label === label)?.value;

/** "SYD → AKL" (or "LGW -> PMI") as two airport codes. */
export function airports(title: string): [string, string] | null {
  const parts = title.split(/\s*(?:→|->)\s*/);
  return parts.length === 2 && parts.every((p) => /^[A-Za-z]{3,4}$/.test(p.trim())) ? [parts[0].trim().toUpperCase(), parts[1].trim().toUpperCase()] : null;
}

export function flightInfo(stub: Stub): FlightInfo {
  const shared = stub.details;
  const route = airports(stub.title);
  return {
    company: find(shared, 'Company'),
    flight: find(shared, 'Flight') ?? stub.tickets.map((t) => find(t.details, 'Flight')).find(Boolean),
    from: route?.[0],
    to: route?.[1],
    boarding: find(shared, 'Boarding') ?? stub.tickets.map((t) => find(t.details, 'Boarding')).find(Boolean),
    departs: stub.time,
    gate: find(shared, 'Gate') ?? stub.tickets.map((t) => find(t.details, 'Gate')).find(Boolean),
    terminal: find(shared, 'Terminal'),
    ref: find(shared, 'Ref'),
    seats: stub.tickets.map((t) => find(t.details, 'Seat') ?? (stub.tickets.length === 1 ? (find(shared, 'Seat') ?? '') : '')),
    passengers: stub.tickets.map((t) => find(t.details, 'Passenger') ?? (stub.tickets.length === 1 ? (find(shared, 'Passenger') ?? '') : '')),
  };
}

/**
 * Replaces the labels in `values` (dropping empty ones) and keeps every other detail as it was.
 * Order: the given labels first, then the rest.
 */
export function withDetails(list: Detail[] | undefined, values: Record<string, string | undefined>): Detail[] | undefined {
  const labels = Object.keys(values);
  const set = labels
    .map((label) => ({ label, value: (values[label] ?? '').trim() }))
    .filter((d) => d.value)
    .map((d) => ({ ...d, value: d.value.slice(0, 60) }));
  const rest = (list ?? []).filter((d) => !labels.includes(d.label));
  const out = [...set, ...rest];
  return out.length ? out : undefined;
}

/** "Gate 51 · Seat 23A · Terminal I" */
export function flightLine(info: FlightInfo): string {
  const seats = info.seats.filter(Boolean);
  return [
    info.gate ? `Gate ${info.gate}` : '',
    seats.length ? `Seat${seats.length > 1 ? 's' : ''} ${seats.join(', ')}` : '',
    info.terminal ? `Terminal ${info.terminal}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
