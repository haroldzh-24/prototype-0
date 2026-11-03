import type { ReactNode } from 'react';
import { View } from 'react-native';
import { borders, spacing, themed } from '../ui/tokens';

/**
 * Slot 1 of the stage editor's five fixed slots: ‹ back, the stage name with ✎, ↶ undo, ↷ redo, Save.
 * The five slots, top to bottom: EditorHeader, StepBar, the canvas (with ModeChip while a mode is on), SelectionBar
 * (docked at the bottom of the canvas) and ToolBar. They are layout only: StageBuilder passes the buttons in.
 */
export default function EditorHeader({ children }: { children: ReactNode }) {
  return <View style={styles.header}>{children}</View>;
}
const styles = themed(c => ({
  header: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', paddingHorizontal: spacing.sm, paddingVertical: 6, borderBottomWidth: borders.strong, borderColor: c.border, backgroundColor: c.background },
}));
