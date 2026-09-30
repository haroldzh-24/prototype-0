import { colors } from '../ui/tokens';
import TargetFace from './TargetFace';
import { isTarget } from '../stage/targetPlacement';
import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import Text from '@/editor/FieldText';
import { moveByViewportDelta, stageToViewport } from '@/stage/coordinates';
import type { ViewportTransform } from '@/stage/coordinates';
import { objectLabel } from '@/stage/model';
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
      current.onSelect(current.item.id); current.onDragging(true); current.onFeedback({ guides: [], gridAxes: [] });
    },
    onPanResponderTerminationRequest: event => event.nativeEvent.touches.length >= 2,
    onPanResponderMove: (event, gesture) => {
      if (event.nativeEvent.touches.length !== 1) return;
      const position = moveByViewportDelta(drag.current.position, { x: gesture.dx, y: gesture.dy }, drag.current.transform);
      const { item, setStage, stage, snapping, onFeedback } = latest.current;
      const result = resolveMovement(stage, item.id, position, snapping);
      setStage((current) => moveObject(current, item.id, result.position)); onFeedback(result);
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
  const target = item.type === 'cardboardTarget' || item.type === 'noShootTarget' || item.type === 'steelPlate' || item.type === 'steelPopper';
  const width = isTarget(item) ? Math.max(44, item.geometry.faceWidth * transform.scale) : dimensions.width * transform.scale;
  const height = isTarget(item) ? Math.max(44, item.geometry.faceHeight * transform.scale) : dimensions.depth * transform.scale;
  return <View testID={"stage-object-" + item.id} {...responder.panHandlers} hitSlop={10}
    accessible accessibilityRole="button" accessibilityLabel={objectLabel(item.type)}
    accessibilityState={{ selected }} onAccessibilityTap={() => props.onSelect(item.id)}
    style={[styles.object, target ? styles.targetMarker
      : item.type === 'wall' ? styles.wall : item.type === 'faultLine' ? styles.faultLine : styles.start, {
      left: center.x - width / 2, top: center.y - height / 2, width, height,
      transform: [{ rotate: item.rotation + 'deg' }],
    }, selected && styles.selected]}>
    {isTarget(item) && <TargetFace item={item} scale={transform.scale} />}
    {item.type === 'wall' && item.ports.map((port, index) => <View key={port.id} pointerEvents="none"
      style={[styles.port, {
        left: (item.geometry.length / 2 + port.offset - port.width / 2) * transform.scale - 1,
        width: port.width * transform.scale,
        top: -1, height,
      }]}>
      <Text style={styles.portLabel}>{index + 1}</Text>
    </View>)}
    {item.type === 'start' && <Text style={styles.startText}>START</Text>}
  </View>;
}

const styles = StyleSheet.create({
  object: { position: 'absolute', borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  targetMarker: { borderWidth: 0 },
  port: { position: 'absolute', backgroundColor: colors.background, borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#80a6a1', alignItems: 'center', justifyContent: 'center' },
  portLabel: { position: 'absolute', top: -13, fontSize: 10, color: '#c5b476', fontWeight: 'bold' },
  wall: { backgroundColor: '#303e35', borderColor: '#83927c' },
  faultLine: { backgroundColor: '#bdab69', borderColor: '#8c8051' },
  start: { backgroundColor: '#29392d', borderColor: '#9cab88', borderRadius: 3 },
  selected: { borderColor: colors.accent, outlineColor: colors.accent, outlineWidth: 1, outlineStyle: 'solid' },
  startText: { color: colors.text, fontWeight: 'bold', fontSize: 8, textAlign: 'center' },
});
