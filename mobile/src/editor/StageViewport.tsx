import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { createViewportTransform, moveByViewportDelta, stageToViewport } from '@/stage/coordinates';
import type { ViewportState, ViewportTransform } from '@/stage/coordinates';
import type { StageDocument, StageObject } from '@/stage/model';
import { moveObject } from '@/stage/operations';

type Props = {
  stage: StageDocument;
  viewport: ViewportState;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDragging: (dragging: boolean) => void;
  setStage: React.Dispatch<React.SetStateAction<StageDocument>>;
};

export default function StageViewport(props: Props) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const transform = size.width > 0 && size.height > 0
    ? createViewportTransform(props.stage.stage, size, props.viewport) : null;
  return (
    <View style={styles.frame}>
      <View style={styles.viewport} onLayout={({ nativeEvent }) => setSize({
        width: nativeEvent.layout.width, height: nativeEvent.layout.height,
      })}>
        {transform && <>
          <View pointerEvents="none" style={[styles.ground, {
            left: transform.offsetX, top: transform.offsetY,
            width: props.stage.stage.width * transform.scale,
            height: props.stage.stage.depth * transform.scale,
          }]} />
          {props.stage.objects.map((item) => <DraggableObject key={item.id}
            item={item} transform={transform} selected={props.selectedId === item.id}
            onSelect={props.onSelect} onDragging={props.onDragging} setStage={props.setStage} />)}
        </>}
      </View>
    </View>
  );
}

type ObjectProps = Pick<Props, 'onSelect' | 'onDragging' | 'setStage'> & {
  item: StageObject; transform: ViewportTransform; selected: boolean;
};
function DraggableObject(props: ObjectProps) {
  const latest = useRef(props);
  latest.current = props;
  const drag = useRef({ position: props.item.position, transform: props.transform });
  const [responder] = useState(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      const current = latest.current;
      drag.current = { position: current.item.position, transform: current.transform };
      current.onSelect(current.item.id);
      current.onDragging(true);
    },
    onPanResponderMove: (_, gesture) => {
      const position = moveByViewportDelta(drag.current.position,
        { x: gesture.dx, y: gesture.dy }, drag.current.transform);
      const { item, setStage } = latest.current;
      setStage((stage) => moveObject(stage, item.id, position));
    },
    onPanResponderRelease: () => latest.current.onDragging(false),
    onPanResponderTerminate: () => latest.current.onDragging(false),
  }));
  const { item, transform, selected } = props;
  const center = stageToViewport(item.position, transform);
  const width = item.geometry.width * transform.scale;
  const height = item.geometry.depth * transform.scale;
  return <View {...responder.panHandlers} hitSlop={10}
    accessible accessibilityRole="button" accessibilityLabel={item.type === 'start' ? 'Start Position' : item.type}
    accessibilityState={{ selected }} onAccessibilityTap={() => props.onSelect(item.id)}
    style={[styles.object, item.type === 'target' ? styles.target
      : item.type === 'wall' ? styles.wall : styles.start, {
      left: center.x - width / 2, top: center.y - height / 2, width, height,
      transform: [{ rotate: item.rotation + 'deg' }],
    }, selected && styles.selected]}>
    {item.type === 'start' && <Text style={styles.startText}>Start Position</Text>}
  </View>;
}

const styles = StyleSheet.create({
  frame: { height: 430, borderWidth: 5, borderColor: '#33424f', borderRadius: 8, overflow: 'hidden' },
  viewport: { flex: 1, position: 'relative', overflow: 'hidden', backgroundColor: '#c3cbd1' },
  ground: { position: 'absolute', backgroundColor: '#d9d3bf', borderWidth: 1, borderColor: '#33424f' },
  object: { position: 'absolute', borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  target: { backgroundColor: '#b98b50', borderColor: '#604522', borderRadius: 3 },
  wall: { backgroundColor: '#657783', borderColor: '#25333d' },
  start: { backgroundColor: '#d85b3d', borderColor: '#9e351d', borderRadius: 3 },
  selected: { borderColor: '#007aff', outlineColor: '#007aff', outlineWidth: 2, outlineStyle: 'solid' },
  startText: { color: 'white', fontWeight: 'bold', fontSize: 8, textAlign: 'center' },
});
