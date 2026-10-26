import { useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, Pressable, Text, View } from 'react-native';
import type { GestureResponderEvent, ViewStyle } from 'react-native';
import type { StageDocument } from '../stage/model';
import type { StagePosition } from '../stage/coordinates';
import { stageDownrange } from '../stage/orientation';
import { borders, colors, palette, typography } from '../ui/tokens';
import { buildScene, pickObject, rgb } from './scene';
import type { SceneOptions } from './scene';
import { cameraMatrices, fitOrbit, orbitPan, orbitRotate, orbitZoom } from './camera';
import type { OrbitCamera } from './camera';
import { projectToScreen, rayPlaneZ, screenRay, toStage } from './math';
import GLStage, { glUnavailable } from './GLStage';
import Stage25D from '../editor/Stage25D';

type Point = { x: number; y: number };
type Gesture =
  | { kind: 'orbit'; last: Point; start: Point; time: number; moved: boolean }
  | { kind: 'move'; id: string; ground: Point; from: StagePosition; start: Point; time: number; moved: boolean }
  | { kind: 'pinch'; distance: number; center: Point };

/**
 * The stage in 3D: one finger orbits, two fingers pan and zoom, a tap selects, and a selected object can be dragged
 * along the ground. Edits go back through the editor's own handlers, so snapping, bounds and undo are the same as in
 * the 2D plan.
 */
export default function Stage3DView(props: {
  stage: StageDocument; selectedId: string | null; editable: boolean;
  onSelect: (id: string | null) => void;
  onMoveStart?: () => void; onMove?: (id: string, position: StagePosition) => void; onMoveEnd?: () => void;
  route?: SceneOptions['route']; tints?: SceneOptions['tints'];
  /** Back to the 2D plan (offered when 3D cannot run). */ onExit: () => void;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [error, setError] = useState(glUnavailable());
  const scheme = palette();
  const scene = useMemo(() => buildScene(props.stage, scheme, { selectedId: props.selectedId, route: props.route, tints: props.tints }),
    [props.stage, scheme, props.selectedId, props.route, props.tints]);
  const aspect = size.height > 0 ? size.width / size.height : 0.75;
  const [camera, setCamera] = useState<OrbitCamera>(() => fitOrbit(scene.bounds, stageDownrange(props.stage), aspect));
  const fit = () => setCamera(fitOrbit(scene.bounds, stageDownrange(props.stage), aspect));
  const matrices = useMemo(() => cameraMatrices(camera, aspect, scene.bounds.radius), [camera, aspect, scene.bounds.radius]);
  const clear = useMemo(() => rgb(scheme.sky), [scheme]);

  const frame = useRef<View>(null), origin = useRef({ x: 0, y: 0 }), gesture = useRef<Gesture | null>(null);
  const latest = useRef({ props, matrices, size, scene });
  latest.current = { props, matrices, size, scene };
  const local = (e: { pageX: number; pageY: number }): Point => ({ x: e.pageX - origin.current.x, y: e.pageY - origin.current.y });
  const ray = (p: Point) => { const { matrices: m, size: s } = latest.current; return m.inverse ? screenRay(m.inverse, p.x, p.y, s.width, s.height) : null; };
  const ground = (p: Point) => { const r = ray(p), hit = r && rayPlaneZ(r, 0); return hit ? toStage(hit) : null; };
  const pick = (p: Point) => { const r = ray(p); return r ? pickObject(latest.current.scene, r)?.objectId ?? null : null; };
  const pinch = (e: GestureResponderEvent) => {
    const [a, b] = e.nativeEvent.touches;
    return { distance: Math.hypot(b.pageX - a.pageX, b.pageY - a.pageY), center: local({ pageX: (a.pageX + b.pageX) / 2, pageY: (a.pageY + b.pageY) / 2 }) };
  };
  const [responder] = useState(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: e => {
      const p = local(e.nativeEvent), { props: current } = latest.current;
      const hit = current.editable && current.selectedId ? pick(p) : null;
      const object = hit && hit === current.selectedId ? current.stage.objects.find(o => o.id === hit) : undefined;
      const at = object && ground(p);
      if (object && at) { gesture.current = { kind: 'move', id: object.id, ground: at, from: object.position, start: p, time: Date.now(), moved: false }; current.onMoveStart?.(); }
      else gesture.current = { kind: 'orbit', last: p, start: p, time: Date.now(), moved: false };
    },
    onPanResponderMove: e => {
      const g = gesture.current;
      if (!g) return;
      if (e.nativeEvent.touches.length >= 2) {
        const now = pinch(e);
        if (g.kind === 'move') latest.current.props.onMoveEnd?.();
        if (g.kind === 'pinch') {
          setCamera(c => orbitPan(orbitZoom(c, g.distance > 0 ? now.distance / g.distance : 1), now.center.x - g.center.x, now.center.y - g.center.y, latest.current.size.height));
        }
        gesture.current = { kind: 'pinch', ...now };
        return;
      }
      if (g.kind === 'pinch') return; // lifting one finger of a pinch does not start an orbit
      const p = local(e.nativeEvent);
      if (Math.hypot(p.x - g.start.x, p.y - g.start.y) > 6) g.moved = true;
      if (g.kind === 'orbit') { const dx = p.x - g.last.x, dy = p.y - g.last.y; g.last = p; setCamera(c => orbitRotate(c, dx, dy)); return; }
      const at = ground(p);
      if (at && g.moved) latest.current.props.onMove?.(g.id, { space: 'stage', x: g.from.x + at.x - g.ground.x, y: g.from.y + at.y - g.ground.y, z: g.from.z });
    },
    onPanResponderRelease: e => {
      const g = gesture.current; gesture.current = null;
      if (!g || g.kind === 'pinch') return;
      if (g.kind === 'move') { latest.current.props.onMoveEnd?.(); if (g.moved) return; }
      if (!g.moved && Date.now() - g.time < 500) latest.current.props.onSelect(pick(local(e.nativeEvent)));
    },
    onPanResponderTerminate: () => { if (gesture.current?.kind === 'move') latest.current.props.onMoveEnd?.(); gesture.current = null; },
  }));

  if (error) return <View style={{ flex: 1, gap: 8 }}>
    <Text accessibilityLiveRegion="polite" style={{ ...typography.body, color: colors.text, padding: 12, borderWidth: borders.regular, borderColor: colors.caution, backgroundColor: colors.panel }}>
      {'3D could not start on this device. ' + (glUnavailable() ? 'It needs the next app update.' : 'Showing the older preview.')}</Text>
    <Stage25D stage={props.stage} selectedId={props.selectedId} back={props.onExit} />
  </View>;

  const labels = size.width > 0 ? scene.labels.map(l => ({ ...l, screen: projectToScreen(matrices.viewProj, l.at, size.width, size.height) }))
    .filter(l => l.screen && l.screen.depth < 1 && l.screen.x > -40 && l.screen.x < size.width + 40 && l.screen.y > -20 && l.screen.y < size.height + 20) : [];
  return <View ref={frame} style={{ flex: 1, overflow: 'hidden', backgroundColor: colors.sky }} testID="stage-3d"
    onLayout={({ nativeEvent }) => {
      const next = { width: nativeEvent.layout.width, height: nativeEvent.layout.height };
      if (!size.width) setCamera(fitOrbit(scene.bounds, stageDownrange(props.stage), next.height > 0 ? next.width / next.height : 0.75));
      setSize(next);
      frame.current?.measureInWindow((x, y) => { origin.current = { x, y }; });
    }}>
    {size.width > 0 && <View key={Math.round(size.width) + 'x' + Math.round(size.height)} style={{ flex: 1 }} pointerEvents="none">
      <GLStage scene={scene} viewProj={matrices.viewProj} clear={clear} onError={setError} />
    </View>}
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}>
      {labels.map(l => <Text key={l.id + l.kind} style={{ position: 'absolute', left: l.screen!.x - 30, top: l.screen!.y - 12, width: 60, textAlign: 'center',
        ...typography.category, fontSize: 12, lineHeight: 15, color: l.id === props.selectedId ? colors.onAccent : colors.text,
        backgroundColor: l.id === props.selectedId ? colors.accent : l.kind === 'stop' ? colors.panel : 'transparent' }}>{l.text}</Text>)}
    </View>
    <View {...responder.panHandlers} accessible accessibilityRole="adjustable" accessibilityLabel="3D stage. Drag to orbit, pinch to zoom, tap to select."
      style={[{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }, Platform.OS === 'web' && ({ touchAction: 'none' } as ViewStyle)]} />
    {!props.selectedId && <Text pointerEvents="none" style={{ position: 'absolute', left: 8, right: 8, bottom: 8, textAlign: 'center', ...typography.category, color: colors.muted }}>
      {props.editable ? 'DRAG TO ORBIT · PINCH TO ZOOM · TAP TO SELECT' : 'DRAG TO ORBIT · PINCH TO ZOOM'}</Text>}
    <View style={{ position: 'absolute', right: 8, top: 8, flexDirection: 'row', gap: 6 }}>
      {[{ label: 'Zoom out', text: '−', action: () => setCamera(c => orbitZoom(c, 1 / 1.25)) }, { label: 'Zoom in', text: '+', action: () => setCamera(c => orbitZoom(c, 1.25)) },
        { label: 'Fit the stage', text: 'FIT', action: fit }].map(b =>
        <Pressable key={b.label} accessibilityRole="button" accessibilityLabel={b.label} onPress={b.action}
          style={({ pressed }) => ({ minWidth: 48, minHeight: 48, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel, borderWidth: borders.regular, borderColor: colors.border, opacity: pressed ? 0.65 : 1 })}>
          <Text style={{ ...typography.label, color: colors.text }}>{b.text}</Text></Pressable>)}
    </View>
  </View>;
}
