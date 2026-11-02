// Reading a stay from several screenshots. Run: npm run test:stay
import { addStayPage, emptyStay, hasField, nightsOf, readStayPage } from '../src/lib/stayReader';

let bad = 0;
const check = (name: string, ok: boolean) => {
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'} ${name}`);
};
const today = new Date(2026, 10, 1);

const shot1 = ['9:41', 'Your trip', 'Home in Gili T', 'Hosted by Made', 'Check-in\tCheckout', 'Tue, 17 Nov\tThu, 19 Nov', '2:00 pm\t11:00 am'].join('\n');
const shot2 = ['Address', 'Jl Pari, Jl Manta, Gili Trawangan', 'Get directions'].join('\n');
const shot3 = [
  'Made: Hi! I will meet you at the harbour and give you the key in person.',
  'From the harbour, turn left at the mosque. Green gate on the right, Jl Pari.',
  'House code for the gate is 7314. Wifi: GiliHome / password: pari2026',
].join('\n');

{
  const p = readStayPage(shot1, { place: 'Home in Gili T', host: 'Made', checkInDate: '2026-11-17', checkInTime: '14:00', checkOutDate: '2026-11-19', checkOutTime: '11:00' }, today);
  check('screenshot 1: place, host, dates', p.place === 'Home in Gili T' && p.host === 'Made' && p.checkIn === '2026-11-17' && p.checkOut === '2026-11-19' && p.checkInTime === '14:00');
}
{
  const p = readStayPage(shot1, { place: 'Villa Sunset', host: 'Ketut', checkInDate: '2026-12-01' }, today);
  check('made-up answers are dropped', p.place !== 'Villa Sunset' && p.host !== 'Ketut' && p.checkIn !== '2026-12-01');
}
{
  const p = readStayPage(shot3, { gettingIn: 'Host meets you, key in person', doorCode: '7314', wifiName: 'GiliHome', wifiPassword: 'pari2026', arrival: ['From the harbour, turn left at the mosque.', 'Green gate on the right, Jl Pari.', 'Take a taxi to the airport.'] }, today);
  check('screenshot 3: code and Wi-Fi', p.doorCode === '7314' && p.wifiName === 'GiliHome' && p.wifiPassword === 'pari2026');
  check('screenshot 3: getting in summary kept', p.gettingIn === 'Host meets you, key in person');
  check('arrival steps not on the page are dropped', p.arrival?.length === 2);
}
{
  let d = emptyStay();
  d = addStayPage(d, readStayPage(shot1, { place: 'Home in Gili T', host: 'Made', checkInDate: '2026-11-17', checkOutDate: '2026-11-19' }, today), 0);
  d = addStayPage(d, readStayPage(shot2, { address: 'Jl Pari, Jl Manta, Gili Trawangan', place: 'Gili Trawangan' }, today), 1);
  d = addStayPage(d, readStayPage(shot3, { doorCode: '7314', wifiName: 'GiliHome' }, today), 2);
  check('first page wins: place stays Home in Gili T', d.place === 'Home in Gili T');
  check('sources recorded', d.source.place === 0 && d.source.dates === 0 && d.source.address === 1 && d.source.gettingIn === 2 && d.source.wifi === 2);
  check('2 nights', nightsOf(d.checkIn, d.checkOut) === 2);
  check('hasField', hasField(d, 'address') && hasField(d, 'wifi') && !hasField(d, 'arrival'));
}
{
  const p = readStayPage('Check-in 17 Nov\nCheck-out 15 Nov', { checkInDate: '2026-11-17', checkOutDate: '2026-11-15' }, today);
  check('check-out before check-in is dropped', p.checkIn === '2026-11-17' && !p.checkOut);
}
{
  const p = readStayPage(shot3, null, today);
  check('no Apple Intelligence: rules still find the code', p.doorCode === '7314');
}
console.log(bad ? `\n${bad} failed` : '\nAll passed');
process.exit(bad ? 1 : 0);
