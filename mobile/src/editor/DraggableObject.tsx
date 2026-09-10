import { activeFaceExtent } from '@/stage/targetFace';
import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
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
  const target = item.type === 'cardboardTarget' || item.type === 'noShootTarget' || item.type === 'steelPlate' || item.type === 'steelPopper';
  const cutFace = item.type === 'cardboardTarget' || item.type === 'noShootTarget' ? activeFaceExtent(item) : null;
  const fullFaceWidth = item.type === 'cardboardTarget' || item.type === 'noShootTarget' ? item.geometry.faceWidth * transform.scale : dimensions.width * transform.scale;
  const localCenter = cutFace ? (cutFace.left + cutFace.right) / 2 * transform.scale : 0;
  const faceSpan = dimensions.width * transform.scale;
  // The upright face projects to a line. The badge is only a selectable editor symbol.
  const width = target ? Math.max(24, fullFaceWidth) : faceSpan;
  const height = target ? 66 : dimensions.depth * transform.scale;
  return <View {...responder.panHandlers} hitSlop={10}
    accessible accessibilityRole="button" accessibilityLabel={objectLabel(item.type)}
    accessibilityState={{ selected }} onAccessibilityTap={() => props.onSelect(item.id)}
    style={[styles.object, target ? styles.targetMarker
      : item.type === 'wall' ? styles.wall : item.type === 'faultLine' ? styles.faultLine : styles.start, {
      left: center.x - width / 2, top: center.y - height / 2, width, height,
      transform: [{ rotate: item.rotation + 'deg' }],
    }, selected && styles.selected]}>
    {target && <View pointerEvents="none" style={styles.targetSymbol}>
      <View style={[styles.faceSpan, { width: faceSpan, transform: [{ translateX: localCenter }] }, item.type === 'noShootTarget' && styles.noShootSpan, (item.type === 'steelPlate' || item.type === 'steelPopper') && styles.steelSpan]} />
      <View style={styles.targetBadge}>
      {item.type === 'steelPlate' ? <View style={styles.steelPlate}><Text style={styles.steelText}>SP</Text></View>
        : item.type === 'steelPopper' ? <View style={styles.popper}>
          <View style={styles.popperHead}><Text style={styles.steelText}>P</Text></View>
          <View style={styles.popperStem} />
          <View style={styles.popperFoot} />
        </View> : (item.type === 'cardboardTarget' || item.type === 'noShootTarget') ? <PaperFaceBadge item={item} /> : null}
      </View>
    </View>}
    {item.type === 'wall' && item.ports.map((port, index) => <View key={port.id} pointerEvents="none"
      style={[styles.port, {
        left: (item.geometry.length / 2 + port.offset - port.width / 2) * transform.scale - 1,
        width: port.width * transform.scale,
        top: -1, height,
      }]}>
      <Text style={styles.portLabel}>{index + 1}</Text>
    </View>)}
    {item.type === 'start' && <Text style={styles.startText}>Start Position</Text>}
  </View>;
}

function PaperFaceBadge({ item }: { item: Extract<StageObject, { type: 'cardboardTarget' | 'noShootTarget' }> }) {
  const face = activeFaceExtent(item);
  const w = item.geometry.faceWidth, h = item.geometry.faceHeight;
  return <View style={{ width: 24, height: 32 }}>
    <View style={{ position: 'absolute', left: (face.left / w + 0.5) * 24, top: (1 - face.top / h) * 32,
      width: (face.right - face.left) / w * 24, height: (face.top - face.bottom) / h * 32,
      backgroundColor: item.type === 'noShootTarget' ? '#fff' : '#b98b50',
      borderWidth: 1, borderColor: item.type === 'noShootTarget' ? '#333' : '#604522' }} />
    <Text style={{ position: 'absolute', top: -12, width: 24, textAlign: 'center', fontSize: 9, fontWeight: 'bold' }}>{item.type === 'noShootTarget' ? 'NS' : 'C'}</Text>
  </View>;
}

const styles = StyleSheet.create({
  object: { position: 'absolute', borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  targetMarker: { borderWidth: 0 },
  targetSymbol: { alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' },
  faceSpan: { position: 'absolute', height: 2, backgroundColor: '#604522' },
  noShootSpan: { backgroundColor: '#333' },
  targetBadge: { alignItems: 'center', transform: [{ translateY: -17 }] },
  targetHead: { width: 10, height: 8, backgroundColor: '#b98b50', borderWidth: 1, borderColor: '#604522' },
  targetBody: { width: 24, height: 24, backgroundColor: '#b98b50', borderWidth: 1, borderColor: '#604522', borderTopLeftRadius: 6, borderTopRightRadius: 6, alignItems: 'center', justifyContent: 'center' },
  steelSpan: { backgroundColor: '#235d78' },
  steelPlate: { width: 24, height: 24, backgroundColor: '#a7c7d8', borderColor: '#235d78', borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  steelText: { fontSize: 9, fontWeight: 'bold', color: '#153e52' },
  popper: { alignItems: 'center' },
  popperHead: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#a7c7d8', borderColor: '#235d78', borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  popperStem: { width: 7, height: 10, backgroundColor: '#a7c7d8', borderColor: '#235d78', borderLeftWidth: 1, borderRightWidth: 1 },
  popperFoot: { width: 12, height: 4, backgroundColor: '#235d78' },
  noShoot: { backgroundColor: '#fff', borderColor: '#333' },
  targetText: { fontSize: 10, fontWeight: 'bold', color: '#302719' },
  port: { position: 'absolute', backgroundColor: '#e0fbff', borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#007b91', alignItems: 'center', justifyContent: 'center' },
  portLabel: { position: 'absolute', top: -13, fontSize: 10, color: '#006879', fontWeight: 'bold' },
  wall: { backgroundColor: '#657783', borderColor: '#25333d' },
  faultLine: { backgroundColor: '#f4c542', borderColor: '#805800' },
  start: { backgroundColor: '#d85b3d', borderColor: '#9e351d', borderRadius: 3 },
  selected: { borderColor: '#007aff', outlineColor: '#007aff', outlineWidth: 2, outlineStyle: 'solid' },
  startText: { color: 'white', fontWeight: 'bold', fontSize: 8, textAlign: 'center' },
});
