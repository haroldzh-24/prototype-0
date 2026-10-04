import { targetPreset } from '../stage/targetPresets';
import { colors, typography } from '../ui/tokens';
import { facePresets } from '@/stage/targetFace';
import WallPortsInspector from './WallPortsInspector';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Text from '@/editor/FieldText';
import { objectLabel } from '@/stage/model';
import type { StageObject } from '@/stage/model';
import type { ObjectEdit } from '@/stage/operations';
import { formatYards, parseYards } from '@/stage/measurements';

import { inspectorValues, inspectorFields, parseInspectorEdit } from './inspectorFields';

export default function ObjectInspector({ item, disabled, onApply, advancedContent }: {
  item: StageObject; disabled: boolean; onApply: (edit: ObjectEdit) => string | null; advancedContent?: ReactNode;
}) {
  const [draft, setDraft] = useState(() => inspectorValues(item));
  const [advanced, setAdvanced] = useState(false);
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
    <Text style={styles.title}>Edit {objectLabel(item.type)}</Text>
    <Text>Position, rotation and dimensions / lengths in yards</Text>
    <View style={styles.fields}>{fields.filter(f => advanced || !['z', 'thickness'].includes(f.key)).map(({ key, label }) => {
      const parsed = key === 'rotation' ? null : parseYards(draft[key]);
      return <View style={styles.field} key={key}>
        <Text>{label}{key === 'rotation' ? '' : ' (yards)'}</Text>
        <TextInput accessibilityLabel={label} editable={!disabled} value={draft[key]}
          autoCorrect={false} autoCapitalize="none" style={styles.input}
          onChangeText={(text) => { setDraft((current) => ({ ...current, [key]: text })); setNotice(''); }} />
        {parsed !== null && <Text style={styles.hint}>{formatYards(parsed)}</Text>}
      </View>;
    })}</View>
    <Pressable accessibilityRole="button" disabled={disabled} onPress={apply} style={styles.button}><Text style={styles.buttonText}>Apply changes</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: advanced }} onPress={() => setAdvanced(!advanced)} style={styles.button}><Text>Advanced {advanced ? '-' : '+'}</Text></Pressable>
    {advanced && <>    {'targetFamily' in item && item.targetFamily && <Text>Target family: {item.targetFamily}</Text>}
    <Text>Lengths are in yards. Decimals and fractions are supported.</Text>
    <Text>Typed X/Y values are exact, subject to bounds. Target angles are normalized to 0-360 degrees.</Text>
    {'presetId' in item && item.presetId && <Text>Preset: {targetPreset(item.presetId)?.name ?? item.presetId}. Saved dimensions are retained; editing them creates a custom-sized instance.</Text>}
    {(item.type === 'wall' || item.type === 'faultLine') && <Text>Length/angle-only edits keep the start endpoint fixed. Endpoint handles are available on the canvas.</Text>}
    {(item.type === 'cardboardTarget' || item.type === 'noShootTarget') && <View>
      <Text>Physical face cut (material removed, not hidden)</Text>
      <Text>Face width/height and position describe the full-face reference. Portion presets retain one half; upper portions begin halfway above the bottom reference.</Text>
      <View style={styles.fields}>{facePresets.map(({ preset, label }) => <Pressable key={preset}
        accessibilityRole="button" accessibilityState={{ selected: item.faceCut.preset === preset, disabled }}
        disabled={disabled} style={[styles.button, item.faceCut.preset === preset && { backgroundColor: colors.selected, borderColor: colors.accent }]}
        onPress={() => setNotice(onApply({ faceCut: { kind: 'preset', preset } }) ?? 'Physical preset applied.')}>
        <Text style={styles.buttonText}>{label}</Text>
      </Pressable>)}</View>
    </View>}

    {item.type === 'wall' && <WallPortsInspector wall={item} disabled={disabled} onApply={onApply} />}
    {advancedContent}
    </>}
    {notice !== '' && <Text accessibilityLiveRegion="polite">{notice}</Text>}
  </View>;
}
const styles = StyleSheet.create({
  panel: { paddingHorizontal: 16, paddingVertical: 12, gap: 10, backgroundColor: colors.panel },
  title: { ...typography.section, color: colors.text }, fields: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  field: { minWidth: 120, flexGrow: 1, flexBasis: '40%' },
  input: { borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.secondary, padding: 8, minHeight: 44, color: colors.text, borderRadius: 2 },
  hint: { fontSize: 12, color: colors.muted }, button: { backgroundColor: colors.secondary, padding: 12, minHeight: 44, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, alignSelf: 'flex-start' },
  buttonText: { color: colors.text, ...typography.label },
});
