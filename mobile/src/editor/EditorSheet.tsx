import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Action, ui } from '../ui/kit';
import { borders, themed } from '../ui/tokens';

/** Scrolling belongs to the modal, never to the canvas beneath it. */
export default function EditorSheet({ title, visible, close, children, footer, scrollKey }: {
  title: string; visible: boolean; close: () => void; children: ReactNode; footer?: ReactNode;
  /** Changing it starts the content again at the top (a sheet that switches between steps). */
  scrollKey?: string;
}) {
  return <Modal visible={visible} transparent animationType="none" onRequestClose={close}>
    <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Dismiss panel" onPress={close} />
      <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.sheet} accessibilityViewIsModal onAccessibilityEscape={close}>
        <View style={styles.header}><Text accessibilityRole="header" style={[ui.title, { flex: 1, flexShrink: 1, fontSize: 24, lineHeight: 28 }]}>{title.toUpperCase()}</Text><Action title="Done" onPress={close} /></View>
        <ScrollView key={scrollKey} style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.content}>{children}</ScrollView>
        {footer}
      </SafeAreaView>
    </KeyboardAvoidingView>
  </Modal>;
}
const styles = themed(c => ({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#0009' },
  sheet: { maxHeight: '85%', backgroundColor: c.panel, borderTopWidth: 4, borderColor: c.border },
  header: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12, borderBottomWidth: borders.regular, borderColor: c.border },
  content: { paddingHorizontal: 0, gap: 12, paddingBottom: 24 },
}));
