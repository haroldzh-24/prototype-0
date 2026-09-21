import { StyleSheet, View } from 'react-native';
import { colors } from './tokens';

export type ToolIconName = 'add' | 'edit' | 'route' | 'plan' | 'view' | 'position' | 'targets' | 'reload' | 'summary' | 'exit';
/** Original small line symbols; decorative only, labels name the actions. */
export default function ToolIcon({ name, active = false }: { name: ToolIconName; active?: boolean }) {
  const color = active ? colors.accent : colors.muted;
  const stroke = { backgroundColor: color };
  return <View accessible={false} pointerEvents="none" style={styles.icon}>
    {name === 'add' || name === 'position' ? <>
      <View style={[styles.horizontal, stroke]} /><View style={[styles.vertical, stroke]} />
      {name === 'position' && <View style={[styles.box, { borderColor: color }]} />}
    </> : name === 'edit' ? <>
      <View style={[styles.pencil, stroke]} /><View style={[styles.baseline, stroke]} />
    </> : name === 'route' ? <>
      <View style={[styles.diagonal, stroke]} />
      <View style={[styles.dot, { left: 2, bottom: 2, borderColor: color }]} /><View style={[styles.dot, { right: 2, top: 2, borderColor: color }]} />
    </> : name === 'view' || name === 'targets' ? <>
      <View style={[styles.box, { borderColor: color, borderRadius: name === 'targets' ? 9 : 0 }]} />
      <View style={[styles.center, stroke]} />
    </> : name === 'reload' ? <>
      <View style={[styles.box, { borderColor: color, borderRadius: 9, borderRightColor: 'transparent' }]} />
      <View style={[styles.arrow, { borderColor: color }]} />
    </> : name === 'exit' ? <>
      <View style={[styles.horizontal, stroke]} /><View style={[styles.exitArrow, { borderColor: color }]} />
    </> : <>
      {[0, 1, 2].map(i => <View key={i} style={[styles.bar, stroke, { left: 3 + i * 6, height: 6 + i * 5 }]} />)}
    </>}
  </View>;
}
const styles = StyleSheet.create({
  icon: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  horizontal: { position: 'absolute', width: 16, height: 1.5 },
  vertical: { position: 'absolute', width: 1.5, height: 16 },
  box: { position: 'absolute', width: 18, height: 18, borderWidth: 1.5 },
  center: { width: 4, height: 4, borderRadius: 2 },
  pencil: { width: 2, height: 17, transform: [{ rotate: '40deg' }] },
  baseline: { position: 'absolute', bottom: 1, width: 17, height: 1.5 },
  diagonal: { width: 1.5, height: 17, transform: [{ rotate: '40deg' }] },
  dot: { position: 'absolute', width: 6, height: 6, borderRadius: 3, borderWidth: 1.5, backgroundColor: colors.panel },
  arrow: { position: 'absolute', right: 0, top: 4, width: 6, height: 6, borderRightWidth: 1.5, borderBottomWidth: 1.5 },
  exitArrow: { position: 'absolute', left: 3, width: 8, height: 8, borderLeftWidth: 1.5, borderBottomWidth: 1.5, transform: [{ rotate: '45deg' }] },
  bar: { position: 'absolute', bottom: 2, width: 3 },
});
