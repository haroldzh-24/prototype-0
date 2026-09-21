import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Action, colors, ui } from '../ui/kit';

/** Scrolling belongs to the modal, never to the canvas beneath it. */
export default function EditorSheet({ title, visible, close, children }: {
  title: string; visible: boolean; close: () => void; children: ReactNode;
}) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
    <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Dismiss panel" onPress={close} />
      <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.sheet} accessibilityViewIsModal onAccessibilityEscape={close}>
        <View style={styles.header}><Text accessibilityRole="header" style={[ui.title, { flex: 1, fontSize: 18 }]}>{title}</Text><Action title="Done" onPress={close} /></View>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.content}>{children}</ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  </Modal>;
}
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#0009' },
  sheet: { maxHeight: '85%', backgroundColor: colors.panel, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  header: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  content: { paddingHorizontal: 0, gap: 12, paddingBottom: 24 },
});
