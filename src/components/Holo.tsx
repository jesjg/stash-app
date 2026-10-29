import { useEffect, useId, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { hasMotion } from '../lib/native';
import { startTilt, tilt } from '../lib/tilt';

/** The foil's rainbow, as gradient stops. */
export const HOLO_STOPS: { offset: string; color: string; opacity?: string }[] = [
  { offset: '0', color: '#FF9DE2', opacity: '0' },
  { offset: '0.2', color: '#FF9DE2' },
  { offset: '0.32', color: '#FFF3A0' },
  { offset: '0.42', color: '#9DF5FF' },
  { offset: '0.48', color: '#FFFFFF' },
  { offset: '0.54', color: '#B49DFF' },
  { offset: '0.66', color: '#9DFFC9' },
  { offset: '0.8', color: '#FF9DE2' },
  { offset: '1', color: '#FF9DE2', opacity: '0' },
];

/**
 * Where the foil's band is, 0…1: the phone's tilt on builds with the motion sensor, otherwise a
 * slow sweep. `native` drives the sweep on the UI thread (only for transforms and opacity).
 */
export function useHoloSweep(native = true): Animated.Value {
  const [x] = useState(() => new Animated.Value(0));
  const [tilting] = useState(() => hasMotion);
  useEffect(() => {
    if (tilting) {
      const stop = startTilt();
      if (stop) return stop;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(x, { toValue: 1, duration: 4200, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
        Animated.timing(x, { toValue: 0, duration: 4200, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [x, tilting, native]);
  return tilting ? tilt : x;
}

/**
 * Holographic foil: a soft rainbow band that slowly sweeps across whatever is behind it
 * (the card colour or a cover photo), like a foil bank card catching the light.
 */
export function Holo({ intensity = 0.32 }: { intensity?: number }) {
  const id = useId().replace(/:/g, '');
  const [size, setSize] = useState({ w: 0, h: 0 });
  const sweep = useHoloSweep();

  const { w, h } = size;
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {w > 0 && (
        <Animated.View
          style={{
            position: 'absolute',
            top: 0,
            left: -w,
            width: w * 3,
            height: h,
            opacity: intensity,
            transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-w * 0.6, w * 0.6] }) }],
          }}
        >
          <Svg width={w * 3} height={h}>
            <Defs>
              <LinearGradient id={`holo${id}`} x1="0" y1="0" x2="1" y2="0.35">
                {HOLO_STOPS.map((st) => (
                  <Stop key={st.offset} offset={st.offset} stopColor={st.color} stopOpacity={st.opacity ?? '1'} />
                ))}
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={w * 3} height={h} fill={`url(#holo${id})`} />
          </Svg>
        </Animated.View>
      )}
    </View>
  );
}
