import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
export const colors = { background: '#101411', panel: '#1c231e', border: '#465044', text: '#e1e5db', muted: '#a6b0a0', accent: '#d0b368' };
export function Screen({ title, children }: { title: string; children: ReactNode }) { return <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={ui.screen} keyboardShouldPersistTaps="handled"><Text style={ui.eyebrow}>PRACTICAL / SHOOTING</Text><Text style={ui.title}>{title}</Text>{children}</ScrollView>; }
export function Copy({ children }: { children: ReactNode }) { return <Text style={ui.copy}>{children}</Text>; }
export function Panel({ children }: { children: ReactNode }) { return <View style={ui.panel}>{children}</View>; }
export function Action({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) { return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [ui.action, { opacity: disabled ? 0.4 : pressed ? 0.65 : 1 }]}><Text style={ui.actionText}>{title.toUpperCase()}</Text></Pressable>; }
export const ui = StyleSheet.create({
  screen: { padding: 20, paddingBottom: 60, gap: 16 }, title: { color: colors.text, fontSize: 28, fontWeight: 'bold', letterSpacing: 1 },
  eyebrow: { color: colors.accent, fontSize: 11, letterSpacing: 2 }, copy: { color: colors.muted, fontSize: 15, lineHeight: 23 },
  panel: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, padding: 20, gap: 12 },
  action: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, padding: 16, minHeight: 48 },
  actionText: { color: colors.text, fontWeight: 'bold', letterSpacing: 1 },
  input: { color: colors.text, borderWidth: 1, borderColor: colors.border, padding: 12, minHeight: 48, backgroundColor: colors.background },
});
