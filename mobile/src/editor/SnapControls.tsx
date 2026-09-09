import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import type { SnapSettings } from '@/stage/snapping';
export default function SnapControls({ value, onChange, disabled }: {
  value: SnapSettings; onChange: (value: SnapSettings) => void; disabled: boolean;
}) {
  return <View style={styles.panel}>
    <Text>Grid: 1 ft major / 6 in minor</Text>
    <View style={styles.row}><Text>Snapping</Text><Switch accessibilityLabel="Snapping" value={value.enabled}
      disabled={disabled} onValueChange={(enabled) => onChange({ ...value, enabled })} /></View>
    <View style={styles.row}><Text>Position increment</Text>{([12, 6, 3] as const).map((increment) =>
      <Pressable key={increment} accessibilityRole="button" accessibilityState={{ selected: value.gridIncrement === increment }}
        disabled={disabled || !value.enabled} onPress={() => onChange({ ...value, gridIncrement: increment })}
        style={[styles.option, value.gridIncrement === increment && styles.active]}><Text>{increment} in</Text></Pressable>)}</View>
    <View style={styles.row}><Text>Object alignment (3 in tolerance)</Text><Switch accessibilityLabel="Object alignment"
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
  panel: { paddingVertical: 10, gap: 6 }, row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  option: { padding: 8, borderWidth: 1, borderColor: '#98a5af', borderRadius: 4 }, active: { backgroundColor: '#cbe3ff', borderColor: '#007aff' },
});
