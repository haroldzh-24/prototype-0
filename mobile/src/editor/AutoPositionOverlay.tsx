import { Text, View } from 'react-native';
import { stageToViewport } from '../stage/coordinates';
import type { ViewportTransform } from '../stage/coordinates';
import type { DiscoveredPosition } from '../planning/positionDiscovery';

/** Read-only dots pass every touch through to the existing viewport responder. */
export default function AutoPositionOverlay({ positions, transform }: { positions: readonly DiscoveredPosition[]; transform: ViewportTransform }) {
  return <>{positions.map((position, index) => {
    const point = stageToViewport(position.position, transform);
    return <View key={position.id} pointerEvents="none" style={{ position: 'absolute', left: point.x - 10, top: point.y - 10, width: 20, height: 20, borderRadius: 4, borderWidth: 1, borderColor: '#e6b85c', backgroundColor: '#382f20', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#ffe0a0', fontSize: 10 }}>A{index + 1}</Text>
    </View>;
  })}</>;
}
