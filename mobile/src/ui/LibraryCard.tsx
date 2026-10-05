import { Pressable, Text, View } from 'react-native';
import { Copy, StatusBadge, ui } from './kit';

export default function LibraryCard({ name, category, detail, disabled, open, more }: {
  name: string; category?: string; detail: string; disabled: boolean; open: () => void; more?: () => void;
}) {
  return <View style={[ui.panel, { flexDirection: 'row', alignItems: 'center', padding: 0 }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={'Open ' + name} accessibilityState={{ disabled }} disabled={disabled}
      onPress={open} style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 88, padding: 16, gap: 6, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 })}>
      {category && <StatusBadge label={category} />}<Text numberOfLines={2} ellipsizeMode="tail" style={ui.sectionTitle}>{name}</Text><Copy>{detail}</Copy>
    </Pressable>
    {more && <Pressable accessibilityRole="button" accessibilityLabel={'Actions for ' + name} accessibilityState={{ disabled }} disabled={disabled}
      onPress={more} style={{ width: 44, alignSelf: 'stretch', minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Copy>•••</Copy></Pressable>}
  </View>;
}
