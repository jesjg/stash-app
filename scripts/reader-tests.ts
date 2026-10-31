// Real tickets Stash misread, kept so they stay fixed. Run: npm run test:reader
import { extractDetails, guessKind } from '../src/lib/extract';

const today = new Date(2026, 9, 9);
type Want = { title?: string; kind?: string; date?: string; time?: string | null; company?: string };
const cases: [string, string, Want][] = [
  [
    'SplitSave rail ticket (screenshot)',
    ['17:55', '4G\t43', 'Options\t• SplitSave\tClose', 'Add to Apple Wallet', 'TTB7MYGBHP4', '09 Oct 2026\tSSD - BIS', 'Stansted Airport\tBishops Stortford', 'SSD\t→\tBIS', 'TICKET TYPE\tROUTE', 'Off-Peak Day Single', 'ADULT\tVALID UNTIL', '26-30 Railcard\t09 Oct 2026', 'DATE/TIME PURCHASED', 'Mon 05 Oct at 11:27'].join('\n'),
    { title: 'Stansted Airport → Bishops Stortford', kind: 'train', date: '2026-10-09', time: null, company: 'SplitSave' },
  ],
  [
    'GetYourGuide activity (screenshot, logo not read)',
    ['5:58', 'Your ticket', 'Available offline', 'Tue, Dec 1, 2026\t12:30 pm', 'Ubud: Quad ATV Waterfalls & Barong Caves', 'Tandem Quad Waterfalls & Barong Caves (1', 'voucher for 2 people)', 'group', 'GYGFWVZF739H', 'Show ticket details', 'Add to Apple Wallet'].join('\n'),
    { title: 'Ubud: Quad ATV Waterfalls & Barong Caves', kind: 'activity', date: '2026-12-01', time: '12:30', company: 'GetYourGuide' },
  ],
  [
    'GetYourGuide screenshot opened from Gmail (status bar reads "4 Gmail")',
    ['4:13', '4 ◀ Gmail', 'Your ticket', 'Available offline', 'Tue, Dec 1, 2026\t12:30 pm', 'Ubud: Quad ATV Waterfalls & Barong Caves', 'Tandem Quad Waterfalls & Barong Caves (1', 'voucher for 2 people)', 'Group', '1 Group up to 2', 'GYGFWVZF739H'].join('\n'),
    { title: 'Ubud: Quad ATV Waterfalls & Barong Caves', company: 'GetYourGuide' },
  ],
  [
    'Ferry with a written route',
    ['Ionian Lines', 'Nidri → Kefalonia', 'Departure 14 Nov 2026 09:00', 'Deck passenger'].join('\n'),
    { title: 'Nidri → Kefalonia', kind: 'ferry', date: '2026-11-14', time: '09:00' },
  ],
];

let bad = 0;
for (const [name, text, want] of cases) {
  const got = extractDetails([{ text, codes: 1 }], 1, today);
  const company = got.shared.find((d) => d.label === 'Company')?.value;
  const check: [string, unknown, unknown][] = [
    ['title', got.title, want.title],
    ['kind', got.kind, want.kind],
    ['date', got.date, want.date],
    ['time', got.time ?? null, want.time],
    ['company', company, want.company],
  ];
  for (const [field, g, w] of check) {
    if (w === undefined) continue;
    if (g !== w) {
      bad++;
      console.log(`✗ ${name}: ${field} was ${JSON.stringify(g)}, wanted ${JSON.stringify(w)}`);
    }
  }
}
// Ekajaya Fast Ferry (screenshot of a two-passenger PDF, "ADULT TICKET" watermark all over it).
// The phone read the watermark between "Date :" and the date, so check both layouts.
const ekajaya = (name: string, split: boolean) =>
  [
    'TICKET', 'No. Booking', 'ADULT', 'EKJ26107640', 'TICKET', 'EKAJAYA FAST FERRY', 'TOnCT', 'Agent', 'Ticket No. EKJ26107640-1-1',
    'BEJ - ekajayafastferry.com (Repeate...', 'DEPARTURE TICKET', `Name : ${name}`, '(One way)', '(Adult)',
    split ? 'Date :\nADULT\n26 Nov 2026' : 'Date : 26 Nov 2026', 'Pickup : -', 'Trip : Trip 2 11.05 (Per 1 Nov) - 11:05', 'Area :',
    'Check-in Time: 10.05 - 10.35 ( Check in Location )', 'Location :', 'Route : Bangsal - Padang Bai', 'ADULT', 'TICKET',
    'Please note that the trip below include stops at Padangbai, Penida, or Lembongan and may take up to 4 hours.',
  ].join('\n');
for (const split of [false, true]) {
  const got = extractDetails(
    [{ text: ekajaya('Jes Jones Gardner, Mr.', split), codes: 1 }, { text: ekajaya('Gabija Dubickaite, Ms.', split), codes: 1 }],
    2,
    today,
  );
  const want = { title: 'Bangsal → Padang Bai', kind: 'ferry', date: '2026-11-26', time: '11:05' };
  const value = (label: string, list = got.shared) => list.find((d) => d.label === label)?.value;
  const check: [string, unknown, unknown][] = [
    ...Object.entries(want).map(([k, w]) => [k, got[k as keyof typeof want], w] as [string, unknown, unknown]),
    ['company', value('Company'), 'Ekajaya Fast Ferry'],
    ['ref', value('Ref'), 'EKJ26107640'],
    ['passenger 1', value('Passenger', got.perTicket[0]), 'Jes Jones Gardner'],
    ['passenger 2', value('Passenger', got.perTicket[1]), 'Gabija Dubickaite'],
    ['no stray details', [...got.shared, ...got.perTicket.flat()].map((d) => d.label).filter((l) => !['Company', 'Ref', 'Passenger'].includes(l)).join(','), ''],
  ];
  for (const [field, g, w] of check) {
    if (g !== w) {
      bad++;
      console.log(`✗ Ekajaya ferry${split ? ' (date split by watermark)' : ''}: ${field} was ${JSON.stringify(g)}, wanted ${JSON.stringify(w)}`);
    }
  }
}

// Bali tourist levy voucher (screenshot from the browser, opened from Gmail): two-column layout,
// a purchase "Date stamp" with a time that isn't the visit's.
{
  const levy = [
    '5:56', '◀ Gmail\t61', 'i.baliprov.go.id', 'Bali Provincial Government', 'lovebali.baliprov.go.id',
    "Protect Bali's Paradise: Your Contribution Matters", 'Levy Voucher No.\tPassport Number', 'LVB26IUKFEA\t26****334',
    'Name (Same as Passport)\tEmail', 'GABIJA DUBICKAITE\tje****99@gm****om', 'IDR IDR 150,000', '*Non-Refundable',
    'Service fees IDR IDR 4,500', 'For Only Debit / Credit Card', 'Arrival date plan 09 November 2026',
    'Date stamp 19 Sep 2026 06:53 (GMT+8)', 'Please bring this levy voucher with you during your stay in Bali.',
  ].join('\n');
  const got = extractDetails([{ text: levy, codes: 1 }], 1, today);
  const value = (label: string, list = got.shared) => list.find((d) => d.label === label)?.value;
  const check: [string, unknown, unknown][] = [
    ['title', got.title, 'Bali Tourist Levy'],
    ['kind', got.kind, 'visa'],
    ['date', got.date, '2026-11-09'],
    ['time', got.time ?? null, null],
    ['ref', value('Ref'), 'LVB26IUKFEA'],
    ['passenger', value('Passenger', got.perTicket[0]), 'Gabija Dubickaite'],
  ];
  for (const [field, g, w] of check) {
    if (g !== w) {
      bad++;
      console.log(`✗ Bali levy voucher: ${field} was ${JSON.stringify(g)}, wanted ${JSON.stringify(w)}`);
    }
  }
}

// Words in sentences that aren't details: "entry remains…", "class includes…".
const noDetails: [string, string, string][] = [
  ['Indonesia e-VOA disclaimer', 'Issuance of e-VOA does not guarantee entry to the Republic of Indonesia, the decision of entry remains the right of the Immigration Officer', 'Entrance'],
  ['GetYourGuide class description', 'Ubud: 2-Hour Make Your Own Silver class Includes all materials and a drink', 'Deck'],
];
for (const [name, text, label] of noDetails) {
  const got = extractDetails([{ text, codes: 1 }], 1, today);
  const found = [...got.shared, ...got.perTicket.flat()].find((d) => d.label === label);
  if (found) {
    bad++;
    console.log(`✗ ${name}: read ${label} "${found.value}" from a sentence`);
  }
}
const kept: [string, string, string, string][] = [
  ['Labelled entrance', 'Entrance: North', 'Entrance', 'North'],
  ['Stadium entry code', 'Please use Entry D4 for this match', 'Entrance', 'D4'],
];
for (const [name, text, label, value] of kept) {
  const got = extractDetails([{ text, codes: 1 }], 1, today);
  const found = [...got.shared, ...got.perTicket.flat()].find((d) => d.label === label);
  if (found?.value !== value) {
    bad++;
    console.log(`✗ ${name}: ${label} was ${JSON.stringify(found?.value)}, wanted ${value}`);
  }
}
const kinds: [string, string][] = [
  ['train', 'GWR\nOff-Peak Return\nCardiff Central to London Paddington\nRoute: Any Permitted\nCoach C Seat 42\nAdult ticket'],
  ['flight', 'Ryanair\nBoarding pass\nGate closes 06:20\nSeat 14C'],
  ['event', 'THE BOOK OF MORMON\nPrince of Wales Theatre\nRoyal Circle Row F Seat 12\nTicketmaster'],
  ['gig', 'Ticketmaster\nArctic Monkeys\nDoors open 18:30\nStanding\nO2 Arena'],
  ['ferry', 'Εισιτήριο πλοίο\nΗγουμενίτσα'],
];
for (const [want, text] of kinds) {
  const got = guessKind(text);
  if (got !== want) {
    bad++;
    console.log(`✗ kind: ${JSON.stringify(text.split('\n')[0])} was ${got}, wanted ${want}`);
  }
}
console.log(bad ? `${bad} wrong` : `All ${cases.length + 3 + noDetails.length + kept.length + kinds.length} tickets read right`);
process.exit(bad ? 1 : 0);
