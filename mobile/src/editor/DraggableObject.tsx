import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { moveByViewportDelta, stageToViewport } from '@/stage/coordinates';
import type { ViewportTransform } from '@/stage/coordinates';
import type { StageDocument, StageObject } from '@/stage/model';
import { footprint } from '@/stage/geometry';
import { moveObject } from '@/stage/operations';
import { resolveMovement } from '@/stage/snapping';
import type { SnapFeedback, SnapSettings } from '@/stage/snapping';

type ObjectProps = {
  onSelect: (id: string) => void;
  onDragging: (dragging: boolean) => void;
  setStage: React.Dispatch<React.SetStateAction<StageDocument>>;
  stage: StageDocument;
  snapping: SnapSettings;
  onFeedback: (feedback: SnapFeedback) => void;
  item: StageObject; transform: ViewportTransform; selected: boolean;
};
export default function DraggableObject(props: ObjectProps) {
  const latest = useRef(props);
  latest.current = props;
  const drag = useRef({ position: props.item.position, transform: props.transform });
  const [responder] = useState(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      const current = latest.current;
      drag.current = { position: current.item.position, transform: current.transform };
      current.onSelect(current.item.id);
      current.onDragging(true);
      current.onFeedback({ guides: [], gridAxes: [] });
    },
    onPanResponderMove: (_, gesture) => {
      const position = moveByViewportDelta(drag.current.position,
        { x: gesture.dx, y: gesture.dy }, drag.current.transform);
      const { item, setStage, stage, snapping, onFeedback } = latest.current;
      const result = resolveMovement(stage, item.id, position, snapping);
      setStage((current) => moveObject(current, item.id, result.position));
      onFeedback(result);
    },
    onPanResponderRelease: () => {
      latest.current.onDragging(false);
      latest.current.onFeedback({ guides: [], gridAxes: [] });
    },
    onPanResponderTerminate: () => {
      latest.current.onDragging(false);
      latest.current.onFeedback({ guides: [], gridAxes: [] });
    },
  }));
  const { item, transform, selected } = props;
  const center = stageToViewport(item.position, transform);
  const dimensions = footprint(item);
  const width = dimensions.width * transform.scale;
  const height = dimensions.depth * transform.scale;
  return <View {...responder.panHandlers} hitSlop={10}
    accessible accessibilityRole="button" accessibilityLabel={item.type === 'start' ? 'Start Position' : item.type === 'faultLine' ? 'Fault line' : item.type}
    accessibilityState={{ selected }} onAccessibilityTap={() => props.onSelect(item.id)}
    style={[styles.object, item.type === 'target' ? styles.target
      : item.type === 'wall' ? styles.wall : item.type === 'faultLine' ? styles.faultLine : styles.start, {
      left: center.x - width / 2, top: center.y - height / 2, width, height,
      transform: [{ rotate: item.rotation + 'deg' }],
    }, selected && styles.selected]}>
    {item.type === 'start' && <Text style={styles.startText}>Start Position</Text>}
  </View>;
}

const styles = StyleSheet.create({
  object: { position: 'absolute', borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  target: { backgroundColor: '#b98b50', borderColor: '#604522', borderRadius: 3 },
  wall: { backgroundColor: '#657783', borderColor: '#25333d' },
  faultLine: { backgroundColor: '#f4c542', borderColor: '#805800' },
  start: { backgroundColor: '#d85b3d', borderColor: '#9e351d', borderRadius: 3 },
  selected: { borderColor: '#007aff', outlineColor: '#007aff', outlineWidth: 2, outlineStyle: 'solid' },
  startText: { color: 'white', fontWeight: 'bold', fontSize: 8, textAlign: 'center' },
});
