import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { borders, spacing, themed, typography } from '../ui/tokens';

/**
 * Slot 4, docked at the bottom of the canvas: the selected object's name (T3 · USPSA TARGET), `action` beside it
 * (rotate and deselect), and its actions below. The same bar in 2D and 3D.
 */
export default function SelectionBar({ title, action, children }: { title?: string; action?: ReactNode; children?: ReactNode }) {
  return <View testID="selection-bar" style={styles.bar}>
    {(!!title || !!action) && <View style={styles.titleRow}>
      {!!title && <Text numberOfLines={2} style={styles.title}>{title}</Text>}
      {!!action && <View style={styles.row}>{action}</View>}
    </View>}
    {!!children && <View style={styles.row}>{children}</View>}
  </View>;
}
const styles = themed(c => ({
  bar: { position: 'absolute', left: spacing.sm, right: spacing.sm, bottom: spacing.sm, padding: 6, gap: 6, borderWidth: borders.strong, borderColor: c.border, backgroundColor: c.panel },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 6 },
  title: { ...typography.category, color: c.text, flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
}));
