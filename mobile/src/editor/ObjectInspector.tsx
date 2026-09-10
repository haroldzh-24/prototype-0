import { facePresets } from '@/stage/targetFace';
import WallPortsInspector from './WallPortsInspector';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Text from '@/editor/FieldText';
import { objectLabel } from '@/stage/model';
import type { StageObject } from '@/stage/model';
import type { ObjectEdit } from '@/stage/operations';
import { formatLength, parseLength } from '@/stage/measurements';

import { inspectorValues, inspectorFields, parseInspectorEdit } from './inspectorFields';

export default function ObjectInspector({ item, disabled, onApply }: {
  item: StageObject; disabled: boolean; onApply: (edit: ObjectEdit) => string | null;
}) {
  const [draft, setDraft] = useState(() => inspectorValues(item));
  const [notice, setNotice] = useState('');
  useEffect(() => { setDraft(inspectorValues(item)); }, [item]);
  const fields = inspectorFields(item);
  const apply = () => {
    const result = parseInspectorEdit(item, draft);
    if (result.error !== undefined) { setNotice(result.error); return; }
    const error = onApply(result.edit);
    setNotice(error ?? 'Applied. Positions adjust inward when needed to fit the stage.');
  };
  return <View style={styles.panel}>
    <Text style={styles.title}>Edit {objectLabel(item.type)}</Text>
    <Text>Lengths: enter inches, or feet/inches such as 5' 6". Fractions such as 6 1/2 are supported.</Text>
    <Text>Typed X/Y values are exact, subject to bounds. Rotation uses the current snap setting.</Text>
    {(item.type === 'cardboardTarget' || item.type === 'noShootTarget') && <View>
      <Text>Physical face cut (material removed, not hidden)</Text>
      <Text>Face width/height and position describe the full-face reference. Portion presets retain one half; upper portions begin halfway above the bottom reference.</Text>
      <View style={styles.fields}>{facePresets.map(({ preset, label }) => <Pressable key={preset}
        accessibilityRole="button" accessibilityState={{ selected: item.faceCut.preset === preset, disabled }}
        disabled={disabled} style={[styles.button, item.faceCut.preset === preset && { backgroundColor: '#60b5bc' }]}
        onPress={() => setNotice(onApply({ faceCut: { kind: 'preset', preset } }) ?? 'Physical preset applied.')}>
        <Text style={styles.buttonText}>{label}</Text>
      </Pressable>)}</View>
    </View>}
    <View style={styles.fields}>{fields.map(({ key, label }) => {
      const parsed = key === 'rotation' ? null : parseLength(draft[key]);
      return <View style={styles.field} key={key}>
        <Text>{label}{key === 'rotation' ? '' : ' (in)'}</Text>
        <TextInput accessibilityLabel={label} editable={!disabled} value={draft[key]}
          autoCorrect={false} autoCapitalize="none" style={styles.input}
          onChangeText={(text) => { setDraft((current) => ({ ...current, [key]: text })); setNotice(''); }} />
        {parsed !== null && <Text style={styles.hint}>{formatLength(parsed)}</Text>}
      </View>;
    })}</View>
    <Pressable accessibilityRole="button" disabled={disabled} onPress={apply} style={styles.button}><Text style={styles.buttonText}>Apply changes</Text></Pressable>
    {item.type === 'wall' && <WallPortsInspector wall={item} disabled={disabled} onApply={onApply} />}
    {notice !== '' && <Text accessibilityLiveRegion="polite">{notice}</Text>}
  </View>;
}
const styles = StyleSheet.create({
  panel: { marginTop: 8, padding: 10, gap: 6, backgroundColor: '#1c261e', borderWidth: 1, borderColor: '#465044', borderRadius: 2 },
  title: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: '#d0b368', fontWeight: 'bold' }, fields: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  field: { minWidth: 120, flexGrow: 1, flexBasis: '40%' },
  input: { borderWidth: 1, borderColor: '#465044', backgroundColor: '#151d17', padding: 8, minHeight: 44, color: '#e1e5db', borderRadius: 2 },
  hint: { fontSize: 12, color: '#a6b0a0' }, button: { backgroundColor: '#252e27', padding: 12, minHeight: 44, borderWidth: 1, borderColor: '#465044', borderRadius: 2, alignSelf: 'flex-start' },
  buttonText: { color: '#e1e5db', fontSize: 11, textTransform: 'uppercase' },
});
