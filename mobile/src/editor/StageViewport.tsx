import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { createViewportTransform } from '@/stage/coordinates';
import type { ViewportState } from '@/stage/coordinates';
import type { StageDocument } from '@/stage/model';
import type { SnapSettings, SnapFeedback } from '@/stage/snapping';
import DraggableObject from './DraggableObject';
import StageGrid from './StageGrid';
import SnapGuides from './SnapGuides';

type Props = {
  stage: StageDocument;
  viewport: ViewportState;
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
          <StageGrid stage={props.stage.stage} transform={transform} />
          {props.stage.objects.map((item) => <DraggableObject key={item.id}
            item={item} transform={transform} stage={props.stage} snapping={props.snapping} onFeedback={setFeedback} selected={props.selectedId === item.id}
            onSelect={props.onSelect} onDragging={props.onDragging} setStage={props.setStage} />)}
          <SnapGuides feedback={feedback} stage={props.stage.stage} transform={transform} />
        </>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { height: 430, borderWidth: 5, borderColor: '#33424f', borderRadius: 8, overflow: 'hidden' },
  viewport: { flex: 1, position: 'relative', overflow: 'hidden', backgroundColor: '#c3cbd1' },
  ground: { position: 'absolute', backgroundColor: '#d9d3bf', borderWidth: 1, borderColor: '#33424f' },
});
