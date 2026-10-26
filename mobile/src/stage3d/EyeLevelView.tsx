import { useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, Text, View } from 'react-native';
import type { StageDocument } from '../stage/model';
import type { StagePlan } from '../planning/model';
import { formatYardsFixed } from '../stage/measurements';
import { borders, colors, palette, spacing, touch, typography } from '../ui/tokens';
import { readPref, writePref } from '../ui/prefsStore';
import { buildScene, rgb } from './scene';
import { cameraMatrices, eyeAt, eyeLook } from './camera';
import { projectToScreen } from './math';
import GLStage, { glUnavailable } from './GLStage';
import { buildWalk, sightStage, suggestedHeading, targetStatuses, walkPoint } from './walk';
import type { TargetState } from './walk';

const EYE_KEY = 'psp.eyeHeight', DEFAULT_EYE = 63, EYE_LIMITS = [36, 84] as const;
const feet = (inches: number) => `${Math.floor(inches / 12)} ft ${Math.round(inches % 12)} in`;
const STATE_TEXT: Record<TargetState, string> = { moving: 'ON THE MOVE', here: 'FROM HERE', legal: 'LEGAL', visible: 'VISIBLE', hidden: 'HIDDEN', done: 'DONE' };

/**
 * Eye-level walk-through of the planned route: stand at the start or any stop, or scrub along the path, and see what
 * the plan engages there (on the move or standing) and what else is legal, visible or hidden from that spot.
 */
export default function EyeLevelView({ stage, plan, onExit }: { stage: StageDocument; plan: StagePlan; onExit: () => void }) {
  const scheme = palette();
  const walk = useMemo(() => buildWalk(stage, plan.route), [stage, plan.route]);
  const sight = useMemo(() => sightStage(stage, plan), [stage, plan]);
  const [distance, setDistance] = useState(0);
  const [look, setLook] = useState({ heading: 0, pitch: -4 });
  const [eyeHeight, setEyeHeightState] = useState(() => { const v = Number(readPref(EYE_KEY)); return v >= EYE_LIMITS[0] && v <= EYE_LIMITS[1] ? v : DEFAULT_EYE; });
  const setEyeHeight = (v: number) => { const next = Math.min(EYE_LIMITS[1], Math.max(EYE_LIMITS[0], v)); setEyeHeightState(next); writePref(EYE_KEY, String(next)); };
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [error, setError] = useState(glUnavailable());

  const at = walkPoint(walk, distance);
  const statuses = useMemo(() => targetStatuses(stage, plan, walk, at, sight ?? null), [stage, plan, walk, at.distance, sight]);
  const heading = suggestedHeading(stage, walk, at, statuses) + look.heading;
  const tints = useMemo(() => {
    const tone: Partial<Record<TargetState, string>> = { moving: scheme.movement, here: scheme.accent, legal: scheme.caution, done: scheme.subdued };
    return Object.fromEntries(statuses.flatMap(s => tone[s.state] ? [[s.targetId, tone[s.state]!]] : []));
  }, [statuses, scheme]);
  const route = useMemo(() => ({ path: walk.path, windows: walk.windows.map(w => w.path), stops: walk.stops.slice(1) }), [walk]);
  const scene = useMemo(() => buildScene(stage, scheme, { route, tints, grid: false }), [stage, scheme, route, tints]);
  const camera = eyeAt(at.point, eyeHeight, heading, look.pitch);
  const aspect = size.height > 0 ? size.width / size.height : 1;
  const matrices = useMemo(() => cameraMatrices(camera, aspect, scene.bounds.radius), [camera.position[0], camera.position[1], camera.position[2], camera.heading, camera.pitch, aspect, scene.bounds.radius]);
  const clear = useMemo(() => rgb(scheme.sky), [scheme]);

  const lookRef = useRef({ x: 0, y: 0 });
  const [looker] = useState(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true, onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (_, g) => { lookRef.current = { x: g.dx, y: g.dy }; },
    onPanResponderMove: (_, g) => {
      const dx = g.dx - lookRef.current.x, dy = g.dy - lookRef.current.y; lookRef.current = { x: g.dx, y: g.dy };
      setLook(l => { const c = eyeLook({ kind: 'eye', position: [0, 0, 0], heading: l.heading, pitch: l.pitch }, dx, dy); return { heading: c.heading > 180 ? c.heading - 360 : c.heading, pitch: c.pitch }; });
    },
  }));
  const track = useRef({ width: 0, x: 0 }), trackView = useRef<View>(null);
  const scrubTo = (pageX: number) => { const t = track.current; if (t.width > 0) setDistance(Math.max(0, Math.min(1, (pageX - t.x) / t.width)) * walk.length); };
  const [scrubber] = useState(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true, onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: e => scrubTo(e.nativeEvent.pageX), onPanResponderMove: e => scrubTo(e.nativeEvent.pageX),
  }));
  const step = (inches: number) => setDistance(d => Math.max(0, Math.min(walk.length, d + inches)));
  const jump = (d: number) => { setDistance(d); setLook({ heading: 0, pitch: -4 }); };

  const nextStop = walk.stops.find(s => s.distance > at.distance + 0.5);
  const title = at.stop ? `VIEW FROM ${at.stop.label}` : nextStop ? `WALKING TO ${nextStop.label} · ${formatYardsFixed(nextStop.distance - at.distance, 1)}` : 'VIEW';
  const tone = (s: TargetState) => s === 'moving' ? colors.movement : s === 'here' ? colors.accent : s === 'legal' ? colors.warning : s === 'done' ? colors.subdued : colors.muted;
  const labels = size.width > 0 ? scene.labels.filter(l => l.kind !== 'start').map(l => ({ ...l, screen: projectToScreen(matrices.viewProj, l.at, size.width, size.height) }))
    .filter(l => l.screen && l.screen.depth < 1 && l.screen.x > -40 && l.screen.x < size.width + 40 && l.screen.y > -20 && l.screen.y < size.height + 20) : [];
  const stateOf = new Map(statuses.map(s => [s.targetId, s.state]));
  const button = (label: string, text: string, action: () => void, disabled = false) =>
    <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={action}
      style={({ pressed }) => ({ minWidth: touch.min, minHeight: touch.min, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', borderWidth: borders.regular, borderColor: colors.border, backgroundColor: colors.panel, opacity: disabled ? 0.4 : pressed ? 0.65 : 1 })}>
      <Text style={{ ...typography.label, color: colors.text }}>{text}</Text></Pressable>;

  return <View style={{ flex: 1, backgroundColor: colors.background }} testID="eye-level">
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: 6 }}>
      <View style={{ flexShrink: 1 }}>
        <Text accessibilityRole="header" style={{ ...typography.section, color: colors.text }}>{title}</Text>
        <Text style={{ ...typography.category, color: colors.muted }}>{'EYE HEIGHT ' + feet(eyeHeight).toUpperCase()}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {button('Lower eye height', '−', () => setEyeHeight(eyeHeight - 1), eyeHeight <= EYE_LIMITS[0])}
        {button('Raise eye height', '+', () => setEyeHeight(eyeHeight + 1), eyeHeight >= EYE_LIMITS[1])}
      </View>
    </View>
    <View style={{ flex: 1, minHeight: 160, overflow: 'hidden', backgroundColor: colors.sky }} onLayout={({ nativeEvent }) => setSize({ width: nativeEvent.layout.width, height: nativeEvent.layout.height })}>
      {error ? <Text accessibilityLiveRegion="polite" style={{ ...typography.body, color: colors.text, padding: 12 }}>{'The eye-level view needs 3D, which could not start on this device. ' + (glUnavailable() ? 'It needs the next app update.' : '')}</Text>
        : size.width > 0 && <View key={Math.round(size.width) + 'x' + Math.round(size.height)} style={{ flex: 1 }} pointerEvents="none">
          <GLStage scene={scene} viewProj={matrices.viewProj} clear={clear} onError={setError} /></View>}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}>
        {labels.map(l => { const state = stateOf.get(l.id); return <Text key={l.id + l.kind} style={{ position: 'absolute', left: l.screen!.x - 30, top: l.screen!.y - 12, width: 60, textAlign: 'center',
          ...typography.category, fontSize: 12, lineHeight: 15, color: state === 'moving' || state === 'here' ? colors.onAccent : colors.text,
          backgroundColor: state === 'moving' ? colors.movement : state === 'here' ? colors.accent : colors.panel }}>{l.text}</Text>; })}
      </View>
      <View {...looker.panHandlers} accessible accessibilityLabel="Eye-level view. Drag to look around." style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }} />
      <View style={{ position: 'absolute', right: 8, top: 8, flexDirection: 'row', gap: 6 }}>
        {(look.heading !== 0 || look.pitch !== -4) && button('Look at the planned targets again', 'RE-AIM', () => setLook({ heading: 0, pitch: -4 }))}
        {button('Back to the plan', '2D', onExit)}
      </View>
    </View>
    {walk.length > 0 && <View style={{ paddingHorizontal: spacing.sm, paddingTop: spacing.sm, gap: 6 }}>
      <View ref={trackView} {...scrubber.panHandlers} accessible accessibilityRole="adjustable" accessibilityLabel="Position along the route"
        accessibilityValue={{ text: formatYardsFixed(at.distance, 1) + ' of ' + formatYardsFixed(walk.length, 1) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={e => step(e.nativeEvent.actionName === 'increment' ? 36 : -36)}
        onLayout={({ nativeEvent }) => { track.current.width = nativeEvent.layout.width; trackView.current?.measureInWindow(x => { track.current.x = x; }); }}
        style={{ height: 36, justifyContent: 'center' }}>
        <View style={{ height: 6, backgroundColor: colors.gridMinor }} />
        {walk.windows.map(w => <View key={w.targetId} pointerEvents="none" style={{ position: 'absolute', top: 12, height: 12, left: `${w.from / walk.length * 100}%`, width: `${Math.max(0.5, (w.to - w.from) / walk.length * 100)}%`, backgroundColor: colors.movement, opacity: 0.85 }} />)}
        {walk.stops.map(s => <View key={s.id} pointerEvents="none" style={{ position: 'absolute', top: 6, height: 24, width: 3, marginLeft: -1.5, left: `${s.distance / walk.length * 100}%`, backgroundColor: colors.ink }} />)}
        <View pointerEvents="none" style={{ position: 'absolute', top: 2, width: 20, height: 32, marginLeft: -10, left: `${at.distance / walk.length * 100}%`, backgroundColor: colors.accent, borderWidth: borders.regular, borderColor: colors.border }} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {button('Step back one yard', '◀', () => step(-36), at.distance <= 0)}
        {walk.stops.map(s => <Pressable key={s.id} accessibilityRole="button" accessibilityLabel={'View from ' + s.label} accessibilityState={{ selected: at.stop?.id === s.id }} onPress={() => jump(s.distance)}
          style={({ pressed }) => ({ minHeight: touch.min, minWidth: touch.min, paddingHorizontal: 12, justifyContent: 'center', borderWidth: borders.regular, borderColor: colors.border, backgroundColor: at.stop?.id === s.id ? colors.text : colors.panel, opacity: pressed ? 0.65 : 1 })}>
          <Text style={{ ...typography.label, color: at.stop?.id === s.id ? colors.background : colors.text }}>{s.label}</Text></Pressable>)}
        {button('Step forward one yard', '▶', () => step(36), at.distance >= walk.length)}
      </ScrollView>
    </View>}
    {!plan.route?.positions.length && <Text style={{ ...typography.body, color: colors.muted, paddingHorizontal: spacing.sm, paddingTop: 6 }}>No route yet: this is the view from the start. Plan a route to walk it here.</Text>}
    <ScrollView style={{ maxHeight: 190 }} contentContainerStyle={{ padding: spacing.sm, gap: 4 }}>
      {statuses.map(s => <View key={s.targetId} accessible accessibilityLabel={`${s.label}, ${STATE_TEXT[s.state].toLowerCase()}, ${s.detail}, ${s.rounds} rounds`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6, borderBottomWidth: 1, borderColor: colors.hairline, opacity: s.state === 'done' ? 0.6 : 1 }}>
        <Text style={{ ...typography.label, color: colors.text, width: 42 }}>{s.label}</Text>
        <Text style={{ ...typography.category, fontSize: 12, color: s.state === 'moving' || s.state === 'here' ? colors.onAccent : tone(s.state), backgroundColor: s.state === 'moving' ? colors.movement : s.state === 'here' ? colors.accent : 'transparent', borderWidth: 1, borderColor: tone(s.state), paddingHorizontal: 6, paddingVertical: 2, minWidth: 92, textAlign: 'center' }}>{STATE_TEXT[s.state]}</Text>
        <Text style={{ ...typography.body, fontSize: 15, lineHeight: 19, color: colors.muted, flex: 1 }}>{s.detail}{s.plannedAt && s.state !== 'moving' && s.state !== 'here' ? ` · planned ${s.plannedAt}` : ''}</Text>
        <Text style={{ ...typography.label, color: colors.text }}>{s.rounds + ' rd'}</Text>
      </View>)}
      {walk.analysis && !walk.analysis.complete && <Text style={{ ...typography.body, fontSize: 15, color: colors.warning }}>{walk.analysis.warnings[0] ?? 'The route analysis is incomplete.'}</Text>}
      <Text style={{ ...typography.body, fontSize: 14, lineHeight: 18, color: colors.subdued }}>Sight lines use the plan view and wall heights: a target seen over a low wall or past another target is marked as assumed. Check on the range.</Text>
    </ScrollView>
  </View>;
}

