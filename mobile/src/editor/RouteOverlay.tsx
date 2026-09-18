import { useRef, useState } from 'react';
import { PanResponder, View, Text } from 'react-native';
import { stageToViewport, moveByViewportDelta } from '../stage/coordinates';
import type { ViewportTransform, StagePosition } from '../stage/coordinates';
import type { StageDocument } from '../stage/model';
import type { StageRoute, ShootingPosition } from '../planning/route';
import { movePosition } from '../planning/route';
import { isEngageable } from '../planning/model';

export type RouteOverlayProps = { route: StageRoute; selectedId: string | null; onSelect: (id: string) => void; onChange: (route: StageRoute) => void; onDragging: (value: boolean) => void };
export default function RouteOverlay(props: RouteOverlayProps & { stage: StageDocument; transform: ViewportTransform }) {
  const { stage, transform, route } = props;
  const start = stage.objects.find(o => o.type === 'start');
  const points = [...(start ? [start.position] : []), ...route.positions.map(p => p.position)];
  return <>
    {stage.objects.filter(isEngageable).map((target, index) => {
      const point = stageToViewport(target.position, transform);
      return <Text key={target.id} pointerEvents="none" style={{ position: 'absolute', left: point.x + 14, top: point.y - 10, color: '#d0b368', backgroundColor: '#101411', fontSize: 11 }}>T{index + 1}</Text>;
    })}
    {points.slice(1).map((point, index) => {
      const a = stageToViewport(points[index], transform), b = stageToViewport(point, transform);
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      return <View key={`line-${index}`} pointerEvents="none" style={{ position: 'absolute', left: (a.x + b.x) / 2 - length / 2, top: (a.y + b.y) / 2 - 1, width: length, height: 2, backgroundColor: '#d0b368', transform: [{ rotate: `${Math.atan2(b.y - a.y, b.x - a.x)}rad` }] }} />;
    })}
    {route.positions.map((p, index) => <Marker key={p.id} position={p} index={index} transform={transform} selected={p.id === props.selectedId} select={() => props.onSelect(p.id)} onDragging={props.onDragging} move={position => props.onChange(movePosition(route, p.id, position, stage.stage))} />)}
  </>;
}
function Marker(props: { position: ShootingPosition; index: number; transform: ViewportTransform; selected: boolean; select: () => void; onDragging: (value: boolean) => void; move: (position: StagePosition) => void }) {
  const latest = useRef(props); latest.current = props;
  const drag = useRef({ position: props.position.position, transform: props.transform });
  const [responder] = useState(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { const p = latest.current; drag.current = { position: p.position.position, transform: p.transform }; p.select(); p.onDragging(true); },
    onPanResponderMove: (_, gesture) => latest.current.move(moveByViewportDelta(drag.current.position, { x: gesture.dx, y: gesture.dy }, drag.current.transform)),
    onPanResponderRelease: () => latest.current.onDragging(false), onPanResponderTerminate: () => latest.current.onDragging(false),
  }));
  const center = stageToViewport(props.position.position, props.transform);
  return <View {...responder.panHandlers} accessible accessibilityRole="button" accessibilityState={{ selected: props.selected }} accessibilityLabel={`Shooting position ${props.index + 1}: ${props.position.label}`} onAccessibilityTap={props.select} style={{ position: 'absolute', zIndex: props.selected ? 2 : 1, left: center.x - 22, top: center.y - 22, width: 44, height: 44, borderRadius: 22, borderWidth: props.selected ? 3 : 1, borderColor: '#d0b368', backgroundColor: '#252e27', justifyContent: 'center', alignItems: 'center' }}><Text numberOfLines={2} style={{ color: '#e1e5db', fontSize: 11 }}>{props.index + 1}: {props.position.label}</Text></View>;
}
