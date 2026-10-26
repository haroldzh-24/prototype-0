import type { ReactNode } from 'react';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { borders, colors, spacing, themed, touch, typography } from './tokens';
import { useThemeMode } from './theme';
export { colors } from './tokens';

/** Outdoor high-contrast building blocks (day and night). Every control is at least 48 pt; primary actions 56 pt. */
export function Screen({ title, children, header, safeTop = false }: { title?: string; children: ReactNode; header?: ReactNode; safeTop?: boolean }) {
  useThemeMode();
  return <SafeAreaView edges={safeTop ? ['top', 'left', 'right', 'bottom'] : ['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>{header}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={ui.screen} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {title && <Text accessibilityRole="header" style={ui.title}>{title.toUpperCase()}</Text>}{children}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
export function ScreenHeader({ title, action, back }: { title: string; action?: ReactNode; back?: () => void }) {
  return <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md, gap: spacing.md, borderBottomWidth: 4, borderColor: colors.border, backgroundColor: colors.background }}>
    {back && <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back}
      style={({ pressed }) => [{ alignSelf: 'flex-start', minHeight: touch.min, minWidth: touch.min, paddingHorizontal: spacing.md, borderWidth: borders.strong, borderColor: colors.border, justifyContent: 'center' }, pressed && { opacity: 0.6 }]}>
      <Text style={ui.actionText}>‹ BACK</Text></Pressable>}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md }}>
      <Text accessibilityRole="header" style={[ui.title, { flexGrow: 1, flexShrink: 1, minWidth: 120 }]}>{title.toUpperCase()}</Text>{action}
    </View>
  </View>;
}
export function StatusBadge({ label, tone = 'inactive' }: { label: string; tone?: 'selected' | 'movement' | 'warning' | 'error' | 'success' | 'inactive' }) {
  const fill = tone === 'selected' ? colors.accent : tone === 'error' ? colors.danger : tone === 'warning' ? colors.caution : 'transparent';
  const text = tone === 'selected' ? colors.onAccent : tone === 'error' ? colors.onDanger : tone === 'warning' ? colors.onCaution : tone === 'movement' ? colors.movement : colors.text;
  return <Text style={[ui.eyebrow, { color: text, backgroundColor: fill, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderWidth: borders.regular, borderColor: fill === 'transparent' ? colors.border : fill }]}>{label.toUpperCase()}</Text>;
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
  return <View style={{ gap: spacing.xs }}><Text style={ui.eyebrow}>{label}</Text><TextInput accessibilityLabel={label} autoFocus style={ui.input} value={value} maxLength={100} editable={!disabled} onChangeText={onChange} placeholderTextColor={colors.subdued} /></View>;
}
export function ToolButton({ title, selected = false, disabled = false, onPress }: { title: string; selected?: boolean; disabled?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress}
    style={[ui.action, selected && { backgroundColor: colors.text }, { opacity: disabled ? 0.4 : 1 }]}>
    <Text style={[ui.actionText, selected && { color: colors.background }]}>{title}</Text></Pressable>;
}
export function DeleteConfirmation({ detail, noun, busy, onKeep, onDelete, error }: { detail: string; noun: string; busy: boolean; onKeep: () => void; onDelete: () => void; error: string }) {
  return <Panel><Notice tone="warning">{detail}</Notice><Action title="Cancel" disabled={busy} onPress={onKeep} /><Action variant="destructive" title={busy ? 'Deleting...' : 'Delete'} disabled={busy} onPress={onDelete} />{!!error && <ErrorState title={'Could not delete ' + noun + '.'} detail={error} />}</Panel>;
}
export function Panel({ children }: { children: ReactNode }) { return <View style={ui.panel}>{children}</View>; }
export function Action({ title, onPress, disabled = false, variant = 'secondary', accessibilityLabel }: { title: string; onPress: () => void; disabled?: boolean; variant?: 'primary' | 'secondary' | 'quiet' | 'destructive'; accessibilityLabel?: string }) {
  return <Pressable accessibilityLabel={accessibilityLabel} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [ui.action,
      variant === 'primary' && { backgroundColor: colors.primary, minHeight: touch.primary },
      variant === 'destructive' && { borderColor: colors.danger },
      variant === 'quiet' && { backgroundColor: 'transparent', borderWidth: 0, borderBottomWidth: borders.regular, borderColor: colors.hairline },
      { opacity: disabled ? 0.4 : pressed ? 0.65 : 1 }]}>
    <Text style={[ui.actionText, variant === 'primary' && { color: colors.onPrimary, fontSize: 21 }, variant === 'destructive' && { color: colors.danger }]}>{title}</Text>
  </Pressable>;
}
export function Section({ title, children }: { title: string; children?: ReactNode }) { return <View style={{ gap: 12 }}><Text accessibilityRole="header" style={ui.eyebrow}>{title.toUpperCase()}</Text>{children}</View>; }
export function EmptyState({ title, detail }: { title: string; detail: string }) { return <Panel><Text style={ui.sectionTitle}>{title}</Text><Copy>{detail}</Copy></Panel>; }
export function Loading({ label }: { label: string }) { return <View style={ui.dataRow}><ActivityIndicator color={colors.accent} /><Copy>{label}</Copy></View>; }
export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warning' | 'error' | 'success' }) {
  const fill = tone === 'error' ? colors.danger : tone === 'warning' ? colors.caution : tone === 'success' ? colors.background : colors.selected;
  const text = tone === 'error' ? colors.onDanger : tone === 'warning' ? colors.onCaution : colors.text;
  return <Text accessibilityLiveRegion="polite" style={[ui.copy, { padding: 12, backgroundColor: fill, color: text, borderWidth: borders.regular, borderColor: tone === 'error' ? colors.danger : tone === 'warning' ? colors.caution : colors.border, fontFamily: typography.label.fontFamily }]}>{children}</Text>;
}
export function Segmented({ options, value, onChange, disabled = false }: { options: readonly string[]; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', borderWidth: borders.strong, borderColor: colors.border }}>{options.map((option, i) =>
    <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: value === option, disabled }} disabled={disabled} onPress={() => onChange(option)}
      style={[{ flexGrow: 1, flexBasis: 0, minWidth: 64, minHeight: touch.min, paddingHorizontal: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.secondary }, i > 0 && { borderLeftWidth: borders.regular, borderColor: colors.border }, value === option && { backgroundColor: colors.text }, disabled && { opacity: 0.4 }]}>
      <Text style={[ui.actionText, { textAlign: 'center' }, value === option && { color: colors.background }]}>{option}</Text></Pressable>)}</View>;
}
export function Stat({ value, label, unit }: { value: string | number; label: string; unit?: string }) {
  return <View style={ui.stat} accessible accessibilityLabel={label + ": " + value + (unit ? " " + unit : "")}><Text style={ui.statValue}>{value}{unit && <Text style={ui.statUnit}> {unit}</Text>}</Text><Text style={ui.statLabel}>{label.toUpperCase()}</Text></View>;
}
export function DataRow({ label, value }: { label: string; value: string | number }) {
  return <View style={ui.dataRow}><Text style={[ui.copy, { flex: 1 }]}>{label}</Text><Text style={ui.dataValue}>{value}</Text></View>;
}
export const ui = themed(c => ({
  screen: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  title: { ...typography.title, color: c.text },
  sectionTitle: { ...typography.section, color: c.text },
  eyebrow: { ...typography.category, color: c.muted },
  copy: { ...typography.body, color: c.muted },
  panel: { backgroundColor: c.panel, borderTopWidth: borders.strong, borderColor: c.border, paddingVertical: spacing.lg, paddingHorizontal: spacing.lg, gap: spacing.md },
  action: { borderWidth: borders.strong, borderColor: c.border, backgroundColor: c.secondary, paddingHorizontal: 14, paddingVertical: 10, minHeight: touch.min, minWidth: touch.min, maxWidth: '100%', flexShrink: 1, justifyContent: 'center' },
  actionText: { ...typography.label, color: c.text, flexShrink: 1 },
  input: { ...typography.body, color: c.text, borderWidth: borders.regular, borderColor: c.border, paddingHorizontal: 12, paddingVertical: 10, minHeight: touch.min, backgroundColor: c.secondary },
  statGroup: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: borders.strong, borderColor: c.border, padding: 12, gap: 12 },
  stat: { flexGrow: 1, flexBasis: '26%', minWidth: 82, gap: 2 },
  statValue: { ...typography.value, color: c.text, fontVariant: ['tabular-nums'] },
  statUnit: { ...typography.label, color: c.muted },
  statLabel: { ...typography.category, color: c.muted },
  dataRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 10, borderBottomWidth: borders.regular, borderColor: c.hairline },
  dataValue: { ...typography.label, color: c.text, fontVariant: ['tabular-nums'], textAlign: 'right', flexShrink: 1 },
}));
