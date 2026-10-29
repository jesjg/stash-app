import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { reminderStatus, type ReminderStatus } from '../lib/reminders';
import { askPersistentBanners } from '../lib/persistent';
import { ensureReminders, useStore } from '../lib/store';
import { colors, font, label } from '../theme';
import { Icon } from './Icon';

let dismissedThisSession = false;

/**
 * Explains reminders before the iOS prompt appears (people say yes far more often
 * when they know why), and nudges again if notifications were switched off.
 */
export function NotifyPrompt() {
  const hasUpcoming = useStore((s) => s.stubs.some((x) => !x.usedAt));
  const [status, setStatus] = useState<ReminderStatus | null>(null);
  const [hidden, setHidden] = useState(dismissedThisSession);
  const insets = useSafeAreaInsets();

  useFocusEffect(
    useCallback(() => {
      reminderStatus().then(setStatus);
      const sub = AppState.addEventListener('change', (s) => s === 'active' && reminderStatus().then(setStatus));
      return () => sub.remove();
    }, []),
  );

  const visible = !hidden && hasUpcoming && (status === 'ask' || status === 'off');
  const close = () => {
    dismissedThisSession = true;
    setHidden(true);
  };

  const allow = async () => {
    if (status === 'off') {
      Linking.openSettings();
      close();
      return;
    }
    await ensureReminders(true);
    const now = await reminderStatus();
    setStatus(now);
    close();
    if (now === 'on') setTimeout(askPersistentBanners, 600);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.scrim}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.badge}>
            <Icon name="ticket" size={26} color={colors.ink} stroke={2.4} />
          </View>
          <Text style={label}>{status === 'off' ? 'Reminders are off' : 'Never miss a ticket'}</Text>
          <Text style={styles.title}>Your ticket, right when you need it</Text>
          <Text style={styles.body}>
            {status === 'off'
              ? 'Notifications for Stash are switched off, so ticket reminders can’t reach you. Turn them on in Settings → Stash → Notifications.'
              : 'On the day, Stash pings you (2 hours before, or 8am) and puts the ticket on your lock screen. Tap it and the code is up at full brightness.'}
          </Text>
          <Text style={styles.tip}>
            Tip: in Settings → Stash → Notifications, set Banner Style to Persistent so reminders stay on screen until
            you swipe them.
          </Text>
          <Pressable accessibilityRole="button" onPress={allow} style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]}>
            <Text style={styles.primaryText}>{status === 'off' ? 'Open Settings' : 'Allow notifications'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={close} style={styles.ghost}>
            <Text style={styles.ghostText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(17,17,17,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.ground, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 24, gap: 12 },
  badge: { width: 56, height: 56, borderRadius: 18, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  title: { ...font.display, fontSize: 24, color: colors.ink },
  body: { ...font.body, fontSize: 16, lineHeight: 23, color: colors.ink },
  tip: { ...font.mono, fontSize: 12, lineHeight: 18, color: colors.inkSoft },
  primary: { height: 56, borderRadius: 999, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  primaryText: { ...font.bodyBold, fontSize: 17, color: colors.ink },
  ghost: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  ghostText: { ...font.bodyMedium, fontSize: 15, color: colors.inkSoft },
});
