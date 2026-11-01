export type Kind = 'ferry' | 'train' | 'flight' | 'bus' | 'car' | 'stay' | 'gig' | 'event' | 'activity' | 'visa' | 'medical' | 'other';

export const KINDS: { id: Kind; label: string }[] = [
  { id: 'ferry', label: 'Ferry' },
  { id: 'train', label: 'Train' },
  { id: 'flight', label: 'Flight' },
  { id: 'bus', label: 'Bus' },
  { id: 'car', label: 'Car' },
  { id: 'stay', label: 'Stay' },
  { id: 'gig', label: 'Gig' },
  { id: 'event', label: 'Event' },
  { id: 'activity', label: 'Activity' },
  { id: 'visa', label: 'Visa' },
  { id: 'medical', label: 'Medical' },
  { id: 'other', label: 'Other' },
];

export type Code = {
  /** qr | aztec | pdf417 | datamatrix | linear */
  symbology: string;
  payload?: string;
  /** Crop of the code from the original ticket. */
  cropUri: string;
};

/** A labelled fact read off the ticket, e.g. { label: 'Seat', value: '14' }. */
export type Detail = { label: string; value: string };

/** One scannable ticket (one person, one entry). */
export type Ticket = {
  id: string;
  /** Rendered page the code came from (or the screenshot itself). */
  pageUri: string;
  code?: Code;
  /** Per-ticket facts: seat, row, coach, passenger. */
  details?: Detail[];
};

/** Check-in details for an Airbnb, hotel or campsite (kind 'stay'). Date/time on the stub are check-in. */
export type Stay = {
  address?: string;
  /** YYYY-MM-DD */
  checkOutDate?: string;
  /** HH:mm */
  checkOutTime?: string;
  /** Door, key box or gate code. */
  doorCode?: string;
  wifiName?: string;
  wifiPassword?: string;
  host?: string;
  phone?: string;
  /** The check-in instructions, as read or pasted. */
  notes?: string;
};

/** Something you're going to: one date, one or more tickets. */
export type Stub = {
  id: string;
  title: string;
  kind: Kind;
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  /** Optional local time, HH:mm. */
  time?: string;
  tickets: Ticket[];
  /** Copy of the original PDF/image as it arrived. */
  sourceUri: string;
  sourceName: string;
  /** Every page image, for the "view original" screen. */
  pageUris: string[];
  /** Facts shared by every ticket: gate, entrance, venue, booking reference. */
  details?: Detail[];
  reminderId?: string;
  createdAt: number;
  /** Set when the person archives it (swipe or Used); it moves to Archive. Nothing else archives. */
  usedAt?: number;
  /** Check-in details when kind is 'stay'. */
  stay?: Stay;
  /** Holographic foil finish on this ticket's card. */
  holo?: boolean;
  /** Colour picked for this ticket (see palette.ts); otherwise the app colour. */
  color?: import('./palette').ColorId;
  /** Photo the person chose for the card on the home screen. */
  cover?: string;
  /** Set only on covers from the old automatic lookup; those are removed on launch. */
  coverCredit?: string;
  /** The Add to Stash link it came from (shared instead of a file when sending). */
  link?: string;
  /** A demo ticket from the empty screen: no files, removed when a real ticket is saved. */
  sample?: boolean;
  /** Which fields were read off the ticket (shown as a hint on the confirm screen). */
  autofill?: ('date' | 'time' | 'title' | 'kind')[];
};

export type Settings = {
  /** Check new screenshots for ticket codes. undefined = not asked yet. */
  screenshots?: 'on' | 'off';
  /** Pin today's ticket to the lock screen as a Live Activity. */
  lockScreen: boolean;
  /** Sparkles on every ticket's coloured header. Off unless the person turns it on. */
  sparkles?: boolean;
  /** Use Apple Intelligence (on the phone) to help read tickets. undefined = on. */
  smartReading?: boolean;
  /** The how-it-works slides have been shown. */
  introSeen?: boolean;
};

export const DEFAULT_SETTINGS: Settings = { lockScreen: true };
