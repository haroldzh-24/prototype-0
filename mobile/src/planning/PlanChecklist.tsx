import { Pressable, Text, View } from 'react-native';
import { borders, colors, themed, touch, typography } from '../ui/tokens';
import type { ChecklistKey, PlanChecklistState } from './planStatus';

/**
 * PLAN's checklist header (UI cohesion plan, phase 3): 1 Shooting areas · 2 Route · 3 Targets and reloads, each
 * showing ✓, a count or what is missing, and opening its tool when tapped. Presentational: state from planChecklist,
 * taps out through onPress. `current` marks the tool that is open.
 */
export default function PlanChecklist({ checklist, onPress, current = null }: {
  checklist: PlanChecklistState; onPress: (key: ChecklistKey) => void; current?: ChecklistKey | null;
}) {
  return <View accessibilityRole="list" style={styles.list}>
    {checklist.lines.map(line => <Pressable key={line.key} accessibilityRole="button" accessibilityLabel={`${line.step} ${line.title}: ${line.status}`}
      accessibilityState={{ selected: current === line.key }} onPress={() => onPress(line.key)}
      style={({ pressed }) => [styles.row, current === line.key && { backgroundColor: colors.selected }, pressed && { opacity: 0.65 }]}>
      <Text style={[styles.step, line.done && { backgroundColor: colors.text, color: colors.background }]}>{line.done ? '✓' : String(line.step)}</Text>
      <View style={{ flex: 1, gap: 0 }}>
        <Text style={styles.title}>{line.title}</Text>
        <Text style={[styles.status, !line.done && { color: colors.warning }]}>{line.status}</Text>
      </View>
    </Pressable>)}
  </View>;
}
// Compact, so the stage keeps its room at 390 × 844: each line is one touch target high (title over status).
const styles = themed(c => ({
  list: { borderBottomWidth: borders.regular, borderColor: c.border, backgroundColor: c.background },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: touch.min, paddingHorizontal: 12, paddingVertical: 3, borderTopWidth: 1, borderColor: c.hairline },
  step: { ...typography.category, color: c.text, width: 26, height: 26, lineHeight: 24, textAlign: 'center', borderWidth: borders.regular, borderColor: c.border },
  title: { ...typography.category, color: c.text },
  status: { ...typography.body, fontSize: 14, lineHeight: 18, color: c.muted },
}));
