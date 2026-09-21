import { colors } from '../ui/tokens';
import { useRef, useState } from 'react';
import { PanResponder, Platform, StyleSheet, View } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import { advanceViewport, sampleTouches } from './viewportGestures';
import type { TouchSample } from './viewportGestures';
import { createViewportTransform } from '@/stage/coordinates';
import type { ViewportState } from '@/stage/coordinates';
import type { StageDocument } from '@/stage/model';
import type { SnapSettings, SnapFeedback } from '@/stage/snapping';
import DraggableObject from './DraggableObject';
import StageGrid from './StageGrid';
import SnapGuides from './SnapGuides';
import RouteOverlay from './RouteOverlay';
import type { RouteOverlayProps } from './RouteOverlay';

type Props = {
  routePlanning?: RouteOverlayProps;
  routeEditing: boolean;
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
  const previous = useRef<TouchSample | null>(null);
  const moving = useRef(false);
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
      latest.current.props.onDragging(true);
    },
    onPanResponderStart: e => { previous.current = read(e); },
    onPanResponderMove: (e, gesture) => {
      const next = read(e);
      if (Math.hypot(gesture.dx, gesture.dy) > 3 || next.count > 1) moving.current = true;
      if (previous.current) {
        gestureViewport.current = advanceViewport(gestureViewport.current, previous.current, next, latest.current.size);
        latest.current.props.onViewportChange(gestureViewport.current);
      }
      previous.current = next;
    },
    onPanResponderEnd: e => { previous.current = read(e); },
    onPanResponderRelease: () => {
      if (!moving.current) latest.current.props.onSelect(null);
      finish();
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderTerminate: finish,
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
          <View pointerEvents={props.routeEditing ? 'none' : 'box-none'} style={StyleSheet.absoluteFill}>
          {props.stage.objects.map((item) => <DraggableObject key={item.id}
            item={item} transform={transform} stage={props.stage} snapping={props.snapping} onFeedback={setFeedback} selected={props.selectedId === item.id}
            onSelect={props.onSelect} onDragging={props.onDragging} setStage={props.setStage} />)}
          </View>
          <SnapGuides feedback={feedback} stage={props.stage.stage} transform={transform} />
          {props.routePlanning && <View pointerEvents={props.routeEditing ? 'box-none' : 'none'} style={StyleSheet.absoluteFill}>
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
