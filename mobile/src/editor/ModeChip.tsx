import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { borders, spacing, themed, typography } from '../ui/tokens';

/**
 * On the canvas whenever a mode changes what a tap does (placing, drawing, shooting areas, PATH, ENGAGE,
 * choosing targets): what a tap does now (`title`), which mode it is (`detail`), and DONE (`action`).
 */
export default function ModeChip({ title, detail, action }: { title: string; detail?: string; action: ReactNode }) {
  return <View testID="mode-chip" accessibilityLiveRegion="polite" style={styles.chip}>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={styles.title}>{title}</Text>
      {!!detail && <Text numberOfLines={2} style={styles.detail}>{detail}</Text>}
    </View>
    {action}
  </View>;
}
const styles = themed(c => ({
  // Leaves the top-right corner to FIT.
  chip: { position: 'absolute', top: spacing.sm, left: spacing.sm, right: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: spacing.md, paddingRight: 4, paddingVertical: 4,
    borderWidth: borders.strong, borderColor: c.border, backgroundColor: c.panel },
  title: { ...typography.label, fontSize: 16, lineHeight: 20, color: c.text },
  detail: { ...typography.category, fontSize: 12, lineHeight: 15, color: c.muted },
}));
