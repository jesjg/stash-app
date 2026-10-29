import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../../components/Icon';
import { RoundButton } from '../../components/RoundButton';
import { useStore } from '../../lib/store';
import { colors, font } from '../../theme';

/** Every page as it arrived. Swipe between pages; pinch or double-tap to zoom. */
export default function Original() {
  const { id, page } = useLocalSearchParams<{ id: string; page?: string }>();
  // Also opened from the confirm screen, before the ticket is saved.
  const stub = useStore((s) => s.stubs.find((x) => x.id === id) ?? (s.draft?.id === id ? s.draft : undefined));
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pages = stub ? (stub.pageUris.length ? stub.pageUris : [...new Set(stub.tickets.map((t) => t.pageUri))]).filter(Boolean) : [];
  const start = Math.max(0, page ? pages.indexOf(page) : 0);
  const [at, setAt] = useState(start);
  if (!stub) return null;

  const areaH = height - insets.top - insets.bottom - 70;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <Text style={styles.name} numberOfLines={1}>
          {pages.length > 1 ? `Page ${at + 1} of ${pages.length}` : stub.title}
        </Text>
        <RoundButton label="Close" onPress={() => router.back()} size={40} color={colors.paper}>
          <Icon name="close" size={18} color={colors.ink} />
        </RoundButton>
      </View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        contentOffset={{ x: width * start, y: 0 }}
        onMomentumScrollEnd={(e) => setAt(Math.round(e.nativeEvent.contentOffset.x / width))}
      >
        {pages.map((uri, i) => (
          <ZoomPage key={`${uri}-${i}`} uri={uri} width={width} height={areaH} index={i} />
        ))}
      </ScrollView>
      <Text style={[styles.hint, { paddingBottom: insets.bottom + 10 }]}>Pinch or double-tap to zoom</Text>
    </View>
  );
}

function ZoomPage({ uri, width, height, index }: { uri: string; width: number; height: number; index: number }) {
  const zoomer = useRef<ScrollView>(null);
  const lastTap = useRef(0);
  const zoomed = useRef(false);

  const onTap = (x: number, y: number) => {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      // Double tap: zoom in on that spot, or back out.
      const r = zoomer.current as unknown as {
        scrollResponderZoomTo?: (rect: { x: number; y: number; width: number; height: number; animated?: boolean }) => void;
      } | null;
      if (zoomed.current) r?.scrollResponderZoomTo?.({ x: 0, y: 0, width, height, animated: true });
      else r?.scrollResponderZoomTo?.({ x: x - width / 6, y: y - height / 6, width: width / 3, height: height / 3, animated: true });
      zoomed.current = !zoomed.current;
      lastTap.current = 0;
    } else {
      lastTap.current = now;
    }
  };

  return (
    <ScrollView
      ref={zoomer}
      style={{ width, height }}
      contentContainerStyle={{ width, height, alignItems: 'center', justifyContent: 'center' }}
      maximumZoomScale={5}
      minimumZoomScale={1}
      bouncesZoom
      centerContent
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    >
      <Pressable onPress={(e) => onTap(e.nativeEvent.locationX, e.nativeEvent.locationY)} accessibilityLabel={`Page ${index + 1}`}>
        <Image source={{ uri }} style={{ width: width - 16, height: height - 8 }} contentFit="contain" />
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  name: { flex: 1, ...font.mono, fontSize: 13, color: colors.nightText },
  hint: { ...font.mono, fontSize: 11, color: colors.nightSoft, textAlign: 'center', paddingTop: 6 },
});
