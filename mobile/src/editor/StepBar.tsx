import type { ReactNode } from 'react';
import { View } from 'react-native';
import { themed } from '../ui/tokens';

/** Slot 2: BUILD · PLAN · WALK, each with a small count badge (BUILD: stage-check findings; PLAN: targets planned). */
export default function StepBar({ children }: { children: ReactNode }) {
  return <View accessibilityRole="tablist" style={styles.steps}>{children}</View>;
}
const styles = themed(c => ({
  steps: { flexDirection: 'row', gap: 6, paddingHorizontal: 6, paddingVertical: 6, backgroundColor: c.background },
}));
