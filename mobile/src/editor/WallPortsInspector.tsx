import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Text from '@/editor/FieldText';
import { uuid } from 'expo-modules-core';
import type { FiringPort, StageObject } from '@/stage/model';
import type { ObjectEdit } from '@/stage/operations';
import { createPortId } from '@/stage/ids';
import { createPort, parsePortDraft, portFields, portValues } from '@/stage/ports';

export default function WallPortsInspector({ wall, disabled, onApply }: {
  wall: Extract<StageObject, { type: 'wall' }>; disabled: boolean; onApply: (edit: ObjectEdit) => string | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const selected = wall.ports.find(port => port.id === selectedId) ?? wall.ports[0];
  const add = () => {
    const port = createPort(wall.geometry, createPortId(uuid.v4));
    const error = onApply({ ports: [...wall.ports, port] });
    setNotice(error ?? 'Port added.');
    if (!error) setSelectedId(port.id);
  };
  const remove = () => {
    if (!selected) return;
    const error = onApply({ ports: wall.ports.filter(port => port.id !== selected.id) });
    setNotice(error ?? 'Port removed.');
    if (!error) setSelectedId(null);
  };
  return <View style={styles.panel}>
    <Text style={styles.title}>Firing ports ({wall.ports.length})</Text>
    <Text>Offset is the opening center from the wall center. Negative is toward the local left end. Sill is above the wall bottom. All lengths are in inches; feet/inches and fractions are supported.</Text>
    <View style={styles.row}>
      <Control title="Add Port" disabled={disabled} onPress={add} />
      <Control title="Remove Port" disabled={disabled || !selected} onPress={remove} />
    </View>
    <View style={styles.row}>{wall.ports.map((port, index) => <Pressable key={port.id}
      accessibilityRole="button" accessibilityState={{ selected: selected?.id === port.id, disabled }} disabled={disabled}
      onPress={() => { setSelectedId(port.id); setNotice(''); }} style={[styles.button, selected?.id === port.id && styles.selected]}>
      <Text style={styles.buttonText}>Port {index + 1}</Text>
    </Pressable>)}</View>
    {selected && <PortForm key={selected.id} port={selected} disabled={disabled} onApply={port => {
      const error = onApply({ ports: wall.ports.map(current => current.id === port.id ? port : current) });
      setNotice(error ?? 'Port updated.');
    }} onError={setNotice} />}
    {notice !== '' && <Text accessibilityLiveRegion="polite">{notice}</Text>}
  </View>;
}

function PortForm({ port, disabled, onApply, onError }: {
  port: FiringPort; disabled: boolean; onApply: (port: FiringPort) => void; onError: (error: string) => void;
}) {
  const [draft, setDraft] = useState(() => portValues(port));
  useEffect(() => setDraft(portValues(port)), [port]);
  return <View style={styles.panel}>
    <View style={styles.row}>{portFields.map(({ key, label }) => <View key={key} style={styles.field}>
      <Text>{label} (in)</Text>
      <TextInput accessibilityLabel={label} editable={!disabled} value={draft[key]} autoCorrect={false} autoCapitalize="none"
        style={styles.input} onChangeText={text => { setDraft(current => ({ ...current, [key]: text })); onError(''); }} />
    </View>)}</View>
    <Control title="Apply Port Changes" disabled={disabled} onPress={() => {
      const result = parsePortDraft(port, draft);
      if (result.error !== undefined) onError(result.error);
      else onApply(result.port);
    }} />
  </View>;
}
function Control({ title, disabled, onPress }: { title: string; disabled: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={[styles.button, disabled && { opacity: 0.4 }]}><Text style={styles.buttonText}>{title}</Text></Pressable>;
}
const styles = StyleSheet.create({
  panel: { gap: 8, marginTop: 12 }, title: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: '#d0b368', fontWeight: 'bold' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, field: { flexBasis: '40%', flexGrow: 1, minWidth: 120 },
  input: { borderWidth: 1, borderColor: '#465044', backgroundColor: '#151d17', padding: 8, minHeight: 44, color: '#e1e5db', borderRadius: 2 },
  button: { backgroundColor: '#252e27', padding: 10, minHeight: 44, borderWidth: 1, borderColor: '#465044', borderRadius: 2, alignSelf: 'flex-start' },
  selected: { backgroundColor: '#60b5bc' }, buttonText: { color: '#e1e5db', fontSize: 11, textTransform: 'uppercase' },
});
