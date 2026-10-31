// Phone features that need the newer build (haptics, one-tap copy, motion). Each one checks
// the native part is there first, so over-the-air updates never crash an older build.
import { requireOptionalNativeModule } from 'expo';
import { Share } from 'react-native';

const has = (name: string) => {
  try {
    return !!requireOptionalNativeModule(name);
  } catch {
    return false;
  }
};

export const hasHaptics = has('ExpoHaptics');
export const hasClipboard = has('ExpoClipboard');

/** A small buzz. 'tap' for swipes and presses, 'success' for finishing something. */
export function haptic(kind: 'tap' | 'success' | 'tear' = 'tap') {
  if (!hasHaptics) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- only loaded when the native part exists
    const H = require('expo-haptics') as typeof import('expo-haptics');
    if (kind === 'success') H.notificationAsync(H.NotificationFeedbackType.Success);
    else if (kind === 'tear') H.impactAsync(H.ImpactFeedbackStyle.Heavy);
    else H.selectionAsync();
  } catch {}
}

/** Copy to the clipboard in one tap; on older builds, fall back to the share sheet (which has Copy). */
export async function copyText(text: string): Promise<'copied' | 'shared'> {
  if (hasClipboard) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- see above
      const C = require('expo-clipboard') as typeof import('expo-clipboard');
      await C.setStringAsync(text);
      haptic('success');
      return 'copied';
    } catch {}
  }
  await Share.share({ message: text });
  return 'shared';
}
