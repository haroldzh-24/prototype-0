import { Modal, View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { objectPalette } from './objectActions';
import type { AddableType } from '../stage/operations';
import { Action, colors, ui } from '../ui/kit';
const icons: Record<AddableType, string> = { cardboardTarget: '⬟', noShootTarget: '⊗', steelPlate: '●', steelPopper: '♟', wall: '▰', faultLine: '━' };
export default function AddMenu({ visible, close, create, selectStart }: { visible: boolean; close: () => void; create: (type: AddableType) => void; selectStart: () => void }) {
  return <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={close}><SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><ScrollView contentContainerStyle={ui.screen}>
    <Text style={ui.title}>ADD OBJECT</Text><Action title="Close" onPress={close} />
    {['TARGETS', 'STRUCTURES'].map(category => <View key={category} style={{ gap: 12 }}><Text style={ui.eyebrow}>{category}</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      {objectPalette.filter(item => (['wall', 'faultLine'].includes(item.type) ? 'STRUCTURES' : 'TARGETS') === category).map(item => <Pressable accessibilityRole="button" accessibilityLabel={'Add ' + item.label} key={item.type} onPress={() => { close(); create(item.type); }} style={[ui.panel, { width: '47%', minHeight: 130, alignItems: 'center' }]}><Text style={{ color: item.type === 'cardboardTarget' ? '#bc945c' : colors.text, fontSize: 40 }}>{icons[item.type]}</Text><Text style={ui.actionText}>{item.label.toUpperCase()}</Text></Pressable>)}
    </View></View>)}
    <Text style={ui.eyebrow}>STAGE</Text><Action title="◎ Start Position · Select existing" onPress={() => { close(); selectStart(); }} /><Text style={ui.copy}>Each stage has one required start. Select it to move or edit it. Add firing ports through a wall’s inspector.</Text>
  </ScrollView></SafeAreaView></Modal>;
}
