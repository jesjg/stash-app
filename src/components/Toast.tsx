import { useEffect, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font } from '../theme';

type ToastState = { id: number; message: string; actionLabel?: string; onAction?: () => void; sticky?: boolean } | null;

let toast: ToastState = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function showToast(message: string, action?: { label: string; onPress: () => void }, opts?: { sticky?: boolean }) {
  toast = { id: Date.now(), message, actionLabel: action?.label, onAction: action?.onPress, sticky: opts?.sticky };
  emit();
}

function hide(id: number) {
  if (toast?.id === id) {
    toast = null;
    emit();
  }
}

export function ToastHost() {
  const current = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => toast,
  );
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!current || current.sticky) return;
    const t = setTimeout(() => hide(current.id), 6000);
    return () => clearTimeout(t);
  }, [current]);

  if (!current) return null;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + 16 }]}>
      <View style={styles.toast} accessibilityLiveRegion="polite">
        <Text style={styles.message} numberOfLines={2}>
          {current.message}
        </Text>
        {current.actionLabel && (
          <Pressable
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => {
              current.onAction?.();
              hide(current.id);
            }}
          >
            <Text style={styles.action}>{current.actionLabel}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16 },
  toast: {
    backgroundColor: colors.night,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  message: { flex: 1, color: colors.nightText, ...font.bodyMedium, fontSize: 15 },
  action: { color: colors.accent, ...font.bodyBold, fontSize: 15 },
});
