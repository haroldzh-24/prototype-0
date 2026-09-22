import { colors } from '../ui/tokens';
import { useRef, useState } from 'react';
import { PanResponder, View, Text } from 'react-native';
import { stageToViewport, moveByViewportDelta } from '../stage/coordinates';
import type { ViewportTransform, StagePosition } from '../stage/coordinates';
import type { StageDocument } from '../stage/model';
import type { StageRoute, ShootingPosition } from '../planning/route';
import { movePosition } from '../planning/route';
import { isEngageable, targetLabel } from '../planning/model';

export type RouteOverlayProps = { preview?: boolean; highlightedSegmentId?: string; assignmentMode?: 'visible' | 'engaged' | null; onTargetTap?: (id: string) => void; route: StageRoute; selectedId: string | null; onSelect: (id: string) => void; onChange: (route: StageRoute) => void; onDragging: (value: boolean) => void };
export default function RouteOverlay(props: RouteOverlayProps & { stage: StageDocument; transform: ViewportTransform }) {
  const { stage, transform, route } = props;
  const selected = route.positions.find(p => p.id === props.selectedId);
  const start = stage.objects.find(o => o.type === 'start');
  const points = [...(start ? [start.position] : []), ...route.positions.map(p => p.position)];
  return <>
    {(props.preview ? route.positions : selected ? [selected] : []).flatMap(position => stage.objects.filter(t => isEngageable(t) && (props.preview ? position.engagedTargetIds : position.visibleTargetIds).includes(t.id)).map(target => {
      const a = stageToViewport(position.position, transform), b = stageToViewport(target.position, transform);
      const engaged = position.engagedTargetIds.includes(target.id), length = Math.hypot(b.x - a.x, b.y - a.y);
      const color = engaged ? colors.accent : '#52858e';
      return <View key={'connection-' + position.id + '-' + target.id} pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0 }}>
        <View style={{ position: 'absolute', left: (a.x + b.x) / 2 - length / 2, top: (a.y + b.y) / 2, width: length, height: props.preview ? 1 : engaged ? 2 : 1, backgroundColor: color, transform: [{ rotate: Math.atan2(b.y - a.y, b.x - a.x) + 'rad' }] }} />
        {length > 20 && <View style={{ position: 'absolute', left: b.x - 12 * (b.x - a.x) / length - 4, top: b.y - 12 * (b.y - a.y) / length - 4, width: 8, height: 8, borderTopWidth: 2, borderRightWidth: 2, borderColor: color, transform: [{ rotate: (Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 4) + 'rad' }] }} />}
        <View style={{ position: 'absolute', left: b.x - 5, top: b.y - 5, width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: color, backgroundColor: engaged ? colors.accent : colors.background }} />
      </View>;
    }))}
    {points.slice(1).map((point, index) => {
      const a = stageToViewport(points[index], transform), b = stageToViewport(point, transform);
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      const destination = route.positions[index + (start ? 0 : 1)];
      const movingReload = props.preview && route.reloads.some(r => r.positionId === destination.id && (r.mode ?? 'moving') === 'moving');
      const highlighted = props.highlightedSegmentId === destination.id;
      const color = highlighted ? colors.accent : movingReload ? colors.text : colors.accent;
      return <View key={`line-${index}`} pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0 }}><View style={{ position: 'absolute', left: (a.x + b.x) / 2 - length / 2, top: (a.y + b.y) / 2 - 1, width: length, height: highlighted ? 6 : movingReload ? 4 : 2, backgroundColor: color, transform: [{ rotate: `${Math.atan2(b.y - a.y, b.x - a.x)}rad` }] }} />{props.preview && length > 20 && <View style={{ position: 'absolute', left: (a.x + b.x) / 2 - 4, top: (a.y + b.y) / 2 - 4, width: 8, height: 8, borderTopWidth: 2, borderRightWidth: 2, borderColor: color, transform: [{ rotate: (Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 4) + 'rad' }] }} />}</View>;
    })}
    {props.preview && start && <Text pointerEvents="none" style={{ position: 'absolute', left: stageToViewport(start.position, transform).x + 12, top: stageToViewport(start.position, transform).y, color: colors.accent, backgroundColor: colors.background, fontSize: 11 }}>START</Text>}
    {!props.assignmentMode && route.positions.map((p, index) => <Marker key={p.id} position={p} index={index} transform={transform} readOnly={props.preview} reload={props.preview && route.reloads.some(r => r.positionId === p.id)} selected={p.id === props.selectedId} select={() => props.onSelect(p.id)} onDragging={props.onDragging} move={position => props.onChange(movePosition(route, p.id, position, stage.stage))} />)}
    {!props.preview && stage.objects.filter(isEngageable).map(target => {
      const point = stageToViewport(target.position, transform), visible = !!selected?.visibleTargetIds.includes(target.id), engaged = !!selected?.engagedTargetIds.includes(target.id);
      return <View key={target.id} pointerEvents="box-none" style={{ position: 'absolute', left: point.x - 22, top: point.y - 22, width: 44, height: 44 }}>
        <Text pointerEvents="none" style={{ position: 'absolute', left: 36, top: 0, width: 100, color: colors.accent, backgroundColor: colors.background, fontSize: 11 }}>{targetLabel(stage, target.id)}</Text>
        {props.assignmentMode && <TargetTap label={targetLabel(stage, target.id) + ': ' + props.assignmentMode} selected={props.assignmentMode === 'visible' ? visible : engaged} toggle={() => props.onTargetTap?.(target.id)} />}
      </View>;
    })}
    {props.assignmentMode && selected && <Text pointerEvents="none" style={{ position: 'absolute', left: stageToViewport(selected.position, transform).x - 16, top: stageToViewport(selected.position, transform).y - 10, color: colors.accent, backgroundColor: colors.background }}>{selected.label}</Text>}
  </>;
}
function Marker(props: { readOnly?: boolean; reload?: boolean; position: ShootingPosition; index: number; transform: ViewportTransform; selected: boolean; select: () => void; onDragging: (value: boolean) => void; move: (position: StagePosition) => void }) {
  const latest = useRef(props); latest.current = props;
  const drag = useRef({ position: props.position.position, transform: props.transform });
  const [responder] = useState(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { const p = latest.current; drag.current = { position: p.position.position, transform: p.transform }; p.select(); p.onDragging(true); },
    onPanResponderTerminationRequest: event => event.nativeEvent.touches.length >= 2,
    onPanResponderMove: (event, gesture) => {
      if (event.nativeEvent.touches.length === 1) latest.current.move(moveByViewportDelta(drag.current.position, { x: gesture.dx, y: gesture.dy }, drag.current.transform));
    },
    onPanResponderRelease: () => latest.current.onDragging(false), onPanResponderTerminate: () => latest.current.onDragging(false),
  }));
  const center = stageToViewport(props.position.position, props.transform);
  return <View {...(props.readOnly ? {} : responder.panHandlers)} pointerEvents={props.readOnly ? "none" : "auto"} accessible accessibilityRole={props.readOnly ? "text" : "button"} accessibilityState={{ selected: props.selected }} accessibilityLabel={`Shooting position ${props.index + 1}: ${props.position.label}`} onAccessibilityTap={props.readOnly ? undefined : props.select} style={{ position: 'absolute', zIndex: props.selected ? 2 : 1, left: center.x - 22, top: center.y - 22, width: 44, height: 44, borderRadius: 22, borderWidth: props.selected ? 3 : 1, borderColor: colors.accent, backgroundColor: colors.secondary, justifyContent: 'center', alignItems: 'center' }}><Text numberOfLines={2} style={{ color: colors.text, fontSize: 11 }}>{props.readOnly ? `${props.index + 1}${props.reload ? ' / R' : ''}` : `${props.index + 1}: ${props.position.label}`}</Text></View>;
}

function TargetTap(props: { label: string; selected: boolean; toggle: () => void }) {
  const latest = useRef(props); latest.current = props;
  const canceled = useRef(false);
  const [responder] = useState(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { canceled.current = false; },
    onPanResponderMove: (event, gesture) => { if (event.nativeEvent.touches.length !== 1 || Math.hypot(gesture.dx, gesture.dy) > 6) canceled.current = true; },
    onPanResponderTerminationRequest: () => true,
    onPanResponderTerminate: () => { canceled.current = true; },
    onPanResponderRelease: (_, gesture) => { if (!canceled.current && Math.hypot(gesture.dx, gesture.dy) <= 6) latest.current.toggle(); },
  }));
  return <View {...responder.panHandlers} accessible accessibilityRole="button" accessibilityLabel={props.label} accessibilityState={{ selected: props.selected }} onAccessibilityTap={props.toggle} style={{ width: 44, height: 44, borderRadius: 22, borderWidth: props.selected ? 3 : 1, borderColor: props.selected ? colors.accent : '#52858e', backgroundColor: props.selected ? '#58d5e033' : 'transparent' }} />;
}
