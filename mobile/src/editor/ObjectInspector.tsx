import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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
