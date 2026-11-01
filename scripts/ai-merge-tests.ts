// How answers from Apple Intelligence are combined with Stash's own reader. Run: npm run test:ai
import { mergeAI, printed } from '../src/lib/aiReader';
import type { Extracted } from '../src/lib/extract';

let bad = 0;
function check(name: string, ok: boolean) {
  if (!ok) {
    bad++;
    console.log(`✗ ${name}`);
  } else console.log(`✓ ${name}`);
}
const empty = (): Extracted => ({ shared: [], perTicket: [[]] });

const gig = ['7:41', 'O2 Academy Brixton', 'LOYLE CARNER', 'Hugo Tour 2026', 'Sat 14 Nov 2026', 'Doors 7:00pm', 'Standing', 'Order no. KX4-82Q1'].join('\n');

{
  const r = mergeAI(empty(), { kind: 'gig', title: 'Loyle Carner', company: 'O2 Academy Brixton', date: '2026-11-14', time: '19:00', details: [{ label: 'ref', value: 'KX4-82Q1' }] }, gig, 1);
  check('fills kind, title, date, time when Stash found nothing', r.kind === 'gig' && r.title === 'Loyle Carner' && r.date === '2026-11-14' && r.time === '19:00');
  check('adds company and ref printed on the ticket', r.shared.some((d) => d.label === 'Company' && d.value === 'O2 Academy Brixton') && r.shared.some((d) => d.label === 'Ref' && d.value === 'KX4-82Q1'));
}
{
  const r = mergeAI(empty(), { title: 'Taylor Swift', date: '2026-11-15', time: '20:30', company: 'Ticketmaster', details: [{ label: 'Seat', value: 'F12' }] }, gig, 1);
  check('ignores a title that is not on the ticket', r.title === undefined);
  check('ignores a date that is not on the ticket', r.date === undefined);
  check('ignores a time that is not on the ticket', r.time === undefined);
  check('ignores a company and seat that are not on the ticket', r.shared.length === 0 && r.perTicket[0].length === 0);
}
{
  const found: Extracted = { date: '2026-11-14', time: '19:00', kind: 'event', title: 'Hugo Tour 2026', shared: [{ label: 'Ref', value: 'KX4-82Q1' }], perTicket: [[]] };
  const r = mergeAI(found, { kind: 'gig', title: 'Loyle Carner', date: '2026-11-15', time: '20:00', details: [{ label: 'Ref', value: 'O2' }] }, gig, 1);
  check("keeps Stash's date, time and kind", r.date === '2026-11-14' && r.time === '19:00' && r.kind === 'event');
  check('uses a better title when it is printed', r.title === 'Loyle Carner');
  check("doesn't add a second Ref", r.shared.filter((d) => d.label === 'Ref').length === 1);
}
{
  const ferry = ['Ekajaya Fast Boat', 'From\tPadang Bai', 'To\tGili Trawangan', 'Departure\t12 Dec 2026 09:00'].join('\n');
  const found: Extracted = { kind: 'ferry', title: 'Padang Bai → Gili Trawangan', shared: [], perTicket: [[]] };
  const r = mergeAI(found, { title: 'Ekajaya Fast Boat', date: '2026-12-12', time: '09:00' }, ferry, 1);
  check('keeps a route read from From/To', r.title === 'Padang Bai → Gili Trawangan');
  check('date 12 Dec 2026 and 09:00 found', r.date === '2026-12-12' && r.time === '09:00');
}
{
  const r = mergeAI(empty(), { details: [{ label: 'Seat', value: '14A' }, { label: 'Passenger', value: 'Jes Jones' }] }, 'Seat 14A\tPassenger JES JONES', 2);
  check("leaves seats alone when there are several tickets", r.perTicket[0].length === 0);
  const one = mergeAI(empty(), { details: [{ label: 'Seat', value: '14A' }, { label: 'Wifi', value: 'abc' }] }, 'Seat 14A wifi abc', 1);
  check('adds a seat for one ticket, skips unknown labels', one.perTicket[0].length === 1 && one.shared.length === 0);
}
check('null answer changes nothing', mergeAI(empty(), null, gig, 1).fromAI.length === 0);
check('printed ignores spacing and case', printed('kx4 82q1', gig) && !printed('ZZ9', gig));
check('time 1405 matches 14:05', mergeAI(empty(), { time: '14:05' }, 'DEP 1405', 1).time === '14:05');
check('time 2:30 pm matches 14:30', mergeAI(empty(), { time: '14:30' }, 'Start 2:30 pm', 1).time === '14:30');
check('time 2:30 am does not match 14:30', mergeAI(empty(), { time: '14:30' }, 'Start 2:30 am', 1).time === undefined);
check('date 11/14/2026 matches', mergeAI(empty(), { date: '2026-11-14' }, 'Date 11/14/2026', 1).date === '2026-11-14');
check('date 14.11.26 matches', mergeAI(empty(), { date: '2026-11-14' }, 'Datum 14.11.26', 1).date === '2026-11-14');
check('date November 14th matches', mergeAI(empty(), { date: '2026-11-14' }, 'Saturday, November 14th', 1).date === '2026-11-14');

console.log(bad ? `\n${bad} failed` : '\nAll passed');
process.exit(bad ? 1 : 0);
