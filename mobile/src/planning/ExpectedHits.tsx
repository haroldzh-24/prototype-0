import { Text, View } from 'react-native';
import { Copy, Segmented, ui } from '../ui/kit';
import { MISS_RISKS, plannedOutcomes } from './expectedPoints';
import type { PlannedOutcome, TargetExpectation } from './expectedPoints';

const MINE = 'MY NUMBERS';
const pct = (v: number) => Math.round(v * 100) + '%';

/** Per-target planning: what you expect to shoot on it (paper) and how likely a miss is. */
export default function ExpectedHits({ steel, value, onChange }: {
  steel: boolean; value: TargetExpectation | undefined;
  onChange: (change: { outcome?: PlannedOutcome | null; missRisk?: number | null }) => void;
}) {
  return <View style={{ gap: 6 }}>
    <Text style={ui.eyebrow}>EXPECTED HITS</Text>
    {!steel && <>
      <Copy>Plan for</Copy>
      <Segmented options={[MINE, ...plannedOutcomes]} value={value?.outcome ?? MINE}
        onChange={v => onChange({ outcome: v === MINE ? null : v as PlannedOutcome })} />
    </>}
    <Copy>{steel ? 'Miss risk per shot (a miss costs a makeup shot)' : 'Miss risk per hit (each miss costs 10 points)'}</Copy>
    <Segmented options={[MINE, ...MISS_RISKS.map(pct)]} value={value?.missRisk !== undefined ? pct(value.missRisk) : MINE}
      onChange={v => onChange({ missRisk: v === MINE ? null : MISS_RISKS.find(r => pct(r) === v)! })} />
    <Copy>{steel ? 'MY NUMBERS uses your steel runs at the distance the route shoots it from.'
      : 'MY NUMBERS uses your library runs with counted hits at the distance the route shoots it from (see ANALYZE).'}</Copy>
  </View>;
}
