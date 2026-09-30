import { Text, View } from 'react-native';
import { useMemo } from 'react';
import { stageToViewport } from '../stage/coordinates';
import type { ViewportTransform, StagePosition } from '../stage/coordinates';
import type { StageDocument } from '../stage/model';
import type { StageRoute } from '../planning/route';
import { analyzeEngagements } from '../planning/engagements';
import { colors } from '../ui/tokens';

export default function EngagementOverlay({ stage, route, transform }: { stage: StageDocument; route: StageRoute; transform: ViewportTransform }) {
  const analysis = useMemo(() => analyzeEngagements(stage, route), [stage, route]);
  const line = (from: StagePosition, to: StagePosition, color: string, width: number, label?: string) => {
    const a = stageToViewport(from, transform), target = stageToViewport(to, transform), distance = Math.hypot(target.x - a.x, target.y - a.y);
    const trim = label ? Math.min(12, distance / 4) : 0;
    const b = { x: target.x - (target.x - a.x) * trim / (distance || 1), y: target.y - (target.y - a.y) * trim / (distance || 1) };
    const angle = Math.atan2(b.y - a.y, b.x - a.x), size = Math.hypot(b.x - a.x, b.y - a.y);
    return <>
      <View style={{ position: 'absolute', left: (a.x + b.x) / 2 - size / 2, top: (a.y + b.y) / 2 - width / 2, width: size, height: width, backgroundColor: color, transform: [{ rotate: `${angle}rad` }] }} />
      {label && <>
        <View style={{ position: 'absolute', left: b.x - 4, top: b.y - 4, width: 8, height: 8, borderRightWidth: 2, borderTopWidth: 2, borderColor: color, transform: [{ rotate: `${angle + Math.PI / 4}rad` }] }} />
        <Text style={{ position: 'absolute', left: a.x + (b.x - a.x) * 0.6, top: a.y + (b.y - a.y) * 0.6 - 8, color, backgroundColor: colors.background, fontWeight: '700', fontSize: 13 }}>{label}</Text>
      </>}
    </>;
  };
  return <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0 }}>
    {analysis.nodes.flatMap(n => n.targets.filter(t => t.window).map(t => <View key={`window-${n.id}-${t.targetId}`}>{line(t.window!.startPosition, t.window!.endPosition, '#148578', 6)}</View>))}
    {analysis.nodes.map((node, i) => {
      const p = stageToViewport(node.position, transform), moving = node.kind === 'moving', color = moving ? '#148578' : colors.accent;
      return <View key={node.id}>
        {node.targets.map(t => { const target = stage.objects.find(o => o.id === t.targetId); return target ? <View key={t.targetId}>{line(node.position, target.position, color, 2, t.orderLabel)}</View> : null; })}
        <View style={{ position: 'absolute', left: p.x - 10, top: p.y - 10, width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderStyle: moving ? 'dashed' : 'solid', borderColor: color, backgroundColor: colors.background }} />
        <Text style={{ position: 'absolute', left: p.x + 12, top: p.y + 5, width: 110, color, fontSize: 10, backgroundColor: colors.background }}>{i + 1} {moving ? 'MOVING' : 'STOP'}</Text>
      </View>;
    })}
  </View>;
}
