import { useRef, useState } from 'react';
import { View } from 'react-native';
import { containedVideoRect } from './poseModel';
import type { CloseRun, CloseSelection, Point, Region } from './closeUp';

export function CloseUpOverlay({ run, timeMs, width, height, videoWidth, videoHeight, selecting, onSelect }: {
  run?: CloseRun; timeMs: number; width: number; height: number; videoWidth: number; videoHeight: number;
  selecting: boolean; onSelect: (selection: CloseSelection) => void;
}) {
  const start = useRef<Point | null>(null), [region, setRegion] = useState<Region | null>(null);
  const sample = run?.preview.find(f => Math.abs(f.timestampMs - timeMs) <= 50);
  const rect = containedVideoRect(width, height, sample?.width ?? videoWidth, sample?.height ?? videoHeight);
  if (!rect.width || !rect.height) return null;
  const normalized = (x: number, y: number) => ({ x: Math.max(0, Math.min(1, (x - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (y - rect.top) / rect.height)) });
  const box = selecting ? region : sample?.object.status === 'TRACKED' ? sample.object.region : null;
  return <View style={{ position: 'absolute', inset: 0 }} pointerEvents={selecting ? 'auto' : 'none'}
    onStartShouldSetResponder={() => selecting} onMoveShouldSetResponder={() => selecting}
    onResponderGrant={e => { start.current = normalized(e.nativeEvent.locationX, e.nativeEvent.locationY); setRegion(null); }}
    onResponderMove={e => { if (!start.current) return; const p = normalized(e.nativeEvent.locationX, e.nativeEvent.locationY), a = start.current;
      setRegion({ x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), width: Math.abs(a.x - p.x), height: Math.abs(a.y - p.y) }); }}
    onResponderRelease={() => { if (region && region.width >= .02 && region.height >= .02) onSelect({ timestampMs: timeMs, region }); start.current = null; }}
    onResponderTerminate={() => { start.current = null; setRegion(null); }}>
    {box && <View style={{ position: 'absolute', left: rect.left + box.x * rect.width, top: rect.top + box.y * rect.height,
      width: box.width * rect.width, height: box.height * rect.height, borderWidth: 2, borderColor: '#44ddd0' }} />}
    {!selecting && sample?.hands.flatMap((h, i) => Object.entries(h.joints).map(([name, p]) => p && <View key={`${i}:${name}`} style={{ position: 'absolute',
      left: rect.left + p.x * rect.width - 2, top: rect.top + p.y * rect.height - 2, width: 4, height: 4, borderRadius: 2,
      backgroundColor: h.id === undefined ? '#eab54d' : '#c498ff' }} />))}
    {!selecting && run?.path.filter(f => f.timestampMs <= timeMs && f.timestampMs >= timeMs - 1500).map(f => f.object.status === 'TRACKED' && <View key={f.timestampMs}
      style={{ position: 'absolute', left: rect.left + f.object.center.x * rect.width - 2, top: rect.top + f.object.center.y * rect.height - 2,
        width: 4, height: 4, borderRadius: 2, backgroundColor: '#44ddd0' }} />)}
  </View>;
}
