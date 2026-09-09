import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { StageSize, ViewportTransform } from '@/stage/coordinates';
import { measurementGrid } from '@/stage/grid';

export default memo(function StageGrid({ stage, transform: t }: { stage: StageSize; transform: ViewportTransform }) {
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    {measurementGrid(stage).map((line) => {
      const vertical = line.axis === 'x';
      const left = t.offsetX + (vertical ? line.value * t.scale : 0);
      const top = t.offsetY + (vertical ? 0 : line.value * t.scale);
      return <View key={line.axis + line.value} style={{ position: 'absolute', left, top,
        width: vertical ? 1 : stage.width * t.scale,
        height: vertical ? stage.depth * t.scale : 1,
        backgroundColor: line.major ? '#9a927f' : '#c3baa5' }}>
        {line.value > 0 && line.value % 60 === 0 && <Text style={styles.label}>{line.value / 12} ft</Text>}
      </View>;
    })}
  </View>;
});
const styles = StyleSheet.create({ label: { position: 'absolute', left: 2, top: 2, width: 40, fontSize: 9, color: '#514c41' } });
