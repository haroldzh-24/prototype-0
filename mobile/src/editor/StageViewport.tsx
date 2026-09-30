import { colors } from '../ui/tokens';
import { useEffect, useRef, useState } from 'react';
import { PanResponder, Platform, StyleSheet, View } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import { advanceViewport, sampleTouches } from './viewportGestures';
import type { TouchSample } from './viewportGestures';
import { viewportToStage, stageToViewport } from '../stage/coordinates';
import GeometryControls from './GeometryControls';
import { startTap, trackTap, deliberateTap } from './designerTools';
import type { DesignerTool } from './designerTools';
import { createViewportTransform } from '@/stage/coordinates';
import type { StagePosition, ViewportState } from '@/stage/coordinates';
import type { StageDocument } from '@/stage/model';
import type { SnapSettings, SnapFeedback } from '@/stage/snapping';
import DraggableObject from './DraggableObject';
import StageGrid from './StageGrid';
import SnapGuides from './SnapGuides';
import RouteOverlay from './RouteOverlay';
import AutoPositionOverlay from './AutoPositionOverlay';
import type { DiscoveredPosition } from '../planning/positionDiscovery';
import type { RouteOverlayProps } from './RouteOverlay';

type Props = {
  tool?: DesignerTool;
  draft?: { start: StagePosition; end: StagePosition } | null;
  onPlace?: (point: StagePosition) => void;
  onDraw?: (phase: 'start' | 'preview' | 'commit' | 'cancel', point: StagePosition) => void;
  focusPosition?: StagePosition | null;
  autoPositions?: readonly DiscoveredPosition[];
  routePlanning?: RouteOverlayProps;
  routeEditing: boolean;
  readOnly?: boolean;
  gridVisible: boolean;
  onViewportChange: (viewport: ViewportState) => void;
  stage: StageDocument;
  viewport: ViewportState;
  snapping: SnapSettings;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onDragging: (dragging: boolean) => void;
  setStage: React.Dispatch<React.SetStateAction<StageDocument>>;
};

export default function StageViewport(props: Props) {
  const [feedback, setFeedback] = useState<SnapFeedback>({ guides: [], gridAxes: [] });
  const [size, setSize] = useState({ width: 0, height: 0 });
  const frame = useRef<View>(null);
  const origin = useRef({ x: 0, y: 0 });
  const latest = useRef({ props, size }); latest.current = { props, size };
  useEffect(() => {
    if (!props.focusPosition || size.width <= 0 || size.height <= 0) return;
    const current = latest.current.props;
    const t = createViewportTransform(current.stage.stage, size, current.viewport);
    current.onViewportChange({ ...current.viewport, pan: {
      x: (current.stage.stage.width / 2 - props.focusPosition.x) * t.scale,
      y: (current.stage.stage.depth / 2 - props.focusPosition.y) * t.scale,
    } });
  }, [props.focusPosition, size.width, size.height]);
  const previous = useRef<TouchSample | null>(null);
  const moving = useRef(false);
  const intent = useRef(startTap(0, 0));
  const hadAnchor = useRef(false);
  const drawing = () => { const p = latest.current.props; return !p.readOnly && !p.routeEditing && (p.tool === 'wall' || p.tool === 'faultLine'); };
  const pointAt = (event: GestureResponderEvent) => {
    const touch = event.nativeEvent.changedTouches?.[0] ?? event.nativeEvent;
    const { props: p, size } = latest.current;
    return viewportToStage({ space: 'viewport', x: touch.pageX-origin.current.x, y: touch.pageY-origin.current.y }, createViewportTransform(p.stage.stage, size, gestureViewport.current));
  };
  const gestureViewport = useRef(props.viewport);
  const read = (event: GestureResponderEvent) => sampleTouches(event.nativeEvent.touches.map(t => ({
    x: t.pageX - origin.current.x, y: t.pageY - origin.current.y,
  })));
  const finish = () => {
    previous.current = null;
    latest.current.props.onDragging(false);
  };
  const [responder] = useState(() => PanResponder.create({
    // Children own single-finger object/marker drags. Capture only a pinch.
    onStartShouldSetPanResponderCapture: e => e.nativeEvent.touches.length >= 2,
    onMoveShouldSetPanResponderCapture: e => e.nativeEvent.touches.length >= 2,
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: e => {
      gestureViewport.current = latest.current.props.viewport;
      previous.current = read(e); moving.current = previous.current.count > 1;
      intent.current = startTap(previous.current.count, Date.now());
      hadAnchor.current = !!latest.current.props.draft;
      if (drawing() && !intent.current.multiple) latest.current.props.onDraw?.('start', pointAt(e));
      latest.current.props.onDragging(true);
    },
    onPanResponderStart: e => {
      previous.current = read(e);
      intent.current = trackTap(intent.current, previous.current.count, 0, 0);
      if (intent.current.multiple && drawing()) latest.current.props.onDraw?.('cancel', pointAt(e));
    },
    onPanResponderMove: (e, gesture) => {
      const next = read(e);
      if (Math.hypot(gesture.dx, gesture.dy) > 3 || next.count > 1) moving.current = true;
      intent.current = trackTap(intent.current, next.count, gesture.dx, gesture.dy);
      if (drawing() && !intent.current.multiple) {
        latest.current.props.onDraw?.('preview', pointAt(e)); previous.current = next; return;
      }
      if (previous.current) {
        gestureViewport.current = advanceViewport(gestureViewport.current, previous.current, next, latest.current.size);
        latest.current.props.onViewportChange(gestureViewport.current);
      }
      previous.current = next;
    },
    onPanResponderEnd: e => { previous.current = read(e); },
    onPanResponderRelease: e => {
      const p = latest.current.props, point = pointAt(e);
      const touch = e.nativeEvent.changedTouches?.[0] ?? e.nativeEvent;
      const x = touch.pageX-origin.current.x, y = touch.pageY-origin.current.y;
      const inside = x >= 0 && y >= 0 && x <= latest.current.size.width && y <= latest.current.size.height;
      if (drawing()) {
        if (inside && !intent.current.multiple && (hadAnchor.current || intent.current.moved)) p.onDraw?.('commit',point);
        else if (!inside || intent.current.multiple) p.onDraw?.('cancel',point);
      } else if (!p.readOnly && !p.routeEditing && p.tool === 'target') {
        if (inside && deliberateTap(intent.current,Date.now())) p.onPlace?.(point);
      } else if (!moving.current && (!p.tool || p.tool === 'select')) p.onSelect(null);
      finish();
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderTerminate: e => { if (drawing()) latest.current.props.onDraw?.('cancel',pointAt(e)); finish(); },
  }));
  const transform = size.width > 0 && size.height > 0
    ? createViewportTransform(props.stage.stage, size, props.viewport) : null;
  return (
    <View style={styles.frame}>
      <View testID="stage-canvas" ref={frame} {...responder.panHandlers} style={[styles.viewport, Platform.OS === 'web' && { touchAction: 'none' }]}
        onLayout={({ nativeEvent }) => {
          setSize({ width: nativeEvent.layout.width, height: nativeEvent.layout.height });
          frame.current?.measureInWindow((x, y) => { origin.current = { x, y }; });
        }}>
        {transform && <>
          <View pointerEvents="none" style={[styles.ground, {
            left: transform.offsetX, top: transform.offsetY,
            width: props.stage.stage.width * transform.scale,
            height: props.stage.stage.depth * transform.scale,
          }]} />
          {props.gridVisible && <StageGrid stage={props.stage.stage} transform={transform} />}
          <View accessibilityElementsHidden={props.readOnly} importantForAccessibility={props.readOnly ? 'no-hide-descendants' : 'auto'} pointerEvents={(props.routeEditing || props.readOnly || (props.tool && props.tool !== 'select')) ? 'none' : 'box-none'} style={StyleSheet.absoluteFill}>
          {props.stage.objects.map((item) => <DraggableObject key={item.id}
            item={item} transform={transform} stage={props.stage} snapping={props.snapping} onFeedback={setFeedback} selected={props.selectedId === item.id}
            onSelect={props.onSelect} onDragging={props.onDragging} setStage={props.setStage} />)}
          </View>
          {!props.routeEditing && !props.readOnly && (!props.tool || props.tool === 'select') && props.stage.objects.filter(o => o.id === props.selectedId).map(item => <GeometryControls key={item.id} item={item} stage={props.stage} transform={transform} snapping={props.snapping} onDragging={props.onDragging} setStage={props.setStage} />)}
          {props.draft && (() => {
            const a = stageToViewport(props.draft.start, transform), b = stageToViewport(props.draft.end, transform);
            const length = Math.hypot(b.x-a.x,b.y-a.y), angle = Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;
            return <View pointerEvents="none" style={{ position: 'absolute', left: (a.x+b.x)/2-length/2, top: (a.y+b.y)/2-1, width: Math.max(1,length), height: 2, backgroundColor: '#69d5df', transform: [{ rotate: angle+'deg' }] }} />;
          })()}
          {props.autoPositions && <AutoPositionOverlay positions={props.autoPositions} transform={transform} />}
          <SnapGuides feedback={feedback} stage={props.stage.stage} transform={transform} />
          {props.routePlanning && <View pointerEvents={props.routeEditing && !props.readOnly ? 'box-none' : 'none'} style={StyleSheet.absoluteFill}>
            <RouteOverlay {...props.routePlanning} stage={props.stage} transform={transform} />
          </View>}
        </>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, overflow: 'hidden' },
  viewport: { flex: 1, position: 'relative', overflow: 'hidden', backgroundColor: colors.background },
  ground: { position: 'absolute', backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
});
