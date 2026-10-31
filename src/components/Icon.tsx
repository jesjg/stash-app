import Svg, { Circle, Path } from 'react-native-svg';

const paths = {
  plus: 'M12 5v14M5 12h14',
  home: 'M4 11l8-7 8 7M6 9.5V20h12V9.5M10 20v-5h4v5',
  back: 'M15 6l-6 6 6 6',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  close: 'M6 6l12 12M18 6L6 18',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  sun: 'M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  settings: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0',
  chevronDown: 'M6 9l6 6 6-6',
  chevronUp: 'M6 15l6-6 6 6',
  doc: 'M7 3h7l5 5v13H7zM14 3v5h5',
  photo: 'M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4',
  ticket: 'M4 7a2 2 0 0 0 2-2h12a2 2 0 0 0 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 0-2 2H6a2 2 0 0 0-2-2v-3a2 2 0 0 0 0-4zM14 6v2M14 11v2M14 16v2',
  plane: 'M10.5 21l1.5-1v-5l8 2v-2l-8-5V4.5a1.5 1.5 0 0 0-3 0V10l-8 5v2l8-2v5l1.5 1',
  ferry: 'M3 15l2.5 5h13l2.5-5zM6 15V9h12v6M10 9V5h4v4',
  train: 'M6 3h12v13H6zM6 10h12M9.5 13h.01M14.5 13h.01M8 20l2-4M16 20l-2-4',
  bus: 'M5 4h14v13H5zM5 11h14M8 17v3M16 17v3',
  car: 'M3 13l2-5h14l2 5v4H3zM7 17v2.5M17 17v2.5M3 13h18',
  suitcase: 'M4 8h16v12H4zM9 8V5h6v3M4 13h16',
  archive: 'M3 5h18v4H3zM5 9v10h14V9M10 13h4',
  pencil: 'M21.17 6.81a2.83 2.83 0 0 0-4-4L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z M15 5l4 4',
  // Ticket types (see lib/ticketTypes.ts).
  typePlane:
    'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z',
  typeTrain: 'M8 3h8a4 4 0 0 1 4 4v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a4 4 0 0 1 4-4z M4 11h16 M12 3v8 M8 15h.01 M16 15h.01 M8 19l-2 3 M16 19l2 3',
  typeTicket: 'M3 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z M13 5v2 M13 11v2 M13 17v2',
  typeMountain: 'M8 3l4 8 5-5 5 15H2L8 3z',
  typePassport: 'M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M9 17h6',
  typeBed: 'M2 4v16 M2 8h18a2 2 0 0 1 2 2v10 M2 17h20 M6 8v9',
  // Ship, bus, car, music and tag follow Lucide's shapes (ISC licence).
  typeShip:
    'M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 .6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.94 5.34 2.81 7.76 M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6 M12 10v4 M12 2v3',
  typeBus:
    'M8 6v6 M15 6v6 M2 12h19.6 M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3 M5 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M9 18h5 M14 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  typeCar:
    'M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2 M9 17h6 M5 17a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M15 17a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  typeMusic: 'M9 18V5l12-2v13 M3 18a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M15 16a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  typeMedical: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M12 8v8 M8 12h8',
  typeTag: 'M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z M7.5 7.5h.01',
} as const;

export type IconName = keyof typeof paths | 'more';

export function Icon({ name, size = 20, color = '#111', stroke = 2.6 }: { name: IconName; size?: number; color?: string; stroke?: number }) {
  if (name === 'more') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx={5} cy={12} r={2} fill={color} />
        <Circle cx={12} cy={12} r={2} fill={color} />
        <Circle cx={19} cy={12} r={2} fill={color} />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {name === 'sun' && <Circle cx={12} cy={12} r={4} stroke={color} strokeWidth={stroke} />}
      {name === 'settings' && (
        <>
          <Circle cx={16} cy={6} r={2} stroke={color} strokeWidth={stroke} />
          <Circle cx={10} cy={12} r={2} stroke={color} strokeWidth={stroke} />
          <Circle cx={18} cy={18} r={2} stroke={color} strokeWidth={stroke} />
        </>
      )}
      <Path d={paths[name]} stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
