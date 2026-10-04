import { Pressable, View } from 'react-native';
import { Copy, ui } from './kit';

export default function LibraryCard({ name, category, detail, disabled, open, more }: {
  name: string; category?: string; detail: string; disabled: boolean; open: () => void; more: () => void;
}) {
  return <View style={[ui.panel, { flexDirection: 'row', alignItems: 'center', padding: 0 }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={'Open ' + name} disabled={disabled}
      onPress={open} style={({ pressed }) => ({ flex: 1, minHeight: 88, padding: 16, gap: 6, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 })}>
      {category && <Copy>{category}</Copy>}<Copy>{name}</Copy><Copy>{detail}</Copy>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={'Actions for ' + name} disabled={disabled}
      onPress={more} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Copy>•••</Copy></Pressable>
  </View>;
}
