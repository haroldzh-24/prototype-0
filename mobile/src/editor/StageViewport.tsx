import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import { clampZoom, createViewportTransform } from '@/stage/coordinates';
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
  stage: StageDocument;
  viewport: ViewportState;
  onViewportChange: (next: ViewportState) => void;
  snapping: SnapSettings;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDragging: (dragging: boolean) => void;
  setStage: React.Dispatch<React.SetStateAction<StageDocument>>;
};

export default function StageViewport(props: Props) {
  const [feedback, setFeedback] = useState<SnapFeedback>({ guides: [], gridAxes: [] });
  const [size, setSize] = useState({ width: 0, height: 0 });
  const transform = size.width > 0 && size.height > 0
    ? createViewportTransform(props.stage.stage, size, props.viewport) : null;
  const latest = useRef(props);
  latest.current = props;
  const gesture = useRef<{ kind: 'pan' | 'pinch'; panStart: { x: number; y: number }; zoomStart: number; distanceStart: number } | null>(null);
  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (_, event) => {
      const touches = ((event as any).nativeEvent?.touches ?? []) as Array<{ pageX: number; pageY: number }>;
      if (touches.length >= 2) {
        const [a, b] = touches;
        const distance = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) || 1;
        gesture.current = { kind: 'pinch', panStart: { x: latest.current.viewport.pan.x, y: latest.current.viewport.pan.y }, zoomStart: latest.current.viewport.zoom, distanceStart: distance };
        return;
      }
      gesture.current = { kind: 'pan', panStart: { x: latest.current.viewport.pan.x, y: latest.current.viewport.pan.y }, zoomStart: latest.current.viewport.zoom, distanceStart: 1 };
    },
    onPanResponderMove: (_, event) => {
      const current = latest.current;
      if (!current) return;
      const touches = ((event as any).nativeEvent?.touches ?? []) as Array<{ pageX: number; pageY: number }>;
      if (touches.length >= 2 && gesture.current?.kind === 'pinch') {
        const [a, b] = touches;
        const distance = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) || 1;
        const nextZoom = clampZoom(gesture.current.zoomStart * (distance / gesture.current.distanceStart));
        current.onViewportChange({ ...current.viewport, zoom: nextZoom });
        return;
      }
      if (touches.length <= 1 && gesture.current?.kind === 'pan') {
        current.onViewportChange({ ...current.viewport, pan: { x: gesture.current.panStart.x + event.dx, y: gesture.current.panStart.y + event.dy } });
      }
    },
    onPanResponderRelease: () => { gesture.current = null; },
    onPanResponderTerminate: () => { gesture.current = null; },
  }));
  return (
    <View style={styles.frame}>
      <View {...responder.current.panHandlers} style={styles.viewport} onLayout={({ nativeEvent }) => setSize({
        width: nativeEvent.layout.width, height: nativeEvent.layout.height,
      })}>
        {transform && <>
          <View pointerEvents="none" style={[styles.ground, {
            left: transform.offsetX, top: transform.offsetY,
            width: props.stage.stage.width * transform.scale,
            height: props.stage.stage.depth * transform.scale,
          }]} />
          <StageGrid stage={props.stage.stage} transform={transform} />
          <View pointerEvents={props.routePlanning ? 'none' : 'box-none'} style={StyleSheet.absoluteFill}>
          {props.stage.objects.map((item) => <DraggableObject key={item.id}
            item={item} transform={transform} stage={props.stage} snapping={props.snapping} onFeedback={setFeedback} selected={props.selectedId === item.id}
            onSelect={props.onSelect} onDragging={props.onDragging} setStage={props.setStage} />)}
          </View>
          <SnapGuides feedback={feedback} stage={props.stage.stage} transform={transform} />
          {props.routePlanning && <RouteOverlay {...props.routePlanning} stage={props.stage} transform={transform} />}
        </>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, minHeight: 440, borderWidth: 1, borderColor: '#465044', borderRadius: 2, overflow: 'hidden', backgroundColor: '#090b0c' },
  viewport: { flex: 1, position: 'relative', overflow: 'hidden', backgroundColor: '#101611' },
  ground: { position: 'absolute', backgroundColor: '#1b241c', borderWidth: 1, borderColor: '#465044' },
});
