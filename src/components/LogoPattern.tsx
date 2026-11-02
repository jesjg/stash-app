import { Circle, Defs, G, Path, Pattern, Text as SvgText } from 'react-native-svg';

// The Stash logo, repeated across a ticket's coloured header: small pale tickets with the S
// and three dots cut out of them, in staggered rows.

/** The logo's ticket outline, 100 × 136 with a notch on each side. */
const TICKET = 'M14 0H86A14 14 0 0 1 100 14V74A10 10 0 0 0 100 94V122A14 14 0 0 1 86 136H14A14 14 0 0 1 0 122V94A10 10 0 0 0 0 74V14A14 14 0 0 1 14 0Z';

const ICON_H = 17;
const SCALE = ICON_H / 136;
/** Gap between logos in a row, and between rows (every other row shifted by half). */
const STEP_X = 42;
const STEP_Y = 32;

function Mark({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <G transform={`translate(${x} ${y}) scale(${SCALE})`}>
      <Path d={TICKET} fill="#FFFFFF" fillOpacity={0.22} />
      {/* The S and dots in the header colour, so they read as holes in the pale ticket. */}
      <SvgText x={50} y={80} fontSize={80} fontWeight="800" fill={color} textAnchor="middle">
        S
      </SvgText>
      {[26, 50, 74].map((cx) => (
        <Circle key={cx} cx={cx} cy={110} r={8} fill={color} />
      ))}
    </G>
  );
}

/** Put inside an <Svg>, then fill a shape with `url(#id)`. */
export function LogoPatternDef({ id, color }: { id: string; color: string }) {
  const w = (100 * SCALE) / 2;
  return (
    <Defs>
      <Pattern id={id} patternUnits="userSpaceOnUse" x={0} y={0} width={STEP_X} height={STEP_Y * 2}>
        <Mark x={STEP_X / 4 - w} y={STEP_Y / 2 - ICON_H / 2} color={color} />
        <Mark x={(3 * STEP_X) / 4 - w} y={(3 * STEP_Y) / 2 - ICON_H / 2} color={color} />
      </Pattern>
    </Defs>
  );
}
