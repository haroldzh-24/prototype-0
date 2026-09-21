import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, typography } from './tokens';
export { colors } from './tokens';
export function Screen({ title, children }: { title: string; children: ReactNode }) { return <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={ui.screen} keyboardShouldPersistTaps="handled"><Text style={ui.eyebrow}>PRACTICAL / SHOOTING</Text><Text style={ui.title}>{title.charAt(0) + title.slice(1).toLowerCase()}</Text>{children}</ScrollView>; }
export function Copy({ children }: { children: ReactNode }) { return <Text style={ui.copy}>{children}</Text>; }
export function Panel({ children }: { children: ReactNode }) { return <View style={ui.panel}>{children}</View>; }
export function Action({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) { return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [ui.action, { opacity: disabled ? 0.4 : pressed ? 0.65 : 1 }]}><Text style={ui.actionText}>{title}</Text></Pressable>; }
export function Stat({ value, label, unit }: { value: string | number; label: string; unit?: string }) {
  return <View style={ui.stat} accessible accessibilityLabel={label + ": " + value + (unit ? " " + unit : "")}><Text style={ui.statValue}>{value}{unit && <Text style={ui.statUnit}> {unit}</Text>}</Text><Text style={ui.statLabel}>{label.toUpperCase()}</Text></View>;
}
export function DataRow({ label, value }: { label: string; value: string | number }) {
  return <View style={ui.dataRow}><Text style={[ui.copy, { flex: 1 }]}>{label}</Text><Text style={ui.dataValue}>{value}</Text></View>;
}
export const ui = StyleSheet.create({
  screen: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 60, gap: 16 },
  title: { ...typography.title, color: colors.text },
  eyebrow: { ...typography.category, color: colors.muted },
  copy: { ...typography.body, color: colors.muted },
  panel: { backgroundColor: colors.panel, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingVertical: 16, paddingHorizontal: 16, gap: 12 },
  action: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.secondary, paddingHorizontal: 12, paddingVertical: 12, minHeight: 44, justifyContent: 'center' },
  actionText: { ...typography.label, color: colors.text },
  input: { ...typography.body, color: colors.text, borderBottomWidth: 1, borderColor: colors.border, padding: 10, minHeight: 44, backgroundColor: colors.secondary },
  statGroup: { flexDirection: 'row', flexWrap: 'wrap', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingBottom: 16, gap: 12 },
  stat: { flexGrow: 1, flexBasis: '26%', minWidth: 82, gap: 4 },
  statValue: { ...typography.value, color: colors.text, fontVariant: ['tabular-nums'] },
  statUnit: { ...typography.label, color: colors.muted },
  statLabel: { ...typography.category, color: colors.muted },
  dataRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  dataValue: { ...typography.body, color: colors.text, fontVariant: ['tabular-nums'], textAlign: 'right', flexShrink: 1 },
});
