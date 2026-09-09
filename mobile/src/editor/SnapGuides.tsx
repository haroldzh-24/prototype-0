import { StyleSheet, Text, View } from 'react-native';
import type { StageSize, ViewportTransform } from '@/stage/coordinates';
import type { SnapFeedback } from '@/stage/snapping';
export default function SnapGuides({ feedback, stage, transform: t }: {
  feedback: SnapFeedback; stage: StageSize; transform: ViewportTransform;
}) {
  const active = feedback.guides.length > 0 || feedback.gridAxes.length > 0;
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    {feedback.guides.map((guide) => <View key={guide.axis} style={{ position: 'absolute',
      backgroundColor: '#007aff',
      left: t.offsetX + (guide.axis === 'x' ? guide.value * t.scale : 0),
      top: t.offsetY + (guide.axis === 'y' ? guide.value * t.scale : 0),
      width: guide.axis === 'x' ? 2 : stage.width * t.scale,
      height: guide.axis === 'y' ? 2 : stage.depth * t.scale,
    }} />)}
    {active && <Text style={styles.status}>{[
      feedback.guides.length ? 'Aligned ' + feedback.guides.map((g) => g.axis.toUpperCase()).join('/') : '',
      feedback.gridAxes.length ? 'Grid ' + feedback.gridAxes.join('/').toUpperCase() : '',
    ].filter(Boolean).join(' | ')}</Text>}
  </View>;
}
const styles = StyleSheet.create({ status: { position: 'absolute', bottom: 6, left: 6,
  backgroundColor: '#ffffff', color: '#0056b3', padding: 4, fontSize: 12 } });
