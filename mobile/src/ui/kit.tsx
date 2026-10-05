import type { ReactNode } from 'react';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography } from './tokens';
export { colors } from './tokens';
export function Screen({ title, children, header, safeTop = false }: { title?: string; children: ReactNode; header?: ReactNode; safeTop?: boolean }) { return <SafeAreaView edges={safeTop ? ['top', 'left', 'right', 'bottom'] : ['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>{header}<ScrollView style={{ flex: 1 }} contentContainerStyle={ui.screen} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">{title && <Text accessibilityRole="header" style={ui.title}>{title.charAt(0) + title.slice(1).toLowerCase()}</Text>}{children}</ScrollView></KeyboardAvoidingView></SafeAreaView>; }
export function ScreenHeader({ title, action, back }: { title: string; action?: ReactNode; back?: () => void }) {
  return <View style={{ padding: spacing.lg, gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
    {back && <Action title="‹ Back" variant="quiet" onPress={back} />}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md }}><Text accessibilityRole="header" style={[ui.title, { flexGrow: 1, flexShrink: 1, minWidth: 120 }]}>{title}</Text>{action}</View>
  </View>;
}
export function StatusBadge({ label, tone = 'inactive' }: { label: string; tone?: 'selected' | 'movement' | 'warning' | 'error' | 'success' | 'inactive' }) {
  const color = tone === 'selected' || tone === 'success' ? colors.accent : tone === 'movement' ? colors.movement : tone === 'warning' ? colors.warning : tone === 'error' ? colors.danger : colors.muted;
  return <Text style={[ui.eyebrow, { color, alignSelf: 'flex-start', padding: 6, backgroundColor: colors.secondary }]}>{label}</Text>;
}
export function MenuRow({ title, onPress, destructive = false, disabled = false }: { title: string; onPress: () => void; destructive?: boolean; disabled?: boolean }) {
  return <Action title={title} onPress={onPress} disabled={disabled} variant={destructive ? 'destructive' : 'quiet'} />;
}
export function Copy({ children }: { children: ReactNode }) { return <Text style={ui.copy}>{children}</Text>; }
export function ErrorState({ title, detail, retry, busy = false }: { title: string; detail?: string; retry?: () => void; busy?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  return <Panel><Notice tone="error">{title}</Notice>{retry && <Action title="Retry" onPress={retry} disabled={busy} />}{!!detail && <><Action title={expanded ? 'Hide details' : 'Details'} variant="quiet" onPress={() => setExpanded(!expanded)} />{expanded && <Copy>{detail}</Copy>}</>}</Panel>;
}
export function Input({ label, value, onChange, disabled = false }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return <View style={{ gap: spacing.sm }}><Copy>{label}</Copy><TextInput accessibilityLabel={label} autoFocus style={ui.input} value={value} maxLength={100} editable={!disabled} onChangeText={onChange} /></View>;
}
export function ToolButton({ title, selected = false, disabled = false, onPress }: { title: string; selected?: boolean; disabled?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress} style={[ui.action, selected && { backgroundColor: colors.selected }, { opacity: disabled ? 0.4 : 1 }]}><Text style={[ui.actionText, selected && { color: colors.accent }]}>{title}</Text></Pressable>;
}
export function DeleteConfirmation({ detail, noun, busy, onKeep, onDelete, error }: { detail: string; noun: string; busy: boolean; onKeep: () => void; onDelete: () => void; error: string }) {
  return <Panel><Notice tone="warning">{detail}</Notice><Action title="Cancel" disabled={busy} onPress={onKeep} /><Action variant="destructive" title={busy ? 'Deleting...' : 'Delete'} disabled={busy} onPress={onDelete} />{!!error && <ErrorState title={'Could not delete ' + noun + '.'} detail={error} />}</Panel>;
}
export function Panel({ children }: { children: ReactNode }) { return <View style={ui.panel}>{children}</View>; }
export function Action({ title, onPress, disabled = false, variant = 'secondary', accessibilityLabel }: { title: string; onPress: () => void; disabled?: boolean; variant?: 'primary' | 'secondary' | 'quiet' | 'destructive'; accessibilityLabel?: string }) { return <Pressable accessibilityLabel={accessibilityLabel} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [ui.action, variant === 'primary' && { backgroundColor: colors.accent }, variant === 'quiet' && { backgroundColor: 'transparent', borderBottomWidth: 0 }, { opacity: disabled ? 0.4 : pressed ? 0.65 : 1 }]}><Text style={[ui.actionText, variant === 'primary' && { color: colors.background }, variant === 'destructive' && { color: colors.danger }]}>{title}</Text></Pressable>; }
export function Section({ title, children }: { title: string; children?: ReactNode }) { return <View style={{ gap: 12 }}><Text accessibilityRole="header" style={ui.eyebrow}>{title.toUpperCase()}</Text>{children}</View>; }
export function EmptyState({ title, detail }: { title: string; detail: string }) { return <Panel><Text style={ui.sectionTitle}>{title}</Text><Copy>{detail}</Copy></Panel>; }
export function Loading({ label }: { label: string }) { return <View style={ui.dataRow}><ActivityIndicator color={colors.accent} /><Copy>{label}</Copy></View>; }
export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warning' | 'error' | 'success' }) { return <Text accessibilityLiveRegion="polite" style={[ui.copy, { padding: 12, backgroundColor: colors.panel, color: tone === 'error' ? colors.danger : tone === 'warning' ? colors.warning : tone === 'success' ? colors.accent : colors.accent }]}>{children}</Text>; }
export function Segmented({ options, value, onChange, disabled = false }: { options: readonly string[]; value: string; onChange: (value: string) => void; disabled?: boolean }) { return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>{options.map(option => <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: value === option, disabled }} disabled={disabled} onPress={() => onChange(option)} style={[ui.action, { flexGrow: 1, minWidth: 64 }, value === option && { backgroundColor: colors.selected, borderColor: colors.accent }]}><Text style={[ui.actionText, value === option && { color: colors.accent }]}>{option}</Text></Pressable>)}</View>; }
export function Stat({ value, label, unit }: { value: string | number; label: string; unit?: string }) {
  return <View style={ui.stat} accessible accessibilityLabel={label + ": " + value + (unit ? " " + unit : "")}><Text style={ui.statValue}>{value}{unit && <Text style={ui.statUnit}> {unit}</Text>}</Text><Text style={ui.statLabel}>{label.toUpperCase()}</Text></View>;
}
export function DataRow({ label, value }: { label: string; value: string | number }) {
  return <View style={ui.dataRow}><Text style={[ui.copy, { flex: 1 }]}>{label}</Text><Text style={ui.dataValue}>{value}</Text></View>;
}
export const ui = StyleSheet.create({
  screen: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  title: { ...typography.title, color: colors.text },
  sectionTitle: { ...typography.section, color: colors.text },
  eyebrow: { ...typography.category, color: colors.muted },
  copy: { ...typography.body, color: colors.muted },
  panel: { backgroundColor: colors.panel, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingVertical: spacing.lg, paddingHorizontal: spacing.lg, gap: spacing.md },
  action: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.secondary, paddingHorizontal: 12, paddingVertical: 12, minHeight: 44, minWidth: 44, maxWidth: '100%', flexShrink: 1, justifyContent: 'center' },
  actionText: { ...typography.label, color: colors.text, flexShrink: 1 },
  input: { ...typography.body, color: colors.text, borderBottomWidth: 1, borderColor: colors.border, padding: 10, minHeight: 44, backgroundColor: colors.secondary },
  statGroup: { flexDirection: 'row', flexWrap: 'wrap', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingBottom: 16, gap: 12 },
  stat: { flexGrow: 1, flexBasis: '26%', minWidth: 82, gap: 4 },
  statValue: { ...typography.value, color: colors.text, fontVariant: ['tabular-nums'] },
  statUnit: { ...typography.label, color: colors.muted },
  statLabel: { ...typography.category, color: colors.muted },
  dataRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  dataValue: { ...typography.body, color: colors.text, fontVariant: ['tabular-nums'], textAlign: 'right', flexShrink: 1 },
});
