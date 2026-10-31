import { Image } from 'expo-image';
import { create } from 'qrcode';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../theme';
import type { Ticket } from '../lib/types';

/** Build one SVG path for every dark module, so the code stays razor sharp at any size. */
function qrPath(payload: string): { d: string; size: number } | null {
  try {
    const qr = create(payload, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    let d = '';
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (qr.modules.get(y, x)) d += `M${x} ${y}h1v1h-1z`;
      }
    }
    return { d, size: n };
  } catch {
    return null;
  }
}

type Props = { ticket: Ticket; size: number };

/**
 * QR codes with readable text are redrawn crisply. Everything else (Aztec, PDF417,
 * barcodes, binary QR) is shown as the exact crop from the original ticket.
 */
export function CodeView({ ticket, size }: Props) {
  const { code } = ticket;
  const redraw = useMemo(
    () => (code?.symbology === 'qr' && code.payload ? qrPath(code.payload) : null),
    [code],
  );

  if (redraw) {
    return (
      <View style={[styles.quiet, { padding: size * 0.06 }]}>
        <Svg width={size} height={size} viewBox={`0 0 ${redraw.size} ${redraw.size}`}>
          <Path d={redraw.d} fill={colors.ink} />
        </Svg>
      </View>
    );
  }

  // Barcode only (no QR): show the whole ticket, barcode and all, as it was printed.
  const whole = !code || (code.symbology === 'linear' && !!ticket.pageUri);
  const uri = whole ? ticket.pageUri : code.cropUri || ticket.pageUri;
  const wide = !whole && code?.symbology === 'pdf417';
  if (!whole && code && SQUARE.has(code.symbology)) return <TrimmedCrop uri={uri} size={size} />;
  return (
    <View style={styles.quiet}>
      <Image
        source={{ uri }}
        style={{ width: size, height: wide ? size * 0.55 : whole ? size * 1.4 : size }}
        contentFit="contain"
        transition={0}
      />
    </View>
  );
}

/** Codes that are always square, so a crop far from square had its margin cut short at the edge of the picture. */
const SQUARE = new Set(['aztec', 'datamatrix', 'qr']);

/**
 * The scanner saves each code with a margin of the original picture around it (12% of the code's
 * longer side plus 8px, each side; see StubsScannerModule.swift), which pulls in frames, boxes
 * and text printed around the code. Zoom in past most of that margin so only the code shows.
 */
function TrimmedCrop({ uri, size }: { uri: string; size: number }) {
  const [crop, setCrop] = useState<{ w: number; h: number } | null>(null);
  let view: { left: number; top: number; width: number; height: number } | null = null;
  if (crop) {
    // The code's longer side, and the margin added around it.
    const side = (Math.max(crop.w, crop.h) - 16) / 1.24;
    const pad = 0.12 * side + 8;
    const w = crop.w - 2 * pad;
    const h = crop.h - 2 * pad;
    // Square codes come out nearly square (Vision's box is a little off); much less means the
    // margin was cut short at the edge of the picture, so trimming could cut the code: leave it.
    if (side > 0 && Math.min(w, h) > side * 0.9) {
      // Keep a sliver of the margin so nothing of the code itself is ever cut.
      const trim = pad * 0.85;
      const iw = crop.w - 2 * trim;
      const ih = crop.h - 2 * trim;
      const scale = size / Math.max(iw, ih);
      view = {
        left: -trim * scale + (size - iw * scale) / 2,
        top: -trim * scale + (size - ih * scale) / 2,
        width: crop.w * scale,
        height: crop.h * scale,
      };
    }
  }
  return (
    <View style={styles.quiet}>
      <View style={{ width: size, height: size, overflow: 'hidden' }}>
        <Image
          source={{ uri }}
          style={view ? { position: 'absolute', ...view } : { width: size, height: size }}
          contentFit="contain"
          transition={0}
          onLoad={(e) => e.source.width && e.source.height && setCrop({ w: e.source.width, h: e.source.height })}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  quiet: { backgroundColor: colors.paper, borderRadius: 10, padding: 10 },
});
