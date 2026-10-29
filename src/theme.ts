import type { TextStyle } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { paletteColor } from './lib/palette';

/** Read the chosen app colour straight from the saved settings, before any screen draws. */
function savedAccent(): string {
  try {
    const f = new File(Paths.document, 'stubs', 'stubs.json');
    if (f.exists) return paletteColor(JSON.parse(f.textSync())?.settings?.accent)?.accent ?? '#FF5A1F';
  } catch {}
  return '#FF5A1F';
}

// Tear-off: paper ground, black ink, one hot accent, poster type for names, mono for details.
export const colors = {
  ground: '#EDEDE9',
  paper: '#FFFFFF',
  paperWarm: '#F7F7F3',
  ink: '#111111',
  inkSoft: '#55554F',
  inkFaint: '#6A6A63',
  rule: '#CFCFC8',
  perforation: '#D9D9D2',
  night: '#111111',
  nightText: '#F4F4F0',
  nightSoft: '#B9B9B2',
  nightRule: '#3A3A36',
  /** The app colour the person picked in Settings (orange by default). */
  accent: savedAccent(),
  danger: '#C8321A',
} as const;

export const fonts = {
  display: 'StubsDisplay',
  body: 'SpaceGrotesk_400Regular',
  bodyMedium: 'SpaceGrotesk_500Medium',
  bodyBold: 'SpaceGrotesk_700Bold',
  mono: 'SpaceMono_400Regular',
  monoBold: 'SpaceMono_700Bold',
} as const;

/**
 * Text styles in the system font (San Francisco), matching the ticket cards. Spread one into a
 * style: `{ ...font.bodyBold, fontSize: 16 }`. `fonts.display` is kept only for the logo's S.
 */
export const font = {
  display: { fontWeight: '800', letterSpacing: -0.6 },
  body: { fontWeight: '400' },
  bodyMedium: { fontWeight: '500' },
  bodyBold: { fontWeight: '700' },
  mono: { fontWeight: '500', fontVariant: ['tabular-nums'] },
  monoBold: { fontWeight: '700', fontVariant: ['tabular-nums'] },
} satisfies Record<string, TextStyle>;

/** Small grey capitals over a section, like the labels on a ticket. */
export const label: TextStyle = {
  fontSize: 12,
  fontWeight: '600',
  letterSpacing: 0.8,
  textTransform: 'uppercase',
  color: colors.inkSoft,
};
