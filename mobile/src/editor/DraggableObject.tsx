import { Image } from 'expo-image';
import { activeFaceExtent } from '@/stage/targetFace';
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
    {item.type === 'start' && <Text style={styles.startText}>START</Text>}
  </View>;
}

function PaperFaceBadge({ item }: { item: Extract<StageObject, { type: 'cardboardTarget' | 'noShootTarget' }> }) {
  const face = activeFaceExtent(item);
  const w = item.geometry.faceWidth, h = item.geometry.faceHeight;
  // Display silhouette only: active clipping comes from physical cut extents.
  const x = (face.left / w + 0.5) * 24, y = (1 - face.top / h) * 32;
  const cw = (face.right-face.left)/w*24, ch = (face.top-face.bottom)/h*32;
  const fill = item.type === 'noShootTarget' ? '#d9ded3' : '#806a45';
  const stroke = item.type === 'noShootTarget' ? '#f0f1e7' : '#c4a36b';
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="32" viewBox="0 0 24 32"><defs><clipPath id="cut"><rect x="'+x+'" y="'+y+'" width="'+cw+'" height="'+ch+'"/></clipPath></defs><polygon points="8,1 16,1 16,6 23,12 23,26 18,31 6,31 1,26 1,12 8,6" fill="'+fill+'" stroke="'+stroke+'" stroke-width="1" clip-path="url(#cut)"/></svg>';
  return <View style={{ width: 24, height: 32 }}>
    <Image source={{ uri: 'data:image/svg+xml;base64,'+btoa(svg) }} style={{ width: 24, height: 32 }} contentFit="contain" cachePolicy="none" />
    <Text style={{ position: 'absolute', top: -13, width: 24, textAlign: 'center', fontSize: 8, color: '#c7cfc0' }}>{item.type === 'noShootTarget' ? 'NS' : 'C'}</Text>
  </View>;
}

const styles = StyleSheet.create({
  object: { position: 'absolute', borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  targetMarker: { borderWidth: 0 },
  targetSymbol: { alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' },
  faceSpan: { position: 'absolute', height: 2, backgroundColor: '#b69964' },
  noShootSpan: { backgroundColor: '#c3ccbd' },
  targetBadge: { alignItems: 'center', transform: [{ translateY: -17 }] },
  targetHead: { width: 10, height: 8, backgroundColor: '#b98b50', borderWidth: 1, borderColor: '#b69964' },
  targetBody: { width: 24, height: 24, backgroundColor: '#b98b50', borderWidth: 1, borderColor: '#b69964', borderTopLeftRadius: 6, borderTopRightRadius: 6, alignItems: 'center', justifyContent: 'center' },
  steelSpan: { backgroundColor: '#829b9b' },
  steelPlate: { width: 24, height: 24, backgroundColor: '#455552', borderColor: '#829b9b', borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  steelText: { fontSize: 9, fontWeight: 'bold', color: '#d8e0d5' },
  popper: { alignItems: 'center' },
  popperHead: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#455552', borderColor: '#829b9b', borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  popperStem: { width: 7, height: 10, backgroundColor: '#455552', borderColor: '#829b9b', borderLeftWidth: 1, borderRightWidth: 1 },
  popperFoot: { width: 12, height: 4, backgroundColor: '#829b9b' },
  noShoot: { backgroundColor: '#fff', borderColor: '#c3ccbd' },
  targetText: { fontSize: 10, fontWeight: 'bold', color: '#302719' },
  port: { position: 'absolute', backgroundColor: '#101611', borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#80a6a1', alignItems: 'center', justifyContent: 'center' },
  portLabel: { position: 'absolute', top: -13, fontSize: 10, color: '#c5b476', fontWeight: 'bold' },
  wall: { backgroundColor: '#303e35', borderColor: '#83927c' },
  faultLine: { backgroundColor: '#bdab69', borderColor: '#8c8051' },
  start: { backgroundColor: '#29392d', borderColor: '#9cab88', borderRadius: 3 },
  selected: { borderColor: '#60b5bc', outlineColor: '#60b5bc', outlineWidth: 1, outlineStyle: 'solid' },
  startText: { color: '#e1e5db', fontWeight: 'bold', fontSize: 8, textAlign: 'center' },
});
