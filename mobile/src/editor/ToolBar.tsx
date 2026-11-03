import type { ReactNode } from 'react';
import { View } from 'react-native';
import { borders, themed } from '../ui/tokens';

/** Slot 5: up to four tools for the current step and ••• for that step's settings; while a mode is on, its tools. */
export default function ToolBar({ children, label }: { children: ReactNode; label?: string }) {
  return <View accessibilityRole="toolbar" accessibilityLabel={label} style={styles.tools}>{children}</View>;
}
const styles = themed(c => ({
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 6, paddingVertical: 6, borderTopWidth: borders.strong, borderColor: c.border, backgroundColor: c.panel },
}));
