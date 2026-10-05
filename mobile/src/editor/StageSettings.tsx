import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { Action, Copy, ui } from '../ui/kit';
import type { StageDocument } from '../stage/model';
import { objectLabel } from '../stage/model';
import type { StageRoute } from '../planning/route';
import { formatYards, parseYards, yardInput } from '../stage/measurements';
import { outsideStage, resizeStage } from '../stage/resize';
import type { OutsideItem } from '../stage/resize';

export default function StageSettings({ stage, route, onApply, onSelect }: {
  stage: StageDocument; route?: StageRoute; onApply: (stage: StageDocument) => void; onSelect: (item: OutsideItem) => void;
}) {
  const [width, setWidth] = useState(() => yardInput(stage.stage.width));
  const [depth, setDepth] = useState(() => yardInput(stage.stage.depth));
  const [warning, setWarning] = useState<OutsideItem[] | null>(null);
  const [notice, setNotice] = useState('');
  const outside = outsideStage(stage, stage.stage, route);
  const outsideLabel = (item: OutsideItem) => {
    if (item.kind === 'position') { const index=route?.positions.findIndex(p=>p.id===item.id) ?? -1; return index < 0 ? 'Missing waypoint' : `Waypoint ${index+1} · ${route!.positions[index].label}`; }
    const object=stage.objects.find(o=>o.id===item.id);
    return object ? `${objectLabel(object.type)} ${stage.objects.filter(o=>o.type===object.type).findIndex(o=>o.id===item.id)+1}` : 'Missing object';
  };
  const apply = (keepOutside = false) => {
    // Preserve the exact stored value when a rounded display field is unchanged.
    const size = { width: width === yardInput(stage.stage.width) ? stage.stage.width : parseYards(width) ?? NaN,
      depth: depth === yardInput(stage.stage.depth) ? stage.stage.depth : parseYards(depth) ?? NaN };
    const result = resizeStage(stage, size, route, keepOutside);
    if (result.error) { setNotice(result.error); return; }
    if (result.needsConfirmation) { setWarning(result.outside); return; }
    onApply(result.document); setWarning(null); setNotice('Stage boundary updated.');
  };
  return <View style={{ gap: 12, paddingHorizontal: 16 }}>
    <Copy>{formatYards(stage.stage.width)} wide × {formatYards(stage.stage.depth)} deep</Copy>
    <Copy>Changing dimensions only changes the stage boundary. Objects keep their sizes and positions.</Copy>
    <Copy>Stage width (yards)</Copy>
    <TextInput accessibilityLabel="Stage width in yards" keyboardType="decimal-pad" style={ui.input} value={width}
      onChangeText={text => { setWidth(text); setWarning(null); setNotice(''); }} />
    <Copy>Stage depth (yards)</Copy>
    <TextInput accessibilityLabel="Stage depth in yards" keyboardType="decimal-pad" style={ui.input} value={depth}
      onChangeText={text => { setDepth(text); setWarning(null); setNotice(''); }} />
    {warning ? <>
      <Copy>{warning.length} objects or waypoints would be outside the new boundary. Keep the resize to correct them manually.</Copy>
      {warning.map(item => <Copy key={item.kind + item.id}>{outsideLabel(item)}</Copy>)}
      <Action title="Cancel resize" onPress={() => { setWidth(yardInput(stage.stage.width)); setDepth(yardInput(stage.stage.depth)); setWarning(null); }} />
      <Action title="Keep resize" onPress={() => apply(true)} />
    </> : <Action title="Apply dimensions" variant="primary" onPress={() => apply()} />}
    {!!notice && <Copy>{notice}</Copy>}
    {outside.length > 0 && <>
      <Copy>Outside the stage: select an item to correct it manually. You can also enlarge the stage.</Copy>
      {outside.map(item => <Action key={item.kind + item.id} title={outsideLabel(item)} onPress={() => onSelect(item)} />)}
    </>}
  </View>;
}
