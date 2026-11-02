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
{
  // Booking.com: both days on one line, a check-out window, a copy icon read as "L".
  const booking = ['Booking.com', 'Jatelu Sanur', 'Mon, 9 Nov 2026 - Tue, 10 Nov 2026', 'Check-in: 3:00 pm - 10:00 pm', 'Check-out: 8:00 am - 12:00 pm', 'Change dates', 'Check-in instructions', 'View details', 'Property address', 'Jl. Lantang Hidung, 80227 Sanur, Indonesia L', 'Get directions', 'Property policies', 'View all policies'].join('\n');
  const rules = readStayPage(booking, null, today);
  check('Booking.com without Apple Intelligence: name', rules.place === 'Jatelu Sanur');
  check('Booking.com: dates 9–10 Nov', rules.checkIn === '2026-11-09' && rules.checkOut === '2026-11-10');
  check('Booking.com: check in from 15:00, out by 12:00', rules.checkInTime === '15:00' && rules.checkOutTime === '12:00');
  check('Booking.com: address without the copy icon', rules.address === 'Jl. Lantang Hidung, 80227 Sanur, Indonesia');
  const ai = readStayPage(booking, { place: 'Jatelu Sanur', checkInDate: 'Mon, 9 Nov 2026', checkOutDate: '2026-11-10', checkInTime: '3:00 pm', host: 'nthor mothoʌr', address: 'Jl. Lantang Hidung, 80227 Sanur, Indonesia L' }, today);
  check('Apple Intelligence dates in other formats are used', ai.checkIn === '2026-11-09' && ai.checkInTime === '15:00');
  check('OCR noise is not a host', ai.host === undefined);
  check('copy icon dropped from the address', ai.address === 'Jl. Lantang Hidung, 80227 Sanur, Indonesia');
}
{
  const shot = ['3:31', '39', 'Booking.com', 'Getting into the property', 'The keys are at a reception on location.', 'Pick up the keys at the reception'].join('\n');
  const p = readStayPage(shot, { doorCode: '39' }, today);
  check('the battery level is not a house code', p.doorCode === undefined);
  const lockbox = readStayPage('The lockbox is by the door.\nCode: 7314', { doorCode: '7314' }, today);
  check('a labelled code is kept', lockbox.doorCode === '7314');
}
{
  // Booking.com, three screenshots: booking, check-in instructions, room and guests.
  const one = ['Booking.com', 'requests you receive and avoid clicking on', 'payment links.', 'View more', 'Marilea Bamboo Villas Concept ,', 'Private pool, seaview, Adults only', 'Fri, 13 Nov 2026 - Sat, 14 Nov 2026', 'Check-in: from 2:00 pm', 'Check-out: until 11:00 am', 'Change dates', 'Check-in instructions', 'View details', 'Property address', 'Jalan Gamat Bay ,Desa Sakti Kabupaten', 'Klungkung Nusa Penida, 80771 Nusa Penida,', 'Indonesia L', 'Get directions', 'Contact the property', 'Message property', 'Send a message', 'Other methods', 'Call +62 813-3067-0784'].join('\n');
  const two = ['Check-in instructions', 'Getting into the property', 'The keys are at a reception on location.', 'Contact property'].join('\n');
  const three = ['Manage booking', "You've booked 1 room", 'Villa with Private Pool', 'Guests', 'Jes Jones Gardner', 'Benefits', '15% Genius discount applied'].join('\n');
  let d = emptyStay();
  d = addStayPage(d, readStayPage(one, { gettingIn: 'payment links.', host: '' }, today), 0);
  d = addStayPage(d, readStayPage(two, null, today), 1);
  d = addStayPage(d, readStayPage(three, { host: 'Jes Jones Gardner' }, today), 2);
  check('Marilea: phone number found', d.phone === '+62 813-3067-0784' && d.source.phone === 0);
  check('Marilea: dates 13–14 Nov, from 14:00, until 11:00', d.checkIn === '2026-11-13' && d.checkOut === '2026-11-14' && d.checkInTime === '14:00' && d.checkOutTime === '11:00');
  check('Marilea: a payment warning is not how you get in', d.gettingIn === 'The keys are at a reception on location.' && d.source.gettingIn === 1);
  check("Marilea: the guest isn't the host", d.host === undefined);
  check('Marilea: the name, not its second line', d.place === 'Marilea Bamboo Villas Concept');
  check('Marilea: the whole address', d.address === 'Jalan Gamat Bay, Desa Sakti Kabupaten, Klungkung Nusa Penida, 80771 Nusa Penida, Indonesia');
}
{
  // Airbnb: the trip screen has the short address, Getting there has the full one.
  const trip = ['In 2 weeks', 'Home in Gili Trawangan', 'Hosted by Made', 'Check-in\tCheckout', 'Tue 17 Nov\tThu 19 Nov', '14:00\t11:00', 'Getting there', 'Jl Pari Jl Manta', 'House rules and requests'].join('\n');
  const there = ['Getting there', 'Francesco\'s Pizza', 'Google Maps', 'Gili Boho Villas, Jl Pari Jl Manta, Gili Trawangan,', 'Nusa Tenggara Bar 83356, Indonesia', 'Directions from your host', 'The way to our villa: you can either take a horse cart'].join('\n');
  let d = emptyStay();
  d = addStayPage(d, readStayPage(trip, { address: 'Jl Pari Jl Manta' }, today), 0);
  d = addStayPage(d, readStayPage(there, { address: 'Gili Boho Villas, Jl Pari Jl Manta, Gili Trawangan, Nusa Tenggara Bar 83356, Indonesia' }, today), 1);
  check('Airbnb: the full address replaces the short one', d.address === 'Gili Boho Villas, Jl Pari Jl Manta, Gili Trawangan, Nusa Tenggara Bar 83356, Indonesia' && d.source.address === 1);
  let r = emptyStay();
  r = addStayPage(r, readStayPage(trip, null, today), 0);
  r = addStayPage(r, readStayPage(there, null, today), 1);
  check('Airbnb without Apple Intelligence: full address too', r.address?.startsWith('Gili Boho Villas') === true && r.address.endsWith('Indonesia'));
  check('a different, shorter address does not replace it', addStayPage(d, { address: 'Sanur' }, 2).address === d.address);
}
console.log(bad ? `\n${bad} failed` : '\nAll passed');
process.exit(bad ? 1 : 0);
