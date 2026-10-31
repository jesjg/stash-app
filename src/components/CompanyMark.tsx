import { StyleSheet, Text, View } from 'react-native';
import type { Stub } from '../lib/types';
import { colors, font } from '../theme';

export const companyOf = (stub: Stub) => stub.details?.find((d) => d.label === 'Company')?.value;

/** Letters for the badge: "Ryanair" → R, "British Airways" → BA, "P&O Ferries" → PO. */
function initials(name: string) {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return words
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

/** The company's name as a badge, where Apple Wallet puts the airline's logo. */
export function CompanyMark({ name, accent, small, onDark }: { name: string; accent: string; small?: boolean; onDark?: boolean }) {
  const box = small ? 22 : 30;
  return (
    <View style={styles.row} accessibilityLabel={name}>
      <View style={[styles.tile, { width: box, height: box, borderRadius: small ? 6 : 8 }, onDark && { backgroundColor: accent }]}>
        <Text style={[styles.letters, { color: onDark ? colors.ink : accent, fontSize: small ? 11 : 14 }]}>{initials(name)}</Text>
      </View>
      <Text style={[styles.name, small && { fontSize: 13 }, onDark && { color: colors.nightText }]} numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  tile: { backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  letters: { ...font.monoBold, letterSpacing: 0.5 },
  name: { ...font.bodyBold, fontSize: 16, color: colors.ink, flexShrink: 1 },
});
