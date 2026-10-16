import { targetLabel } from '../planning/model';
import { useMemo } from 'react';
import { View, Text } from 'react-native';
import type { StageDocument } from '../stage/model';
import type { StageRoute } from '../planning/route';
import type { ViewportTransform } from '../stage/coordinates';
import { stageToViewport } from '../stage/coordinates';
import { manualEngagementLabel, resolveAnchor, routeSections } from '../planning/manualEngagements';
import type { EngagementGesture } from './manualEngagementGestures';
import { colors } from '../ui/tokens';

export default function ManualEngagementOverlay({ stage, route, transform, selectedId, draft, onSelect, highlightTarget = true }: {
  stage: StageDocument; route: StageRoute; transform: ViewportTransform; selectedId?: string | null;
  highlightTarget?: boolean; draft?: EngagementGesture | null; onSelect?: (id: string) => void;
}) {
  const entries = useMemo(() => {
    const sections = routeSections(stage, route);
    return (route.manualEngagements ?? []).flatMap(e => {
      const point = resolveAnchor(stage, route, e.anchor, sections);
      return point ? [{ e, point, label: manualEngagementLabel(route, e) }] : [];
    });
  }, [stage, route]);
  const visibleDraft = draft && !draft.cancelled && draft.moved ? draft : null;
  const selected = route.manualEngagements?.find(e => e.id === selectedId);
  const targetId = visibleDraft && !visibleDraft.editingId ? visibleDraft.targetId : selected?.targetId;
  const target = stage.objects.find(o => o.id === targetId);
  return <>
    {entries.map(({ e, point, label }) => {
      const a = stageToViewport(point, transform), chosen = e.id === selectedId;
      const direction = visibleDraft?.editingId === e.id ? visibleDraft.direction : e.direction;
      return <View key={e.id} testID={'manual-engagement-' + e.id} pointerEvents="none" accessible accessibilityRole="button"
        accessibilityLabel={(label ? 'Engagement ' + label : 'Route engagement') + ' to target ' + targetLabel(stage, e.targetId)}
        accessibilityState={{ selected: chosen }} onAccessibilityTap={() => onSelect?.(e.id)}
        style={{ position: 'absolute', left: a.x, top: a.y }}>
        <View style={{ position: 'absolute', left: -5, top: -5, width: 10, height: 10, borderRadius: 5, borderWidth: chosen ? 3 : 1, borderColor: colors.accent, backgroundColor: chosen ? colors.accent : colors.background }} />
        <Arrow x={0} y={0} direction={direction} selected={chosen} />
        {!!label && <Text style={{ position: 'absolute', left: 49 * Math.cos(direction) - 6, top: 49 * Math.sin(direction) - 8, color: chosen ? colors.accent : colors.text, backgroundColor: colors.background, fontSize: 12 }}>{label}</Text>}
      </View>;
    })}
    {visibleDraft && (() => {
      const a = stageToViewport(visibleDraft.point, transform), b = visibleDraft.cursor, length = Math.hypot(b.x - a.x, b.y - a.y);
      return <View testID="engagement-draft" pointerEvents="none" style={{ position: 'absolute', left: a.x, top: a.y }}>
        <View testID="engagement-dotted-guide" style={{ position: 'absolute', left: (b.x - a.x) / 2 - length / 2, top: (b.y - a.y) / 2, width: length, borderTopWidth: 2, borderStyle: 'dotted', borderColor: colors.accent, transform: [{ rotate: visibleDraft.direction + 'rad' }] }} />
        {!visibleDraft.editingId && <Arrow x={0} y={0} direction={visibleDraft.direction} selected />}
      </View>;
    })()}
    {highlightTarget && target && 'faceWidth' in target.geometry && (() => {
      const center = stageToViewport(target.position, transform), width = Math.max(44, target.geometry.faceWidth * transform.scale), height = Math.max(44, target.geometry.faceHeight * transform.scale);
      return <View testID={'engagement-target-' + target.id} pointerEvents="none" style={{ position: 'absolute', left: center.x - width / 2, top: center.y - height / 2, width, height, borderWidth: 3, borderColor: colors.accent, backgroundColor: '#58d5e022', transform: [{ rotate: target.rotation + 'deg' }] }} />;
    })()}
  </>;
}
function Arrow({ x, y, direction, selected }: { x: number; y: number; direction: number; selected: boolean }) {
  const color = selected ? colors.accent : colors.text;
  return <View style={{ position: 'absolute', left: x, top: y, width: 0, height: 0, transform: [{ rotate: direction + 'rad' }] }}>
    <View style={{ position: 'absolute', left: 9, top: -1, width: 31, height: selected ? 3 : 2, backgroundColor: color }} />
    <View style={{ position: 'absolute', left: 33, top: -5, width: 10, height: 10, borderTopWidth: 2, borderRightWidth: 2, borderColor: color, transform: [{ rotate: '45deg' }] }} />
  </View>;
}
