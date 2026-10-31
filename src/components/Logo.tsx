import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';

const VIOLET = '#9747FF';
const TICKET = 'M14 0H86A14 14 0 0 1 100 14V74A10 10 0 0 0 100 94V122A14 14 0 0 1 86 136H14A14 14 0 0 1 0 122V94A10 10 0 0 0 0 74V14A14 14 0 0 1 14 0Z';
const DOTS = ['#FF2D95', '#1E7BFF', '#00D16C'];

/** The Stash mark: a white ticket with a big S and pink, blue and green dots, tilted on violet. Same as the app icon. */
export function Logo({ size = 44 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 220 220" accessibilityLabel="Stash">
      <Rect width={220} height={220} rx={50} fill={VIOLET} />
      <G transform="translate(110 110) rotate(-8) scale(1.2) translate(-50 -68)">
        <Path d={TICKET} fill="#FFFFFF" />
        <SvgText x={50} y={80} fontSize={80} fontWeight="800" fill={VIOLET} textAnchor="middle">
          S
        </SvgText>
        {DOTS.map((c, i) => (
          <Circle key={c} cx={26 + i * 24} cy={110} r={8} fill={c} />
        ))}
      </G>
    </Svg>
  );
}
