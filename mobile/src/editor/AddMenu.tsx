import { Modal, View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { objectPalette } from './objectActions';
import type { AddableType } from '../stage/operations';
import { Action, colors, ui } from '../ui/kit';

function Silhouette({ type }: { type: AddableType | 'start' }) {
  return <View accessible={false} style={styles.symbol}>
    {type === 'wall' ? <View style={styles.wall} /> : type === 'faultLine' ? <View style={styles.line} /> : type === 'start' ? <View style={styles.start}><View style={styles.dot} /></View> : type === 'steelPlate' ? <View style={styles.plate} /> : type === 'steelPopper' ? <><View style={styles.head} /><View style={styles.stem} /><View style={styles.foot} /></> : <>
      <View style={[styles.paperHead, type === 'noShootTarget' && styles.white]} />
      <View style={[styles.paper, type === 'noShootTarget' && styles.white]}>{type === 'noShootTarget' && <Text style={styles.cross}>X</Text>}</View>
    </>}
  </View>;
}
export default function AddMenu({ visible, close, create, selectStart }: { visible: boolean; close: () => void; create: (type: AddableType) => void; selectStart: () => void }) {
  return <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={close}>
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.header}><Text style={[ui.title, { flex: 1 }]}>Add object</Text><Action title="Close" onPress={close} /></View>
      <ScrollView contentContainerStyle={ui.screen}>
        {['TARGETS', 'STRUCTURES', 'STAGE'].map(category => <View key={category} style={{ gap: 12 }}>
          <Text style={ui.eyebrow}>{category}</Text>
          <View style={styles.tiles}>
            {objectPalette.filter(item => (item.type === 'wall' ? 'STRUCTURES' : item.type === 'faultLine' ? 'STAGE' : 'TARGETS') === category).map(item =>
              <Pressable accessibilityRole="button" accessibilityLabel={'Add ' + item.label} key={item.type} onPress={() => { close(); create(item.type); }} style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
                <Silhouette type={item.type} /><Text style={ui.actionText}>{item.label}</Text>
              </Pressable>)}
            {category === 'STAGE' && <Pressable accessibilityRole="button" accessibilityLabel="Select Start Position" onPress={() => { close(); selectStart(); }} style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
              <Silhouette type="start" /><Text style={ui.actionText}>Start position</Text><Text style={ui.copy}>Select existing</Text>
            </Pressable>}
          </View>
          {category === 'STRUCTURES' && <Text style={ui.copy}>Firing ports: add a wall, then open EDIT.</Text>}
        </View>)}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}
const styles = StyleSheet.create({
  header: { padding: 16, flexDirection: 'row', gap: 12, alignItems: 'center', borderBottomWidth: 1, borderColor: colors.border },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { width: '47%', minHeight: 132, padding: 14, gap: 10, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.panel },
  pressed: { backgroundColor: colors.selected, borderColor: colors.accent },
  symbol: { height: 64, justifyContent: 'center', alignItems: 'center' },
  wall: { width: 76, height: 40, borderWidth: 3, borderColor: colors.muted, backgroundColor: colors.border },
  line: { width: 76, height: 5, backgroundColor: colors.muted },
  start: { width: 45, height: 45, borderWidth: 2, borderColor: colors.muted, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, backgroundColor: colors.accent },
  plate: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: colors.text, backgroundColor: colors.subdued },
  head: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.text },
  stem: { width: 12, height: 23, backgroundColor: colors.text },
  foot: { width: 25, height: 5, backgroundColor: colors.text },
  paperHead: { width: 17, height: 10, backgroundColor: colors.accent },
  paper: { width: 36, height: 43, backgroundColor: colors.accent, borderTopLeftRadius: 10, borderTopRightRadius: 10, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, alignItems: 'center', justifyContent: 'center' },
  white: { backgroundColor: colors.text },
  cross: { fontSize: 22, color: colors.background, fontWeight: 'bold' },
});
