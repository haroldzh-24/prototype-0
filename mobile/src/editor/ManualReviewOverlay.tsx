import { View, Text } from 'react-native';
import type { ViewportTransform } from '../stage/coordinates';
import { stageToViewport } from '../stage/coordinates';
import type { ManualRouteReview } from '../planning/manualRouteReview';
import { colors } from '../ui/tokens';

export default function ManualReviewOverlay({ review, transform, selectedId, onlyUnassigned, onSelect }: {
  review: ManualRouteReview; transform: ViewportTransform; selectedId: string | null; onlyUnassigned: boolean; onSelect: (id: string) => void;
}) {
  return <>{review.targets.filter(t => !onlyUnassigned || !t.assigned).map(({ target, assigned }) => {
    if (!('faceWidth' in target.geometry)) return null;
    const center = stageToViewport(target.position, transform), selected = selectedId === target.id;
    const width = Math.max(44, target.geometry.faceWidth * transform.scale) + 6, height = Math.max(44, target.geometry.faceHeight * transform.scale) + 6;
    const color = selected ? colors.accent : assigned ? colors.movement : colors.warning;
    return <View key={target.id} testID={'review-target-' + target.id} pointerEvents="none" accessible accessibilityRole="button"
      accessibilityLabel={target.id + (assigned ? ', assigned' : ', unassigned')} accessibilityState={{ selected }} onAccessibilityTap={() => onSelect(target.id)}
      style={{ position: 'absolute', left: center.x - width / 2, top: center.y - height / 2, width, height }}>
      <View style={{ width, height, borderWidth: selected ? 3 : assigned ? 1 : 2, borderRadius: assigned ? 5 : 0, borderStyle: assigned || selected ? 'solid' : 'dashed', borderColor: color, transform: [{ rotate: target.rotation + 'deg' }] }} />
      <Text style={{ position: 'absolute', left: -4, top: -12, fontSize: 12, color, backgroundColor: colors.background }}>{assigned ? '\u2713' : '!'}</Text>
    </View>;
  })}</>;
}
