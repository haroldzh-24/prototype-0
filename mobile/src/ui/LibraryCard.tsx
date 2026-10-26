import { Pressable, Text, View } from 'react-native';
import { Copy, StatusBadge, ui } from './kit';
import { borders, colors, spacing, touch } from './tokens';

export type CardBadge = { label: string; tone?: 'selected' | 'movement' | 'warning' | 'error' | 'success' | 'inactive' };

export default function LibraryCard({ name, category, detail, disabled, open, more, badges = [] }: {
  name: string; category?: string; detail: string; disabled: boolean; open: () => void; more?: () => void; badges?: CardBadge[];
}) {
  return <View style={{ flexDirection: 'row', alignItems: 'stretch', borderWidth: borders.strong, borderColor: colors.border, backgroundColor: colors.panel }}>
    <Pressable accessibilityRole="button" accessibilityLabel={'Open ' + name} accessibilityState={{ disabled }} disabled={disabled}
      onPress={open} style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 88, padding: spacing.md, gap: 6, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 })}>
      {category && <StatusBadge label={category} />}
      <Text numberOfLines={2} ellipsizeMode="tail" style={ui.sectionTitle}>{name}</Text>
      <Copy>{detail}</Copy>
      {badges.length > 0 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{badges.map(b => <StatusBadge key={b.label} label={b.label} tone={b.tone} />)}</View>}
    </Pressable>
    {more && <Pressable accessibilityRole="button" accessibilityLabel={'Actions for ' + name} accessibilityState={{ disabled }} disabled={disabled}
      onPress={more} style={({ pressed }) => ({ width: touch.primary, borderLeftWidth: borders.regular, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
      <Text style={ui.actionText}>•••</Text></Pressable>}
  </View>;
}
