import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

const VIOLET = '#8B3DFF';
const TICKET = 'M14 0H86A14 14 0 0 1 100 14V74A10 10 0 0 0 100 94V122A14 14 0 0 1 86 136H14A14 14 0 0 1 0 122V94A10 10 0 0 0 0 74V14A14 14 0 0 1 14 0Z';
/** One dot per ticket type colour (see lib/ticketTypes.ts). */
const DOTS = ['#2563FF', '#00825A', '#E0007A', '#D14000', '#007A9E', VIOLET];

/** At small sizes the tear line goes and three bigger dots stand in for six, so it stays legible. */
const SMALL_DOTS = ['#2563FF', '#E0007A', VIOLET];

/** The Stash mark: a white ticket with a heavy S, tilted on violet. Same as the app icon. */
export function Logo({ size = 44 }: { size?: number }) {
  const small = size <= 60;
  return (
    <Svg width={size} height={size} viewBox="0 0 220 220" accessibilityLabel="Stash">
      <Rect width={220} height={220} rx={50} fill={VIOLET} />
      <G transform="translate(110 112) rotate(-8) scale(1.2) translate(-50 -68)">
        <Path d={TICKET} fill="#FFFFFF" />
        <SvgText x={50} y={64} fontSize={56} fontWeight="800" fill={VIOLET} textAnchor="middle">
          S
        </SvgText>
        {small ? (
          SMALL_DOTS.map((c, i) => <Circle key={c} cx={30 + i * 20} cy={104} r={8} fill={c} />)
        ) : (
          <>
            <Line x1={16} y1={84} x2={84} y2={84} stroke="#D9D9D9" strokeWidth={2.5} strokeDasharray="4 4" strokeLinecap="round" />
            {DOTS.map((c, i) => (
              <Circle key={c} cx={20 + i * 12} cy={108} r={5} fill={c} />
            ))}
          </>
        )}
      </G>
    </Svg>
  );
}
