import { connectionPoints, setConnection, clampRoutePoint } from '../planning/routeGeometry';
import { Pressable } from 'react-native';
import { defaultRouteLayers, showTargetArrows } from './routePresentation';
import type { RouteLayers } from './routePresentation';
import { colors } from '../ui/tokens';
import { useEffect, useRef, useState } from 'react';
import { PanResponder, View, Text } from 'react-native';
import { stageToViewport, moveByViewportDelta } from '../stage/coordinates';
import type { ViewportTransform, StagePosition } from '../stage/coordinates';
import type { StageDocument } from '../stage/model';
import type { StageRoute, ShootingPosition } from '../planning/route';
import { movePosition } from '../planning/route';
import { isEngageable, targetLabel } from '../planning/model';
import { engagementLabel } from '../planning/engagements';
import EngagementOverlay from './EngagementOverlay';

export type RouteOverlayProps = { layers?: RouteLayers; editing?: boolean; selectedNodeId?: string | null; onNodeSelect?: (id: string, nodeId: string) => void; preview?: boolean; highlightedSegmentId?: string; assignmentMode?: 'visible' | 'engaged' | null; onTargetTap?: (id: string) => void; route: StageRoute; selectedId: string | null; onSelect: (id: string) => void; onChange: (route: StageRoute) => void; onDragging: (value: boolean) => void };
export default function RouteOverlay(props: RouteOverlayProps & { stage: StageDocument; transform: ViewportTransform }) {
  const { stage, transform, route } = props;
  const layers = props.layers ?? defaultRouteLayers;
  const selected = route.positions.find(p => p.id === props.selectedId);
  const start = stage.objects.find(o => o.type === 'start');
  return <>
    {(route.engagementRules ? [] : route.positions.filter(p => showTargetArrows(layers, p.id, props.selectedId))).flatMap(position => stage.objects.filter(t => isEngageable(t) && position.engagedTargetIds.includes(t.id)).map(target => {
      const a = stageToViewport(position.position, transform), b = stageToViewport(target.position, transform);
      const engaged = position.engagedTargetIds.includes(target.id), length = Math.hypot(b.x - a.x, b.y - a.y);
      const color = engaged ? colors.accent : '#52858e';
      return <View key={'connection-' + position.id + '-' + target.id} pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0 }}>
        <View style={{ position: 'absolute', left: (a.x + b.x) / 2 - length / 2, top: (a.y + b.y) / 2, width: length, height: props.preview ? 1 : engaged ? 2 : 1, backgroundColor: color, transform: [{ rotate: Math.atan2(b.y - a.y, b.x - a.x) + 'rad' }] }} />
        <Text style={{ position: 'absolute', left: (a.x + b.x) / 2, top: (a.y + b.y) / 2 - 12, color, backgroundColor: colors.background }}>{engagementLabel(position.engagedTargetIds.indexOf(target.id))}</Text>
        {length > 20 && <View style={{ position: 'absolute', left: b.x - 12 * (b.x - a.x) / length - 4, top: b.y - 12 * (b.y - a.y) / length - 4, width: 8, height: 8, borderTopWidth: 2, borderRightWidth: 2, borderColor: color, transform: [{ rotate: (Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 4) + 'rad' }] }} />}
        <View style={{ position: 'absolute', left: b.x - 5, top: b.y - 5, width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: color, backgroundColor: engaged ? colors.accent : colors.background }} />
      </View>;
    }))}
    {layers.path && route.positions.map((destination, index) => {
      const origin = index ? route.positions[index-1] : start;
      if (!origin) return null;
      const connection = route.connections?.find(c => c.fromId === origin.id && c.toId === destination.id) ?? { fromId: origin.id, toId: destination.id, style: 'STRAIGHT' as const, bends: [] };
      const samples = connectionPoints(route, origin.id, destination.id, origin.position, destination.position);
      const controls = [origin.position, ...connection.bends.map(b => b.position), destination.position];
      const highlighted = props.highlightedSegmentId === destination.id;
      const movingReload = props.preview && route.reloads.some(r => r.positionId === destination.id && (r.mode ?? 'moving') === 'moving');
      const selectedSection = props.editing && !props.preview && destination.id === props.selectedId;
      return <View key={destination.id} pointerEvents="box-none" style={{ zIndex: selectedSection ? 3 : 0, position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' }}>
        {samples.slice(1).map((point, i) => {
          const a = stageToViewport(samples[i], transform), b = stageToViewport(point, transform), length = Math.hypot(b.x-a.x,b.y-a.y);
          return <View key={i} pointerEvents="none" style={{ position:'absolute', left:(a.x+b.x)/2-length/2, top:(a.y+b.y)/2-1.5, width:length, height:highlighted ? 6 : movingReload ? 4 : 3, backgroundColor:movingReload ? colors.text : colors.accent, transform:[{rotate:Math.atan2(b.y-a.y,b.x-a.x)+'rad'}] }} />;
        })}
        {selectedSection && controls.slice(1).map((point,i) => {
          const previous=controls[i], middle={space:'stage' as const,x:(previous.x+point.x)/2,y:(previous.y+point.y)/2,z:0}, center=stageToViewport(middle,transform);
          return <Pressable key={'add-'+i} accessibilityRole="button" accessibilityLabel={'Add bend on connection to waypoint '+(index+1)+' section '+(i+1)} onPress={() => {
            const bends=[...connection.bends]; bends.splice(i,0,{id:'bend-'+Date.now()+'-'+i,position:middle}); props.onChange(setConnection(route,{...connection,bends}));
          }} style={{position:'absolute',left:center.x-22,top:center.y-22,width:44,height:44,alignItems:'center',justifyContent:'center'}}><Text style={{color:colors.accent,backgroundColor:colors.background}}>+</Text></Pressable>;
        })}
        {selectedSection && connection.bends.map((bend,i) => <Marker key={bend.id} bend editing position={{id:bend.id,label:'Bend',position:bend.position,visibleTargetIds:[],engagedTargetIds:[]}} index={i} transform={transform} selected={false} select={() => {}} onDragging={props.onDragging} move={position => props.onChange(setConnection(route,{...connection,bends:connection.bends.map(b=>b.id===bend.id?{...b,position:clampRoutePoint(position,stage.stage)}:b)}))} />)}
      </View>;
    })}
    {layers.path && start && <Text pointerEvents="none" style={{ position: 'absolute', left: stageToViewport(start.position, transform).x + 12, top: stageToViewport(start.position, transform).y, color: colors.accent, backgroundColor: colors.background, fontSize: 11 }}>START</Text>}
    {layers.waypoints && !props.assignmentMode && route.positions.map((p, index) => <Marker key={p.id} pathOnly={!!route.engagementRules} position={p} index={index} transform={transform} editing={props.editing ?? !props.preview} readOnly={props.preview} reload={props.preview && route.reloads.some(r => r.positionId === p.id)} selected={p.id === props.selectedId} select={() => props.onSelect(p.id)} onDragging={props.onDragging} move={position => props.onChange(movePosition(route, p.id, position, stage.stage))} />)}
    {!!route.engagementRules && <EngagementOverlay stage={stage} route={route} transform={transform} layers={layers} selectedId={props.selectedId} selectedNodeId={props.selectedNodeId} onSelect={props.preview ? undefined : props.onNodeSelect} />}
    {!props.preview && (layers.targetIds || props.assignmentMode) && stage.objects.filter(isEngageable).map(target => {
      const point = stageToViewport(target.position, transform), visible = !!selected?.visibleTargetIds.includes(target.id), engaged = !!selected?.engagedTargetIds.includes(target.id);
      return <View key={target.id} pointerEvents="box-none" style={{ position: 'absolute', left: point.x - 22, top: point.y - 22, width: 44, height: 44 }}>
        <Text pointerEvents="none" style={{ position: 'absolute', left: 36, top: 0, width: 100, color: colors.accent, backgroundColor: colors.background, fontSize: 11 }}>{targetLabel(stage, target.id)}</Text>
        {props.assignmentMode && <TargetTap label={targetLabel(stage, target.id) + ': ' + props.assignmentMode} selected={props.assignmentMode === 'visible' ? visible : engaged} toggle={() => props.onTargetTap?.(target.id)} />}
      </View>;
    })}
    {props.assignmentMode && selected && <Text pointerEvents="none" style={{ position: 'absolute', left: stageToViewport(selected.position, transform).x - 16, top: stageToViewport(selected.position, transform).y - 10, color: colors.accent, backgroundColor: colors.background }}>{selected.label}</Text>}
  </>;
}
export function Marker(props: { bend?: boolean; editing: boolean; pathOnly?: boolean; readOnly?: boolean; reload?: boolean; position: ShootingPosition; index: number; transform: ViewportTransform; selected: boolean; select: () => void; onDragging: (value: boolean) => void; move: (position: StagePosition) => void }) {
  const latest = useRef(props); latest.current = props;
  const drag = useRef({ position: props.position.position, transform: props.transform });
  const active = useRef(false);
  const interrupted = useRef(false);
  useEffect(() => () => { if (active.current) latest.current.onDragging(false); }, []);
  const [responder] = useState(() => PanResponder.create({
    onStartShouldSetPanResponder: event => event.nativeEvent.touches.length === 1,
    onPanResponderGrant: () => { const p = latest.current; active.current = false; interrupted.current = false; drag.current = { position: p.position.position, transform: p.transform }; p.select(); },
    onPanResponderTerminationRequest: event => event.nativeEvent.touches.length >= 2,
    onPanResponderMove: (event, gesture) => {
      if (event.nativeEvent.touches.length !== 1) interrupted.current = true;
      if (!active.current && !interrupted.current && latest.current.editing && Math.hypot(gesture.dx, gesture.dy) > 6) { active.current = true; latest.current.onDragging(true); }
      if (active.current && !interrupted.current) latest.current.move(moveByViewportDelta(drag.current.position, { x: gesture.dx, y: gesture.dy }, drag.current.transform));
    },
    onPanResponderRelease: () => { active.current = false; latest.current.onDragging(false); }, onPanResponderTerminate: () => { interrupted.current = true; active.current = false; latest.current.onDragging(false); },
  }));
  const center = stageToViewport(props.position.position, props.transform);
  return <View {...(props.readOnly ? {} : responder.panHandlers)} pointerEvents={props.readOnly ? "none" : "auto"} accessible accessibilityRole={props.readOnly ? "text" : "button"} accessibilityState={{ selected: props.selected }} accessibilityLabel={`${props.bend ? 'Bend handle' : 'Route waypoint'} ${props.index + 1}: ${props.position.label}`} onAccessibilityTap={props.readOnly ? undefined : props.select} accessibilityValue={{ text: `X ${props.position.position.x.toFixed(1)}, Y ${props.position.position.y.toFixed(1)}` }} accessibilityActions={props.editing ? [{ name: "left", label: "Move left" }, { name: "right", label: "Move right" }, { name: "up", label: "Move up" }, { name: "down", label: "Move down" }] : []} onAccessibilityAction={({ nativeEvent }) => { if (!props.editing || props.readOnly) return; const name = nativeEvent.actionName; if (["left", "right", "up", "down"].includes(name)) props.move({ ...props.position.position, x: props.position.position.x + (name === "left" ? -1 : name === "right" ? 1 : 0), y: props.position.position.y + (name === "up" ? -1 : name === "down" ? 1 : 0) }); }} style={{ position: 'absolute', zIndex: props.selected ? 2 : 1, left: center.x - 22, top: center.y - 22, width: 44, height: 44, borderRadius: props.bend ? 5 : props.pathOnly ? 4 : 22, borderWidth: props.selected ? 3 : props.pathOnly ? 0 : 1, borderColor: colors.accent, backgroundColor: props.pathOnly ? 'transparent' : colors.secondary, justifyContent: 'center', alignItems: 'center' }}><Text numberOfLines={2} style={{ color: colors.text, fontSize: 11, ...(props.pathOnly ? { position: 'absolute', left: 0, top: 0 } : {}) }}>{props.bend ? '\u25c6' : props.pathOnly ? `${props.index + 1}` : props.readOnly ? `${props.index + 1}${props.reload ? ' / R' : ''}` : `${props.index + 1}: ${props.position.label}`}</Text></View>;
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
