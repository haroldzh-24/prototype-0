import { themed } from '../ui/tokens';
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
/** Fault lines are dashed (a dash and a gap every DASH px); drawn with views because dashed borders differ per platform. */
const DASH = 12;
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
  // Walls and fault lines are a few inches thick: drawn at least 4 / 3 px so they read like the lines on a stage diagram.
  const minimum = item.type === 'wall' ? 4 : item.type === 'faultLine' ? 3 : 0;
  const height = isTarget(item) ? Math.max(44, item.geometry.faceHeight * transform.scale) : Math.max(minimum, dimensions.depth * transform.scale);
  return <View testID={"stage-object-" + item.id} {...responder.panHandlers} hitSlop={{ top: Math.max(10, (44-height)/2), bottom: Math.max(10, (44-height)/2), left: Math.max(10, (44-width)/2), right: Math.max(10, (44-width)/2) }}
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
    {item.type === 'faultLine' && <View pointerEvents="none" style={styles.dashes}>{Array.from({ length: Math.max(1, Math.floor(width / DASH)) }, (_, i) =>
      <View key={i} style={[styles.dash, { height: Math.min(3, height) }]} />)}</View>}
    {item.type === 'start' && <Text style={styles.startText}>START</Text>}
  </View>;
}

const styles = themed(c => ({
  object: { position: 'absolute', borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  targetMarker: { borderWidth: 0 },
  // Ports read as an orange gap in the ink wall, the way they are drawn on a stage diagram.
  port: { position: 'absolute', backgroundColor: c.port, alignItems: 'center', justifyContent: 'center' },
  portLabel: { position: 'absolute', top: -14, fontSize: 11, color: c.text, fontWeight: 'bold' },
  wall: { backgroundColor: c.wall, borderColor: c.wall },
  faultLine: { backgroundColor: 'transparent', borderWidth: 0 },
  dashes: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', overflow: 'hidden' },
  dash: { width: DASH * 0.6, backgroundColor: c.faultLine },
  start: { backgroundColor: c.startFill, borderColor: c.ink, borderWidth: 2 },
  selected: { borderColor: c.accent, outlineColor: c.accent, outlineWidth: 3, outlineStyle: 'solid' },
  startText: { color: c.ink, fontWeight: 'bold', fontSize: 9, textAlign: 'center' },
}));
