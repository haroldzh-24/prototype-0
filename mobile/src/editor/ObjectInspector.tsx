import { targetPreset } from '../stage/targetPresets';
import { colors, typography } from '../ui/tokens';
import { facePresets } from '@/stage/targetFace';
import WallPortsInspector from './WallPortsInspector';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Text from '@/editor/FieldText';
import type { StageObject } from '@/stage/model';
import type { ObjectEdit } from '@/stage/operations';
import { formatYards, parseYards } from '@/stage/measurements';

import { inspectorValues, inspectorFields, parseInspectorEdit } from './inspectorFields';

export default function ObjectInspector({ item, disabled, onApply, advancedContent }: {
  item: StageObject; disabled: boolean; onApply: (edit: ObjectEdit) => string | null; advancedContent?: ReactNode;
}) {
  const [draft, setDraft] = useState(() => inspectorValues(item));
  const [advanced, setAdvanced] = useState(false);
  const [portsOpen, setPortsOpen] = useState(false);
  const target = ['cardboardTarget', 'noShootTarget', 'steelPlate', 'steelPopper'].includes(item.type);
  const preset = 'presetId' in item ? targetPreset(item.presetId ?? '') : undefined;
  const [notice, setNotice] = useState('');
  useEffect(() => { setDraft(inspectorValues(item)); }, [item]);
  const fields = inspectorFields(item);
  const apply = () => {
    const result = parseInspectorEdit(item, draft);
    if (result.error !== undefined) { setNotice(result.error); return; }
    const error = onApply(result.edit);
    setNotice(error ?? 'Applied.');
  };
  return <View style={styles.panel}>
    <Text style={styles.title}>{target ? 'BASIC' : 'GEOMETRY'}</Text>

    <Text style={styles.hint}>{target ? 'Position, rotation and dimensions (yards)' : 'Position, length, angle and height (yards)'}</Text>
    <View style={styles.fields}>{fields.filter(f => !['z', 'thickness'].includes(f.key)).map(({ key, label }) => {
      const parsed = key === 'rotation' ? null : parseYards(draft[key]);
      return <View style={styles.field} key={key}>
        <Text>{key === 'rotation' && (item.type === 'wall' || item.type === 'faultLine') ? 'Angle (degrees)' : label}{key === 'rotation' ? '' : ' (yards)'}</Text>
        <TextInput accessibilityLabel={label} editable={!disabled} value={draft[key]}
          autoCorrect={false} autoCapitalize="none" style={styles.input}
          onChangeText={(text) => { setDraft((current) => ({ ...current, [key]: text })); setNotice(''); }} />
        {parsed !== null && <Text style={styles.hint}>{formatYards(parsed)}</Text>}
      </View>;
    })}</View>
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={apply} style={styles.button}><Text style={styles.buttonText}>Apply changes</Text></Pressable>
    {target && advancedContent && <><Text style={styles.title}>PLANNING</Text>{advancedContent}</>}
    {target && <><Text style={styles.title}>TARGET</Text><Text>{item.type === 'noShootTarget' ? 'No-shoot' : 'Scoring target'}</Text></>}
    {(item.type === 'cardboardTarget' || item.type === 'noShootTarget') && <View><Text>Face cuts / material removed</Text><View style={styles.fields}>{facePresets.map(({ preset, label }) => <Pressable key={preset} accessibilityRole="button" accessibilityState={{ selected: item.faceCut.preset === preset, disabled }} disabled={disabled} style={[styles.button, item.faceCut.preset === preset && { backgroundColor: colors.selected }]} onPress={() => setNotice(onApply({ faceCut: { kind: 'preset', preset } }) ?? 'Physical preset applied.')}><Text style={styles.buttonText}>{label}</Text></Pressable>)}</View></View>}
    {target && <><Text style={styles.title}>PRESET INFO</Text><Text>Family: {'targetFamily' in item ? item.targetFamily : 'Custom'}</Text><Text>Preset: {preset?.name ?? 'Custom'}</Text><Text>{preset?.verification ?? 'Unverified'}{preset ? ' / ' + preset.reference + '\n' + preset.source : ''}</Text><Text>Editing dimensions creates a custom-sized instance.</Text></>}
    {item.type === 'wall' && <><Text style={styles.title}>PORTS</Text><Text>{item.ports.length} openings</Text><Pressable accessibilityRole="button" accessibilityState={{ expanded: portsOpen }} onPress={() => setPortsOpen(!portsOpen)} style={styles.button}><Text>{portsOpen ? 'Close Ports' : 'Edit Ports >'}</Text></Pressable>{portsOpen && <WallPortsInspector wall={item} disabled={disabled} onApply={onApply} />}</>}
    {(item.type === 'wall' || item.type === 'faultLine') && <Text>Length and angle edits keep the start endpoint fixed. Drag endpoint handles on the canvas.</Text>}
    {fields.some(f => ['z', 'thickness'].includes(f.key)) && <><Pressable accessibilityRole="button" accessibilityState={{ expanded: advanced }} onPress={() => setAdvanced(!advanced)} style={styles.button}><Text>ADVANCED {advanced ? '-' : '+'}</Text></Pressable>{advanced && <><View style={styles.fields}>{fields.filter(f => ['z', 'thickness'].includes(f.key)).map(({ key, label }) => <View style={styles.field} key={key}><Text>{label} (yards)</Text><TextInput accessibilityLabel={label} editable={!disabled} value={draft[key]} style={styles.input} onChangeText={text => { setDraft(current => ({ ...current, [key]: text })); setNotice(''); }} /></View>)}</View><Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={apply} style={styles.button}><Text>Apply changes</Text></Pressable></>}</>}
    {notice !== '' && <Text accessibilityLiveRegion="polite">{notice}</Text>}
  </View>;
}
const styles = StyleSheet.create({
  panel: { paddingHorizontal: 16, paddingVertical: 12, gap: 10, backgroundColor: colors.panel },
  title: { ...typography.section, color: colors.text }, fields: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  field: { minWidth: 120, flexGrow: 1, flexBasis: '40%' },
  input: { borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.secondary, padding: 8, minHeight: 44, color: colors.text, borderRadius: 2 },
  hint: { fontSize: 12, color: colors.muted }, button: { backgroundColor: colors.secondary, padding: 12, minHeight: 44, minWidth: 44, maxWidth: '100%', flexShrink: 1, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, alignSelf: 'flex-start' },
  buttonText: { color: colors.text, ...typography.label },
});
