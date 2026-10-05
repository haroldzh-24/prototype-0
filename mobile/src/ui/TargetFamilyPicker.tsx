import { Pressable, Text, View } from 'react-native';
import { colors, ui } from './kit';
import { targetFamilies } from '../stage/targetFamily';
import type { TargetFamily } from '../stage/targetFamily';

export default function TargetFamilyPicker({ value, onChange, disabled = false }: {
  value: TargetFamily; onChange: (value: TargetFamily) => void; disabled?: boolean;
}) {
  return <View accessibilityRole="radiogroup" accessibilityLabel="Target family" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
    {targetFamilies.map(family => <Pressable key={family} accessibilityRole="radio" accessibilityLabel={family}
      accessibilityState={{ checked: value === family, disabled }} disabled={disabled} onPress={() => onChange(family)}
      style={[ui.action, { flexGrow: 1, minWidth: 80, backgroundColor: value === family ? colors.selected : colors.secondary, opacity: disabled ? 0.4 : 1 }]}>
      <Text style={ui.actionText}>{family}{value === family ? ' ✓' : ''}</Text>
    </Pressable>)}
  </View>;
}
