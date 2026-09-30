import { useRef, useState } from 'react';
import { PanResponder, View, StyleSheet } from 'react-native';
import Text from './FieldText';
import type { StageDocument, StageObject } from '../stage/model';
import { stageToViewport, moveByViewportDelta } from '../stage/coordinates';
import type { ViewportTransform } from '../stage/coordinates';
import type { SnapSettings } from '../stage/snapping';
import { endpoints, isSegment, setEndpoints, snapEndpoint } from '../stage/segments';
import { isTarget, rotateTarget, angularDelta } from '../stage/targetPlacement';
type Props = { item: StageObject; stage: StageDocument; transform: ViewportTransform; snapping: SnapSettings; onDragging: (v: boolean) => void; setStage: React.Dispatch<React.SetStateAction<StageDocument>> };
function Handle({ x, y, label, begin, move, finish }: { x: number; y: number; label: string; begin: () => void; move: (dx: number, dy: number) => void; finish: () => void }) {
  const latest = useRef({ begin, move, finish }); latest.current = { begin, move, finish };
  const [responder] = useState(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => latest.current.begin(),
    onPanResponderMove: (e, g) => { if (e.nativeEvent.touches.length === 1) latest.current.move(g.dx, g.dy); },
    onPanResponderTerminationRequest: e => e.nativeEvent.touches.length > 1,
    onPanResponderRelease: () => latest.current.finish(), onPanResponderTerminate: () => latest.current.finish(),
  }));
  return <View {...responder.panHandlers} accessibilityLabel={label} style={{ position: 'absolute', left: x - 22, top: y - 22, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
    <View pointerEvents="none" style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#69d5df', borderWidth: 2, borderColor: '#101611' }} />
  </View>;
}
export default function GeometryControls(props: Props) {
  const captured = useRef(props);
  const wheel = useRef({ angle: 0, previous: 0, x: 0, y: 0, radius: 44 });
  const { item, transform } = props;
  if (isSegment(item)) {
    const ends = endpoints(item);
    return <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>{(['start', 'end'] as const).map(key => {
      const p = stageToViewport(ends[key], transform);
      return <Handle key={key} x={p.x} y={p.y} label={'Drag segment ' + key} begin={() => { captured.current = props; props.onDragging(true); }} finish={() => props.onDragging(false)} move={(dx,dy) => {
        const initial = captured.current; if (!isSegment(initial.item)) return;
        const original = endpoints(initial.item), opposite = key === 'start' ? 'end' : 'start';
        const desired = moveByViewportDelta(original[key], { x: dx, y: dy }, initial.transform);
        const snapped = snapEndpoint(props.stage, desired, original[opposite], props.snapping, item.id).point;
        props.setStage(current => { const o = current.objects.find(o => o.id === item.id); return o && isSegment(o) ? setEndpoints(current, o, key === 'start' ? snapped : original.start, key === 'end' ? snapped : original.end).stage : current; });
      }} />;
    })}</View>;
  }
  if (!isTarget(item)) return null;
  const p = stageToViewport(item.position, transform), radius = Math.max(42, Math.hypot(item.geometry.faceWidth, item.geometry.faceHeight) * transform.scale / 2 + 18);
  const radians = (item.rotation - 90) * Math.PI / 180, x = Math.cos(radians) * radius, y = Math.sin(radians) * radius;
  return <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
    <View pointerEvents="none" style={{ position: 'absolute', left: p.x-radius, top: p.y-radius, width: radius*2, height: radius*2, borderWidth: 1, borderColor: '#69d5df88', borderRadius: radius }} />
    <Text pointerEvents="none" style={{ position: 'absolute', left: p.x-40, top: p.y+radius+4, width: 80, textAlign: 'center', color: '#69d5df' }}>{item.rotation.toFixed(1)}°</Text>
    <Handle x={p.x+x} y={p.y+y} label="Drag target rotation wheel" begin={() => {
      wheel.current = { angle: item.rotation, previous: item.rotation-90, x, y, radius }; props.onDragging(true);
    }} finish={() => props.onDragging(false)} move={(dx,dy) => {
      const w = wheel.current, px = w.x+dx, py = w.y+dy;
      if (Math.hypot(px,py) < 8) return;
      const angle = Math.atan2(py,px)*180/Math.PI;
      w.angle += angularDelta(w.previous, angle); w.previous = angle;
      const value = w.angle;
      props.setStage(current => rotateTarget(current,item.id,value).stage);
    }} />
  </View>;
}
