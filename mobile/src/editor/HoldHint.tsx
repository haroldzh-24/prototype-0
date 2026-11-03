import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { readPref, writePref } from '@/ui/prefsStore';
import { borders, colors, spacing, touch, typography } from '../ui/tokens';

/** Saved once the hint has been dismissed or press and hold has been used (prefsStore, per device). */
export const HOLD_HINT_KEY = 'psp.hint.holdToAdd';

/**
 * One-time hint on the BUILD canvas: press and hold the stage to add something there. ADD in the tool bar does the
 * same, so the gesture is a shortcut, never the only way. It goes away for good when dismissed, or once the gesture
 * has been used (`learned`).
 */
export default function HoldHint({ show, learned }: { show: boolean; learned: boolean }) {
  const [seen, setSeen] = useState(() => readPref(HOLD_HINT_KEY) === '1');
  const dismiss = () => { writePref(HOLD_HINT_KEY, '1'); setSeen(true); };
  useEffect(() => { if (learned && !seen) dismiss(); }, [learned, seen]);
  if (!show || seen) return null;
  return <View testID="hold-hint" accessibilityLiveRegion="polite" style={{ position: 'absolute', left: 8, right: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingLeft: spacing.md, paddingRight: 4, paddingVertical: 4, backgroundColor: colors.panel, borderWidth: borders.strong, borderColor: colors.border }}>
    <Text style={{ ...typography.body, fontSize: 16, lineHeight: 20, color: colors.text, flex: 1 }}>Tip: press and hold the stage to add a target, wall or fault line right there.</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Dismiss the tip" onPress={dismiss}
      style={({ pressed }) => ({ minHeight: touch.min, minWidth: touch.min, paddingHorizontal: spacing.md, justifyContent: 'center', alignItems: 'center', borderWidth: borders.regular, borderColor: colors.border, backgroundColor: colors.secondary, opacity: pressed ? 0.65 : 1 })}>
      <Text style={{ ...typography.label, color: colors.text }}>GOT IT</Text>
    </Pressable>
  </View>;
}
