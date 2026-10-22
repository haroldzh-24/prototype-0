import { colors } from '../ui/tokens';
import { memo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Text from '@/editor/FieldText';
import type { StageSize, ViewportTransform } from '@/stage/coordinates';
import { gridLabel, gridLabelStepInches, isGridLabel, measurementGrid } from '@/stage/grid';

export default memo(function StageGrid({ stage, transform: t }: { stage: StageSize; transform: ViewportTransform }) {
  const { fontScale } = useWindowDimensions();
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    {measurementGrid(stage).map((line) => {
      const vertical = line.axis === 'x';
      const left = t.offsetX + (vertical ? line.value * t.scale : 0);
      const top = t.offsetY + (vertical ? 0 : line.value * t.scale);
      return <View key={line.axis + line.value} style={{ position: 'absolute', left, top,
        width: vertical ? 1 : stage.width * t.scale,
        height: vertical ? stage.depth * t.scale : 1,
        backgroundColor: line.major ? colors.grid : colors.gridMinor }}>
        {isGridLabel(line.value, gridLabelStepInches(t.scale, (vertical ? 64 : 24) * fontScale)) && <Text style={[styles.label, { width: 60 * fontScale }]}>{gridLabel(line.value)}</Text>}
      </View>;
    })}
  </View>;
});
const styles = StyleSheet.create({ label: { position: 'absolute', left: 2, top: 2, width: 60, fontSize: 10, color: colors.muted, backgroundColor: colors.panel } });
