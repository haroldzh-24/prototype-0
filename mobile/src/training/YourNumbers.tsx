import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import EditorSheet from '../editor/EditorSheet';
import { Action, Copy, DataRow, Panel, Segmented, ui } from '../ui/kit';
import { colors } from '../ui/tokens';
import { useThemeMode } from '../ui/theme';
import type { TimingFactor, UserProfile } from '../profile/model';
import { factorLabels, timingFactors } from '../profile/personalizedPerformance';
import { moveDirectionLabels, moveDirections, validMovementModel } from '../profile/movementModel';
import type { MoveFit } from '../profile/movementModel';
import type { TrainingRecord } from './model';
import { trainingContexts } from './observations';
import type { TrainingContext } from './observations';
import { contextLabels, startLabels } from './presentation';
import { libraryDrill, variantKey, variantLabel } from './drillLibrary';
import { libraryNumbers, libraryTrend } from './libraryStats';
import type { Stat } from './libraryStats';

const s2 = (v: number) => v.toFixed(2) + ' s';
const pct = (v: number) => Math.round(v * 100) + '%';
const runs = (n: number) => n + (n === 1 ? ' run' : ' runs');
/** "0.25 s ± 0.03 · 6 runs · best 0.21 s" — every number carries how many runs it rests on. */
export function statText(stat: Stat, unit: (v: number) => string = s2, best = true) {
  return unit(stat.mean) + (stat.sd !== null ? ' ± ' + unit(stat.sd).replace(/ s$/, '') : '') + ' · ' + runs(stat.n) + (best && stat.n > 1 ? ' · best ' + unit(stat.best) : '');
}
const ydPerSecond = (fit: MoveFit) => (fit.inchesPerSecond / 36).toFixed(1) + ' yd/s';
export function fitText(fit: MoveFit) {
  const span = `${Math.round(fit.minInches / 36)}–${Math.round(fit.maxInches / 36)} yd`;
  if (fit.method === 'AVERAGE_SPEED') return `${ydPerSecond(fit)} average (${runs(fit.sampleCount)}; ` + (fit.maxInches - fit.minInches < 6
    ? 'all at one distance: log another distance to separate start-and-stop time)' : 'longer moves are not yet clearly slower, so start-and-stop time can’t be separated: log more runs)');
  return `${s2(fit.overheadSeconds)} to start and stop + ${ydPerSecond(fit)}${fit.method === 'SHARED_OVERHEAD' ? ' (start-and-stop shared with other directions)' : ''} · ${runs(fit.sampleCount)}, ${span}`;
}
const factorUnit = (factor: TimingFactor, value: number) => factor === 'movementSpeed' ? (value / 36).toFixed(1) + ' yd/s' : s2(value);

/** Everything the drill library has measured, and what the planner is using. */
export default function YourNumbers({ visible, records, profile, onClose }: {
  visible: boolean; records: readonly TrainingRecord[]; profile: UserProfile | null; onClose: () => void;
}) {
  useThemeMode();
  const planning = profile?.calibrationContext ?? 'LIVE_FIRE';
  const [context, setContext] = useState<TrainingContext>(planning), [trendKey, setTrendKey] = useState<string | null>(null);
  // Open on the context the planner uses (the profile may load after the screen does).
  useEffect(() => { if (visible) { setContext(planning); setTrendKey(null); } }, [visible, planning]);
  const pf = profile?.powerFactor ?? 'minor';
  const n = libraryNumbers(records, context, pf);
  const variants = [...new Map(records.filter(r => (r.context ?? 'DRY_FIRE') === context).flatMap(r => r.libraryRuns ?? [])
    .map(run => [variantKey(run), run] as const)).values()];
  const trend = trendKey ? libraryTrend(records, trendKey, pf) : [];
  const par = trendKey ? profile?.drillPars?.[trendKey] : undefined;
  const longest = Math.max(par ?? 0, ...trend.map(t => t.total ?? 0));
  const performance = profile?.performance ?? null, evidence = performance?.timingEvidence ?? {};
  // Saved profiles are untrusted: a damaged fit is not shown rather than breaking the screen.
  const moveFitAll = validMovementModel(performance?.movementModel)?.all;
  const section = (title: string, rows: ReactNode, show: boolean) => show ? <View style={{ gap: 4 }}><Text style={ui.eyebrow}>{title}</Text>{rows}</View> : null;

  return <EditorSheet title="YOUR NUMBERS" visible={visible} close={onClose}><Panel>
    <Segmented options={trainingContexts.map(c => contextLabels[c])} value={contextLabels[context]}
      onChange={label => { setContext(trainingContexts.find(c => contextLabels[c] === label)!); setTrendKey(null); }} />
    {context === planning && performance && section('WHAT THE PLANNER USES', <>
      {timingFactors.map(f => { const e = evidence[f]; return <DataRow key={f} label={f === 'movementSpeed' ? 'Average speed' : factorLabels[f]}
        value={factorUnit(f, performance[f]) + ' · ' + (e?.source === 'MEASURED' ? `measured, ${e.sampleCount ?? 0} sample${e.sampleCount === 1 ? '' : 's'}` : e?.source === 'MANUAL' ? 'typed in' : 'generic default')} />; })}
      {moveFitAll && <DataRow label="Move time (used for legs)" value={fitText(moveFitAll)} />}
      <Copy>Splits, transitions and reloads above are standing square on full paper; moving, steel, partial-target and port runs are kept separately below.</Copy>
    </>, true)}
    {context !== planning && <Copy>The planner uses your {contextLabels[planning].toLowerCase()} numbers. These {contextLabels[context].toLowerCase()} numbers are for comparison.</Copy>}
    {!n.runs && <Copy>No drill-library runs in {contextLabels[context].toLowerCase()} yet. Open a session and choose LOG LIBRARY DRILL.</Copy>}

    {section('DRAW', n.draw.map(d => <DataRow key={d.start} label={startLabels[d.start]} value={statText(d.stat)} />), n.draw.length > 0)}
    {section('SPLITS BY DISTANCE', n.splits.map(s => <DataRow key={s.yards} label={s.yards + ' yd'} value={statText(s.stat) + (s.points ? ' · ' + pct(s.points.mean) + ' of points' : '')} />), n.splits.length > 0)}
    {section('ACCURACY BY DISTANCE', n.accuracy.map(a => <DataRow key={a.yards} label={a.yards + ' yd'}
      value={`A ${pct(a.a)} · C ${pct(a.c)} · D ${pct(a.d)} · miss ${pct(a.miss)} · ${a.required} hits, ${runs(a.runs)}` + (a.noShoots ? ` · ${a.noShoots} no-shoot` : '')} />), n.accuracy.length > 0)}
    {section('TRANSITIONS BY SPREAD', <>
      {n.transitions.map(t => <DataRow key={t.spreadYards} label={t.spreadYards + ' yd apart'} value={statText(t.stat)} />)}
      {n.transitionFit && <Copy>{`Each extra yard between targets adds ${s2(n.transitionFit.perYard)} (from ${runs(n.transitionFit.runs)}).`}</Copy>}
    </>, n.transitions.length > 0)}
    {section('RELOADS', n.reloads.map(r => <DataRow key={r.mode} label={r.mode === 'standing' ? 'Standing' : 'Stepping'} value={statText(r.stat)} />), n.reloads.length > 0)}
    {section('MOVEMENT', <>
      {moveDirections.map(d => n.movement.model[d] && <DataRow key={d} label={moveDirectionLabels[d]} value={fitText(n.movement.model[d]!)} />)}
      {n.movement.moves.map(m => <DataRow key={m.direction + m.yards} label={`${moveDirectionLabels[m.direction]} ${m.yards} yd`} value={statText(m.stat)} />)}
      <Copy>Times run from the last shot before the move to the first shot after it.</Copy>
    </>, n.movement.moves.length > 0)}
    {section('SHOOTING ON THE MOVE', n.onTheMove.map(m => <DataRow key={m.mode} label={m.mode === 'standing' ? 'Standing' : m.mode === 'toward' ? 'Walking toward' : 'Walking across'}
      value={statText(m.split) + (m.points ? ' · ' + pct(m.points.mean) + ' of points' : '')} />), n.onTheMove.length > 0)}
    {section('STEEL', n.steel.map(s => <DataRow key={s.yards} label={s.yards + ' yd'}
      value={(s.perPlate ? statText(s.perPlate) + ' per plate' : 'per-plate time needs a run with every shot time and no makeups')
        + (s.missRuns ? ` · ${s.misses} missed in ${s.shots} shots (${pct(s.misses / s.shots)}), ${runs(s.missRuns)}` : context === 'DRY_FIRE' ? ' · misses are not recorded in dry fire' : '')} />), n.steel.length > 0)}
    {section('PORTS AND LEANS', n.positions.map(p => <DataRow key={p.position + p.yards} label={`${p.position === 'square' ? 'Square' : p.position === 'port' ? 'Low port' : 'Hard lean'}, ${p.yards} yd`}
      value={statText(p.shooting) + (p.extra !== null ? ` · ${p.extra >= 0 ? '+' : '−'}${s2(Math.abs(p.extra))} against square` : '')} />), n.positions.length > 0)}
    {section('PARTIAL TARGETS', n.partial.map(p => <DataRow key={p.face + p.yards} label={`${p.face === 'head' ? 'Head only' : p.face === 'diagonal' ? 'Diagonal' : 'Full'}, ${p.yards} yd`}
      value={(p.split ? statText(p.split) + ' split' : 'no times') + (p.points ? ' · ' + pct(p.points.mean) + ' of points' : '')} />), n.partial.length > 0)}
    {n.elPresidente && section('EL PRESIDENTE', <>
      {n.elPresidente.hitFactor && <DataRow label="Hit factor" value={statText(n.elPresidente.hitFactor, v => v.toFixed(2), true)} />}
      {n.elPresidente.shooting && <DataRow label="First to last shot" value={statText(n.elPresidente.shooting)} />}
      <Copy>{n.elPresidente.predicted !== null && n.elPresidente.shooting
        ? `Your parts add up to ${s2(n.elPresidente.predicted)} (6 splits at 10 yd, 4 transitions 1 yd apart, a standing reload); the real string is ${s2(n.elPresidente.shooting.mean)}.`
        : 'Log 10 yd splits, 1 yd transitions and standing reloads to check that your parts add up.'}</Copy>
    </>, true)}

    {section('TRENDS', variants.map(run => {
      const key = variantKey(run), drill = libraryDrill(run.drillId)!, open = trendKey === key, label = variantLabel(drill, run.choices);
      return <View key={key} style={{ gap: 4 }}>
        <Action title={(open ? '▾ ' : '▸ ') + label} accessibilityLabel={'Trend ' + label} onPress={() => setTrendKey(open ? null : key)} />
        {open && <View style={{ gap: 4 }}>
          {par !== undefined && <DataRow label="Par" value={s2(par)} />}
          {trend.map(t => <View key={t.runId} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[ui.copy, { width: 56 }]}>{new Date(t.at).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}</Text>
            <View style={{ flex: 1, height: 14, backgroundColor: colors.hairline }}>
              {t.total !== null && longest > 0 && <View style={{ width: `${Math.max(2, 100 * t.total / longest)}%`, height: 14,
                backgroundColor: par !== undefined && t.total > par ? colors.warning : colors.movement }} />}
              {par !== undefined && longest > 0 && <View accessibilityLabel="Par mark" style={{ position: 'absolute', left: `${100 * par / longest}%`, top: -3, width: 2, height: 20, backgroundColor: colors.text }} />}
            </View>
            <Text style={[ui.dataValue, { minWidth: 112, textAlign: 'right' }]}>{(t.total !== null ? s2(t.total) : '—') + (t.hitFactor !== null ? ' · HF ' + t.hitFactor.toFixed(2) : '')}</Text>
          </View>)}
          <Copy>{par !== undefined ? 'Green runs are at or under par (the black mark). ' : 'Set a par when you log this drill to mark it here. '}Oldest first.</Copy>
        </View>}
      </View>;
    }), variants.length > 0)}
  </Panel></EditorSheet>;
}
