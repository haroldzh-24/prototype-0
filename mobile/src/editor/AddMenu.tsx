import { Modal, View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Action, colors, ui } from '../ui/kit';
import { useEffect, useState } from 'react';
import type { TargetFamily } from '../stage/targetFamily';
import TargetFamilyPicker from '../ui/TargetFamilyPicker';
import { presetsForFamily } from '../stage/targetPresets';
import { formatYards } from '../stage/measurements';
import Text from './FieldText';
export default function AddMenu({ visible, close, choose, selectStart, targetFamily }: { visible: boolean; close: () => void; choose: (id: string, noShoot: boolean) => void; selectStart: () => void; targetFamily: TargetFamily }) {
  const [family, setFamily] = useState(targetFamily), [noShoot, setNoShoot] = useState(false);
  useEffect(() => { if (visible) { setFamily(targetFamily); setNoShoot(false); } }, [visible, targetFamily]);
  return <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={close}>
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: 16, flexDirection: 'row', alignItems: 'center' }}><Text style={[ui.title, { flex: 1 }]}>Add Target</Text><Action title="Close" onPress={close} /></View>
      <ScrollView contentContainerStyle={ui.screen}>
        <Text>Match default: {targetFamily}. Choose a preset, then tap the stage repeatedly.</Text>
        <TargetFamilyPicker value={family} onChange={setFamily} />
        <Action title={'Paper role: ' + (noShoot ? 'No-shoot' : 'Scoring target')} onPress={() => setNoShoot(v => !v)} />
        {presetsForFamily(family).map(preset => <View key={preset.id} style={ui.panel}>
          <Action title={preset.name} onPress={() => { choose(preset.id, noShoot && preset.type === 'cardboardTarget'); close(); }} />
          <Text>{formatYards(preset.width)} × {formatYards(preset.height)} / {preset.verification}</Text>
          <Text style={ui.copy}>{preset.reference}</Text>
        </View>)}
        <Action title="Select Start Position" onPress={() => { close(); selectStart(); }} />
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}
