import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import type { ViewportTransform } from '@/stage/coordinates';
import { stageToViewport } from '@/stage/coordinates';
import type { FiringArea } from '../planning/engagements';
import { centroid } from '../planning/firingAreaEditing';
import type { Point } from '../planning/firingAreaEditing';
import { colors } from '../ui/tokens';
import { useThemeMode } from '../ui/theme';

export type FiringAreaOverlayProps = {
  areas: readonly FiringArea[];
  /** Corners of the area being drawn, in order. */
  draft: readonly Point[] | null;
  selectedId: string | null;
  /** Corner handles on the selected area (area mode only). */
  editing: boolean;
  onMoveCorner?: (areaId: string, index: number, point: Point) => void;
  onDragging?: (dragging: boolean) => void;
};

const at = (p: Point, t: ViewportTransform) => stageToViewport({ space: 'stage', x: p.x, y: p.y, z: 0 }, t);

/** One straight edge drawn as a thin rotated bar (crisp at every zoom, unlike a scaled image stroke). */
function Edge({ a, b, colour, width }: { a: { x: number; y: number }; b: { x: number; y: number }; colour: string; width: number }) {
  const length = Math.hypot(b.x - a.x, b.y - a.y), angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
  return <View pointerEvents="none" style={{ position: 'absolute', left: (a.x + b.x) / 2 - length / 2, top: (a.y + b.y) / 2 - width / 2, width: Math.max(1, length), height: width, backgroundColor: colour, transform: [{ rotate: angle + 'deg' }] }} />;
}

/** The area's fill as an SVG in stage inches, stretched over its bounding box (re-encoded only when corners change). */
function fillUri(vertices: readonly Point[], colour: string, opacity: number) {
  const xs = vertices.map(v => v.x), ys = vertices.map(v => v.y), minX = Math.min(...xs), minY = Math.min(...ys);
  const w = Math.max(1e-3, Math.max(...xs) - minX), h = Math.max(1e-3, Math.max(...ys) - minY);
  const points = vertices.map(v => `${(v.x - minX).toFixed(2)},${(v.y - minY).toFixed(2)}`).join(' ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(2)} ${h.toFixed(2)}" preserveAspectRatio="none"><polygon points="${points}" fill="${colour}" fill-opacity="${opacity}"/></svg>`;
  return { uri: 'data:image/svg+xml;base64,' + btoa(svg), minX, minY, w, h };
}

function Corner({ areaId, index, point, transform, onMove, onDragging }: { areaId: string; index: number; point: Point; transform: ViewportTransform;
  onMove: (areaId: string, index: number, point: Point) => void; onDragging?: (dragging: boolean) => void }) {
  const latest = useRef({ point, transform, onMove, onDragging }); latest.current = { point, transform, onMove, onDragging };
  const start = useRef(point);
  const [responder] = useState(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { start.current = latest.current.point; latest.current.onDragging?.(true); },
    onPanResponderMove: (_, g) => {
      const s = latest.current.transform.scale;
      latest.current.onMove(areaId, index, { x: start.current.x + g.dx / s, y: start.current.y + g.dy / s });
    },
    onPanResponderRelease: () => latest.current.onDragging?.(false),
    onPanResponderTerminate: () => latest.current.onDragging?.(false),
    onPanResponderTerminationRequest: () => false,
  }));
  const p = at(point, transform);
  return <View {...responder.panHandlers} accessibilityRole="adjustable" accessibilityLabel={`Corner ${index + 1}, drag to move`}
    style={{ position: 'absolute', left: p.x - 22, top: p.y - 22, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.movement }} />
  </View>;
}

/** Firing areas on the plan: where shooting positions may be planned. Tinted fill, edges, a label; corners when editing. */
export default function FiringAreaOverlay({ areas, draft, selectedId, editing, onMoveCorner, onDragging, transform }: FiringAreaOverlayProps & { transform: ViewportTransform }) {
  useThemeMode();
  const colour = colors.movement;
  return <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
    {areas.map((area, n) => {
      if (area.vertices.length < 3) return null;
      const selected = area.id === selectedId, fill = fillUri(area.vertices, colour, selected ? 0.22 : 0.12);
      const topLeft = at({ x: fill.minX, y: fill.minY }, transform), c = at(centroid(area.vertices), transform);
      return <View key={area.id} pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <Image pointerEvents="none" source={{ uri: fill.uri }} cachePolicy="none" transition={0} contentFit="fill"
          style={{ position: 'absolute', left: topLeft.x, top: topLeft.y, width: fill.w * transform.scale, height: fill.h * transform.scale }} />
        {area.vertices.map((v, i) => <Edge key={i} a={at(v, transform)} b={at(area.vertices[(i + 1) % area.vertices.length], transform)} colour={colour} width={selected ? 3 : 2} />)}
        <Text pointerEvents="none" style={{ position: 'absolute', left: c.x - 40, top: c.y - 9, width: 80, textAlign: 'center', fontSize: 12, fontWeight: '700', color: colour }}>{'AREA ' + (n + 1)}</Text>
        {editing && selected && onMoveCorner && area.vertices.map((v, i) => <Corner key={'c' + i} areaId={area.id} index={i} point={v} transform={transform} onMove={onMoveCorner} onDragging={onDragging} />)}
      </View>;
    })}
    {draft && draft.length > 0 && <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {draft.slice(1).map((v, i) => <Edge key={i} a={at(draft[i], transform)} b={at(v, transform)} colour={colors.handle} width={3} />)}
      {draft.length >= 3 && <Edge a={at(draft[draft.length - 1], transform)} b={at(draft[0], transform)} colour={colors.handle} width={1} />}
      {draft.map((v, i) => { const p = at(v, transform); return <View key={'d' + i} style={{ position: 'absolute', left: p.x - 7, top: p.y - 7, width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: colors.ink, backgroundColor: i === 0 ? colors.handle : colors.panel }} />; })}
    </View>}
  </View>;
}
