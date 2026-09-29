import { colors } from '../ui/tokens';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import Text from '@/editor/FieldText';
import type { SnapSettings } from '@/stage/snapping';
import { formatYards } from '../stage/measurements';
export default function SnapControls({ value, onChange, disabled }: {
  value: SnapSettings; onChange: (value: SnapSettings) => void; disabled: boolean;
}) {
  return <View style={styles.panel}>
    <Text>Grid distances in yards</Text>
    <View style={styles.row}><Text>Snapping</Text><Switch trackColor={{ false: colors.border, true: colors.accent }} thumbColor={colors.text} accessibilityLabel="Snapping" value={value.enabled}
      disabled={disabled} onValueChange={(enabled) => onChange({ ...value, enabled })} /></View>
    <View style={styles.row}><Text>Grid step</Text>{([12, 6, 3] as const).map((increment) =>
      <Pressable key={increment} accessibilityRole="button" accessibilityState={{ selected: value.gridIncrement === increment }}
        disabled={disabled || !value.enabled} onPress={() => onChange({ ...value, gridIncrement: increment })}
        style={[styles.option, value.gridIncrement === increment && styles.active]}><Text>{formatYards(increment)}</Text></Pressable>)}</View>
    <View style={styles.row}><Text>Object alignment / {formatYards(3)}</Text><Switch trackColor={{ false: colors.border, true: colors.accent }} thumbColor={colors.text} accessibilityLabel="Object alignment"
      disabled={disabled || !value.enabled} value={value.objectAlignment}
      onValueChange={(objectAlignment) => onChange({ ...value, objectAlignment })} /></View>
    <View style={styles.row}><Text>Rotation</Text>{([15, 5, null] as const).map((increment) =>
      <Pressable key={String(increment)} accessibilityRole="button" accessibilityState={{ selected: value.rotationIncrement === increment }}
        disabled={disabled || !value.enabled} onPress={() => onChange({ ...value, rotationIncrement: increment })}
        style={[styles.option, value.rotationIncrement === increment && styles.active]}>
        <Text>{increment === null ? 'Free' : increment + ' deg'}</Text></Pressable>)}</View>
    {!value.enabled && <Text>Position and rotation snapping are off.</Text>}
  </View>;
}
const styles = StyleSheet.create({
  panel: { paddingHorizontal: 16, paddingVertical: 12, gap: 12, borderBottomWidth: 1, borderColor: colors.border }, row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  option: { padding: 8, minHeight: 44, justifyContent: 'center', borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.secondary }, active: { backgroundColor: colors.selected, borderColor: colors.accent },
});
