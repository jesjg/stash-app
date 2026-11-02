import { Circle, Defs, G, Path, Pattern, Text as SvgText } from 'react-native-svg';

// The Stash logo, repeated across a ticket's coloured header, measured from the design:
// pale tickets (white at 15%) tilted like the app icon, with the S and dots cut out,
// 42pt apart in rows 38pt apart, every other row shifted by half.

/** The logo's ticket outline, 100 × 136 with a notch on each side. */
const TICKET = 'M14 0H86A14 14 0 0 1 100 14V74A10 10 0 0 0 100 94V122A14 14 0 0 1 86 136H14A14 14 0 0 1 0 122V94A10 10 0 0 0 0 74V14A14 14 0 0 1 14 0Z';

/** Each ticket is 24pt tall. */
const SCALE = 24 / 136;
const STEP_X = 42;
const STEP_Y = 38;

/** One logo centred on (x, y). */
function Mark({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <G transform={`translate(${x} ${y}) rotate(-8) scale(${SCALE}) translate(-50 -68)`}>
      <Path d={TICKET} fill="#FFFFFF" fillOpacity={0.15} />
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

/** Put inside an <Svg> drawn over the whole card, then fill the header with `url(#id)`. */
export function LogoPatternDef({ id, color }: { id: string; color: string }) {
  // One tile holds a logo in the middle of the top row and one on its edges in the row below
  // (drawn on both edges: each tile shows half, together a whole one). The offset puts the
  // logos where the design has them on the card.
  return (
    <Defs>
      <Pattern id={id} patternUnits="userSpaceOnUse" x={-4} y={-16} width={STEP_X} height={STEP_Y * 2}>
        <Mark x={STEP_X / 2} y={STEP_Y / 2} color={color} />
        <Mark x={0} y={(STEP_Y * 3) / 2} color={color} />
        <Mark x={STEP_X} y={(STEP_Y * 3) / 2} color={color} />
      </Pattern>
    </Defs>
  );
}
