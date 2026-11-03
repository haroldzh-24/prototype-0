import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { borders, spacing, themed, typography } from '../ui/tokens';

/**
 * Undo instead of confirm: after a delete, a removal or a reset, a short bar says what happened ("Deleted T3") with
 * UNDO (`action`), which takes back that edit through the editor's one history.
 */
export default function UndoBar({ text, action, docked = true }: { text: string; action: ReactNode; /** false inside a sheet's footer */ docked?: boolean }) {
  return <View testID="undo-bar" accessibilityLiveRegion="polite" style={[styles.bar, docked && styles.docked]}>
    <Text numberOfLines={2} style={styles.text}>{text}</Text>
    {action}
  </View>;
}
const styles = themed(c => ({
  bar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: spacing.md, paddingRight: 4, paddingVertical: 4, borderWidth: borders.strong, borderColor: c.border, backgroundColor: c.text },
  docked: { position: 'absolute', left: spacing.sm, right: spacing.sm, bottom: spacing.sm },
  text: { ...typography.label, color: c.background, flex: 1 },
}));
