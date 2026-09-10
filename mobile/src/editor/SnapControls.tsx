import { Pressable, StyleSheet, Switch, View } from 'react-native';
import Text from '@/editor/FieldText';
import type { SnapSettings } from '@/stage/snapping';
export default function SnapControls({ value, onChange, disabled }: {
  value: SnapSettings; onChange: (value: SnapSettings) => void; disabled: boolean;
}) {
  return <View style={styles.panel}>
    <Text>GRID 12 / 6 IN</Text>
    <View style={styles.row}><Text>SNAP</Text><Switch trackColor={{ false: '#384236', true: '#345c59' }} thumbColor="#c5cebc" accessibilityLabel="Snapping" value={value.enabled}
      disabled={disabled} onValueChange={(enabled) => onChange({ ...value, enabled })} /></View>
    <View style={styles.row}><Text>STEP</Text>{([12, 6, 3] as const).map((increment) =>
      <Pressable key={increment} accessibilityRole="button" accessibilityState={{ selected: value.gridIncrement === increment }}
        disabled={disabled || !value.enabled} onPress={() => onChange({ ...value, gridIncrement: increment })}
        style={[styles.option, value.gridIncrement === increment && styles.active]}><Text>{increment} in</Text></Pressable>)}</View>
    <View style={styles.row}><Text>ALIGN / 3 IN</Text><Switch trackColor={{ false: '#384236', true: '#345c59' }} thumbColor="#c5cebc" accessibilityLabel="Object alignment"
      disabled={disabled || !value.enabled} value={value.objectAlignment}
      onValueChange={(objectAlignment) => onChange({ ...value, objectAlignment })} /></View>
    <View style={styles.row}><Text>ROT</Text>{([15, 5, null] as const).map((increment) =>
      <Pressable key={String(increment)} accessibilityRole="button" accessibilityState={{ selected: value.rotationIncrement === increment }}
        disabled={disabled || !value.enabled} onPress={() => onChange({ ...value, rotationIncrement: increment })}
        style={[styles.option, value.rotationIncrement === increment && styles.active]}>
        <Text>{increment === null ? 'Free' : increment + ' deg'}</Text></Pressable>)}</View>
    {!value.enabled && <Text>Position and rotation snapping are off.</Text>}
  </View>;
}
const styles = StyleSheet.create({
  panel: { paddingVertical: 6, gap: 4, borderBottomWidth: 1, borderColor: '#465044' }, row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  option: { padding: 8, minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: '#465044', borderRadius: 2 }, active: { backgroundColor: '#263f3f', borderColor: '#60b5bc' },
});
