import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { StageObject } from '@/stage/model';
import type { ObjectEdit } from '@/stage/operations';
import { formatLength, parseLength } from '@/stage/measurements';

type Field = 'x' | 'y' | 'rotation' | 'width' | 'depth' | 'height' | 'z' | 'length' | 'thickness';
const values = (item: StageObject): Record<Field, string> => ({
  x: String(item.position.x), y: String(item.position.y), z: String(item.position.z),
  rotation: String(item.rotation), width: '', depth: '', height: '', length: '', thickness: '',
  ...Object.fromEntries(Object.entries(item.geometry).map(([key, value]) => [key, String(value)])),
});
export default function ObjectInspector({ item, disabled, onApply }: {
  item: StageObject; disabled: boolean; onApply: (edit: ObjectEdit) => string | null;
}) {
  const [draft, setDraft] = useState(() => values(item));
  const [notice, setNotice] = useState('');
  useEffect(() => { setDraft(values(item)); }, [item]);
  const fields: { key: Field; label: string }[] = [
    { key: 'x', label: 'X' }, { key: 'y', label: 'Y' }, { key: 'rotation', label: 'Rotation (degrees)' },
    ...(item.type === 'wall' ? [{ key: 'length' as const, label: 'Length' }, { key: 'thickness' as const, label: 'Thickness' }]
      : item.type === 'faultLine' ? [{ key: 'length' as const, label: 'Length' }]
      : [{ key: 'width' as const, label: 'Width' }, { key: 'depth' as const, label: 'Depth' }]),
    ...(item.type === 'start' || item.type === 'faultLine' ? [] : [{ key: 'height' as const, label: 'Height' }, { key: 'z' as const, label: 'Bottom elevation' }]),
  ];
  const apply = () => {
    const edit: ObjectEdit = {};
    const original = values(item);
    for (const { key, label } of fields) {
      const text = draft[key].trim();
      const value = key === 'rotation' ? (text === '' ? null : Number(text)) : parseLength(text);
      if (value === null || !Number.isFinite(value)) { setNotice('Enter a valid measurement for ' + label + '.'); return; }
      if (draft[key] === original[key]) continue;
      if (key === 'rotation') edit.rotation = value;
      else if (key === 'x' || key === 'y' || key === 'z') edit.position = { ...edit.position, [key]: value };
      else edit.geometry = { ...edit.geometry, [key]: value };
    }
    const error = onApply(edit);
    setNotice(error ?? 'Applied. Positions adjust inward when needed to fit the stage.');
  };
  return <View style={styles.panel}>
    <Text style={styles.title}>Edit {item.type === 'start' ? 'start position' : item.type === 'faultLine' ? 'fault line' : item.type}</Text>
    <Text>Lengths: enter inches, or feet/inches such as 5' 6". Fractions such as 6 1/2 are supported.</Text>
    <Text>Typed X/Y values are exact, subject to bounds. Rotation uses the current snap setting.</Text>
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
    {notice !== '' && <Text accessibilityLiveRegion="polite">{notice}</Text>}
  </View>;
}
const styles = StyleSheet.create({
  panel: { marginTop: 16, padding: 12, gap: 8, borderWidth: 1, borderColor: '#98a5af', borderRadius: 6 },
  title: { fontSize: 18, fontWeight: 'bold' }, fields: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  field: { minWidth: 120, flexGrow: 1, flexBasis: '40%' },
  input: { borderWidth: 1, borderColor: '#788894', backgroundColor: 'white', padding: 8, borderRadius: 4 },
  hint: { fontSize: 12, color: '#5f6b76' }, button: { backgroundColor: '#33424f', padding: 12, borderRadius: 4, alignSelf: 'flex-start' },
  buttonText: { color: 'white' },
});
