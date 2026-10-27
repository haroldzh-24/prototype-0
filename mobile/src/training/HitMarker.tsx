import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { uuid } from 'expo-modules-core';
import { Action, Copy, DataRow, Notice, Panel, Segmented } from '../ui/kit';
import type { TargetPreset } from '../stage/targetPresets';
import type { TargetFamily } from '../stage/targetFamily';
import { groupStats, MAX_HITS_PER_RUN, offsetText, PENALTY_TAGS, zoneChoices } from './drillLog';
import type { DrillHit } from './drillLog';
import type { LibraryTarget } from './drillLibrary';
import { pressPoint } from './pressPoint';
import { outlineUri, tapToFace } from './targetFace';

const WIDTH = 280;

/**
 * Mark where each shot hit on a drill-library run's target: tap the face, then tag the zone. Misses and no-shoot hits
 * have no spot on this face. Zones are always tagged by the shooter (never read from the coordinates).
 */
export default function HitMarker({ family, preset, target, distanceYards, disabled, onChange }: {
  family: TargetFamily; preset: TargetPreset; target: LibraryTarget; distanceYards: number | null; disabled: boolean;
  onChange: (target: LibraryTarget) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null), [aiming, setAiming] = useState(false), [note, setNote] = useState('');
  const height = WIDTH * preset.height / preset.width;
  const [size, setSize] = useState({ width: WIDTH, height });
  const onFace = zoneChoices[family].filter(z => !PENALTY_TAGS.includes(z));
  const renumber = (hits: DrillHit[]) => hits.map((h, i) => ({ ...h, order: i + 1 }));
  const add = (x: number | null, y: number | null, zone: string | null) => {
    if (target.hits.length >= MAX_HITS_PER_RUN) { setNote(`A run holds at most ${MAX_HITS_PER_RUN} hits.`); return; }
    const hit: DrillHit = { id: uuid.v4(), order: target.hits.length + 1, x, y, zone };
    onChange({ ...target, hits: [...target.hits, hit] }); setSelected(x === null ? null : hit.id); setNote('');
  };
  const tap = (lx: number, ly: number) => {
    const p = tapToFace(lx, ly, size.width, size.height, target.faceWidth, target.faceHeight);
    if (aiming) { onChange({ ...target, aim: p }); setAiming(false); return; }
    add(p.x, p.y, null);
  };
  const selectedHit = target.hits.find(h => h.id === selected);
  const stats = groupStats({ hits: target.hits, aim: target.aim, distanceYards });
  const untagged = target.hits.filter(h => h.zone === null).length;
  return <View style={{ gap: 8 }}>
    <Copy>{aiming ? 'Tap where you aimed.' : 'Tap where each shot hit, then pick its zone.'}</Copy>
    <Pressable accessibilityLabel="Target: tap where a shot hit" disabled={disabled}
      onLayout={e => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      onPress={e => { const p = pressPoint(e.nativeEvent); if (p) tap(p.x, p.y); }}
      style={{ width: WIDTH, height, alignSelf: 'center', backgroundColor: '#f4f1ea' }}>
      <Image pointerEvents="none" source={{ uri: outlineUri(preset) }} style={{ width: WIDTH, height }} contentFit="fill" cachePolicy="none" />
      <View pointerEvents="none" style={{ position: 'absolute', left: (target.aim.x / target.faceWidth + 0.5) * size.width - 8, top: (0.5 - target.aim.y / target.faceHeight) * size.height - 8, width: 16, height: 16, borderWidth: 2, borderColor: '#1d4ed8', borderRadius: 8 }} />
      {target.hits.filter(h => h.x !== null && h.y !== null).map(h => <Pressable key={h.id} accessibilityLabel={`Hit ${h.order}${h.zone ? ' zone ' + h.zone : ', no zone yet'}`} onPress={() => setSelected(h.id)}
        style={{ position: 'absolute', left: ((h.x as number) / target.faceWidth + 0.5) * size.width - 7, top: (0.5 - (h.y as number) / target.faceHeight) * size.height - 7, width: 14, height: 14, borderRadius: 7,
          backgroundColor: h.id === selected ? '#dc2626' : h.zone ? '#111827' : '#f59e0b', borderWidth: 1, borderColor: '#fff' }} />)}
    </Pressable>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
      <Action title="MISS" disabled={disabled} onPress={() => add(null, null, 'M')} />
      <Action title="NO-SHOOT HIT" disabled={disabled} onPress={() => add(null, null, 'NS')} />
      <Action title="UNDO LAST" disabled={disabled || !target.hits.length} onPress={() => { onChange({ ...target, hits: target.hits.slice(0, -1) }); setSelected(null); }} />
      <Action title={aiming ? 'CANCEL AIM' : 'SET AIM POINT'} disabled={disabled} onPress={() => setAiming(a => !a)} />
    </View>
    {selectedHit && <Panel>
      <Copy>{`HIT ${selectedHit.order}` + (selectedHit.x !== null ? ` · ${selectedHit.x.toFixed(1)} in, ${(selectedHit.y as number).toFixed(1)} in` : '')}</Copy>
      <Segmented options={onFace} value={selectedHit.zone ?? ''} disabled={disabled}
        onChange={zone => { onChange({ ...target, hits: target.hits.map(h => h.id === selectedHit.id ? { ...h, zone } : h) }); setSelected(null); }} />
      <Action title="DELETE HIT" variant="destructive" disabled={disabled} onPress={() => { onChange({ ...target, hits: renumber(target.hits.filter(h => h.id !== selectedHit.id)) }); setSelected(null); }} />
    </Panel>}
    {!!note && <Notice tone="warning">{note}</Notice>}
    {untagged > 0 && <Notice tone="warning">{`${untagged} hit${untagged === 1 ? ' has' : 's have'} no zone yet: tap ${untagged === 1 ? 'it' : 'each'} (orange) and pick the zone.`}</Notice>}
    <DataRow label="Marked" value={`${stats.shots} on the target · ${stats.misses} miss${stats.misses === 1 ? '' : 'es'}`} />
    <DataRow label="Group centre" value={offsetText(stats.offset)} />
    <DataRow label="Mean radius" value={stats.meanRadius === null ? '—' : stats.meanRadius.toFixed(1) + ' in'} />
  </View>;
}
