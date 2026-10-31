import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import type { Kind } from '../lib/types';

// Sparkle tickets: glitter dust plus twinkling shapes for the ticket's type, over the coloured header only.

/** Filled white shapes, drawn in a 24pt box centred on 0,0. */
const SHAPES = {
  star4: 'M0 -12C0 -4 4 0 12 0C4 0 0 4 0 12C0 4 -4 0 -12 0C-4 0 0 -4 0 -12Z',
  star5: 'M0 -11L3 -3.5L11 -3.5L4.5 1.5L7 9.5L0 4.5L-7 9.5L-4.5 1.5L-11 -3.5L-3 -3.5Z',
  dot: 'M0 -5A5 5 0 1 1 0 5A5 5 0 1 1 0 -5Z',
  ring: 'M0 -10A10 10 0 1 1 0 10A10 10 0 1 1 0 -10ZM0 -6.5A6.5 6.5 0 1 0 0 6.5A6.5 6.5 0 1 0 0 -6.5Z',
  streak: 'M-12 -1.6H12V1.6H-12Z',
  diamond: 'M0 -11L7 0L0 11L-7 0Z',
  asterisk: 'M-1.6 -11H1.6V-2.8L8.7 -6.9L10.3 -4.1L3.2 0L10.3 4.1L8.7 6.9L1.6 2.8V11H-1.6V2.8L-8.7 6.9L-10.3 4.1L-3.2 0L-10.3 -4.1L-8.7 -6.9L-1.6 -2.8Z',
  moon: 'M2 -11A11 11 0 1 0 11 5A8.5 8.5 0 0 1 2 -11Z',
  note: 'M-3 -11L9 -12V5A3.6 3.6 0 1 1 6 1.6V-6.2L-0.6 -5.6V7A3.6 3.6 0 1 1 -3.6 3.6Z',
  confetti: 'M-2.5 -8H2.5V8H-2.5Z',
  plus: 'M-2.8 -10H2.8V-2.8H10V2.8H2.8V10H-2.8V2.8H-10V-2.8H-2.8Z',
  heart: 'M0 10C-13 1 -10 -11 0 -4.5C10 -11 13 1 0 10Z',
};
type Shape = keyof typeof SHAPES;

/** Each type's shapes, used in turn, and whether each one gets a random tilt. */
const BY_KIND: Record<Kind, { shapes: Shape[]; rotated: boolean }> = {
  flight: { shapes: ['star4', 'dot', 'dot'], rotated: false },
  train: { shapes: ['streak', 'star4', 'streak'], rotated: false },
  ferry: { shapes: ['ring', 'dot', 'ring'], rotated: false },
  bus: { shapes: ['asterisk', 'dot'], rotated: true },
  car: { shapes: ['diamond', 'star4'], rotated: false },
  stay: { shapes: ['moon', 'star5', 'dot'], rotated: true },
  gig: { shapes: ['note', 'star4'], rotated: true },
  event: { shapes: ['confetti', 'dot', 'confetti'], rotated: true },
  activity: { shapes: ['star4', 'asterisk'], rotated: true },
  visa: { shapes: ['star5', 'dot'], rotated: true },
  medical: { shapes: ['plus', 'dot'], rotated: false },
  other: { shapes: ['heart', 'star4'], rotated: true },
};

/** Random numbers seeded from the ticket's id, so a ticket always sparkles the same way. */
function seeded(seed: string) {
  let a = 2166136261;
  for (let i = 0; i < seed.length; i++) a = Math.imul(a ^ seed.charCodeAt(i), 16777619);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** True while iOS Reduce Motion is on: sparkles then hold still. */
function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}

/** A value that goes 0 → 1 → 0 forever (or holds at `still`). */
function usePulse(duration: number, delay: number, run: boolean, still: number) {
  const [v] = useState(() => new Animated.Value(still));
  useEffect(() => {
    if (!run) {
      v.setValue(still);
      return;
    }
    const half = { duration: duration / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true };
    const loop = Animated.loop(Animated.sequence([Animated.timing(v, { toValue: 1, ...half }), Animated.timing(v, { toValue: 0, ...half })]));
    v.setValue(0);
    const t = setTimeout(() => loop.start(), delay);
    return () => {
      clearTimeout(t);
      loop.stop();
    };
  }, [v, duration, delay, run, still]);
  return v;
}

function Twinkle({ x, y, size, rotation, d, duration, delay, run }: { x: number; y: number; size: number; rotation: number; d: string; duration: number; delay: number; run: boolean }) {
  const v = usePulse(duration, delay, run, 0.55);
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }),
        transform: [{ rotate: `${rotation}deg` }, { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }],
      }}
    >
      <Svg width={size} height={size} viewBox="-12 -12 24 24">
        <Path d={d} fill="#FFFFFF" fillRule="evenodd" />
      </Svg>
    </Animated.View>
  );
}

/**
 * The sparkle layer for a ticket's coloured header (`width` × `height`), drawn above the colour and
 * below the text. `animate` false (off screen, or Reduce Motion on) shows them still, at mid opacity.
 */
export function Sparkles({ width, height, kind, seed, animate }: { width: number; height: number; kind: Kind; seed: string; animate: boolean }) {
  const reduce = useReduceMotion();
  const run = animate && !reduce;
  const dust = usePulse(3400, 0, run, 0.5);

  const { dots, shapes } = useMemo(() => {
    const rand = seeded(seed);
    const between = (a: number, b: number) => a + rand() * (b - a);
    const dots = Array.from({ length: 90 }, () => ({ cx: between(0, width), cy: between(0, height), r: between(0.5, 1.3) }));
    const style = BY_KIND[kind] ?? BY_KIND.other;
    const shapes = Array.from({ length: 11 }, (_, i) => {
      const big = i < 5;
      const size = big ? between(14, 26) : between(7, 14);
      // Big ones keep to the top right, clear of the title at the bottom left.
      const x = big ? between(width * 0.45 + size / 2, width - size / 2 - 4) : between(size / 2 + 4, width - size / 2 - 4);
      const y = big ? between(size / 2 + 4, Math.max(size / 2 + 5, height * 0.45)) : between(size / 2 + 4, height - size / 2 - 4);
      return {
        x,
        y,
        size,
        d: SHAPES[style.shapes[i % style.shapes.length]],
        rotation: style.rotated ? between(0, 360) : 0,
        duration: between(1800, 3600),
        delay: between(0, 2500),
      };
    });
    return { dots, shapes };
  }, [seed, kind, width, height]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: dust.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.4] }) }]}>
        <Svg width={width} height={height}>
          {dots.map((p, i) => (
            <Circle key={i} cx={p.cx} cy={p.cy} r={p.r} fill="#FFFFFF" />
          ))}
        </Svg>
      </Animated.View>
      {shapes.map((s, i) => (
        <Twinkle key={i} {...s} run={run} />
      ))}
    </View>
  );
}
