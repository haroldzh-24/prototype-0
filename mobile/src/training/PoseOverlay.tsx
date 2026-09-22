import { View } from 'react-native';
import { containedVideoRect, POSE_ANALYSIS_CONFIG as C } from './poseModel';
import type { PoseJointName, PoseSample } from './poseModel';

const bones: [PoseJointName, PoseJointName][] = [
  ['nose', 'neck'], ['neck', 'leftShoulder'], ['neck', 'rightShoulder'], ['leftShoulder', 'rightShoulder'],
  ['leftShoulder', 'leftElbow'], ['leftElbow', 'leftWrist'], ['rightShoulder', 'rightElbow'], ['rightElbow', 'rightWrist'],
  ['leftShoulder', 'leftHip'], ['rightShoulder', 'rightHip'], ['leftHip', 'rightHip'],
  ['leftHip', 'leftKnee'], ['leftKnee', 'leftAnkle'], ['rightHip', 'rightKnee'], ['rightKnee', 'rightAnkle'],
];
export function nearestPoseSample(samples: PoseSample[], ms: number) {
  const closest = samples.reduce<PoseSample | null>((best, sample) =>
    !best || Math.abs(sample.timestampMs - ms) < Math.abs(best.timestampMs - ms) ? sample : best, null);
  return closest && Math.abs(closest.timestampMs - ms) <= C.overlayToleranceMs ? closest : null;
}
export function PoseOverlay({ sample, width, height }: { sample: PoseSample | null; width: number; height: number }) {
  if (!sample?.body || width <= 0) return null;
  const rect = containedVideoRect(width, height, sample.width, sample.height);
  const point = (name: PoseJointName) => {
    const joint = sample.body?.joints[name];
    return joint && joint.confidence >= C.minJointConfidence ? { x: rect.left + joint.x * rect.width, y: rect.top + joint.y * rect.height } : null;
  };
  return <View pointerEvents="none" accessible={false} style={{ position: 'absolute', inset: 0 }}>
    {bones.map(([a, b]) => {
      const p = point(a), q = point(b);
      if (!p || !q) return null;
      const length = Math.hypot(q.x - p.x, q.y - p.y), angle = Math.atan2(q.y - p.y, q.x - p.x);
      return <View key={`${a}:${b}`} style={{ position: 'absolute', left: (p.x + q.x - length) / 2,
        top: (p.y + q.y) / 2 - 1, width: length, height: 2, backgroundColor: '#c498ff', transform: [{ rotate: `${angle}rad` }] }} />;
    })}
    {Object.keys(sample.body.joints).map(name => {
      const p = point(name as PoseJointName);
      return p && <View key={name} style={{ position: 'absolute', left: p.x - 3, top: p.y - 3, width: 6, height: 6,
        borderRadius: 3, backgroundColor: sample.ambiguous ? '#eab54d' : '#c498ff' }} />;
    })}
  </View>;
}
