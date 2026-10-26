import { Pressable, Text, View } from 'react-native';
import { colors, ui } from './kit';
import { matchFamilies } from '../rules/rulesets';
import type { TargetFamily } from '../stage/targetFamily';

export default function TargetFamilyPicker({ value, onChange, disabled = false }: {
  value: TargetFamily; onChange: (value: TargetFamily) => void; disabled?: boolean;
}) {
  return <View accessibilityRole="radiogroup" accessibilityLabel="Target family" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
    {(matchFamilies.includes(value) ? matchFamilies : [...matchFamilies, value]).map(family => <Pressable key={family} accessibilityRole="radio" accessibilityLabel={family}
      accessibilityState={{ checked: value === family, disabled }} disabled={disabled} onPress={() => onChange(family)}
      style={[ui.action, { flexGrow: 1, minWidth: 80, backgroundColor: value === family ? colors.text : colors.secondary, opacity: disabled ? 0.4 : 1 }]}>
      <Text style={[ui.actionText, value === family && { color: colors.background }]}>{family}{value === family ? ' ✓' : ''}</Text>
    </Pressable>)}
  </View>;
}
