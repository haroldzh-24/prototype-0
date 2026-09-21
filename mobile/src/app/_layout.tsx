import { DarkTheme, ThemeProvider, Stack } from 'expo-router';
import { colors } from '../ui/tokens';
import { StatusBar } from 'expo-status-bar';
import { StorageProvider } from '@/storage/StorageProvider';
export default function Layout() {
  return <ThemeProvider value={DarkTheme}><StatusBar style="light" /><StorageProvider>
    <Stack screenOptions={{ headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.text, contentStyle: { backgroundColor: '#090B0C' } }}>
      <Stack.Screen name="index" options={{ title: 'Home' }} />
      <Stack.Screen name="planner" options={{ title: 'Stage planner' }} />
      <Stack.Screen name="saved-stages" options={{ title: 'Saved stages' }} />
      <Stack.Screen name="builder" options={{ title: 'Stage builder', headerShown: false, gestureEnabled: false, fullScreenGestureEnabled: false }} />
      <Stack.Screen name="training" options={{ title: 'Training' }} />
      <Stack.Screen name="account" options={{ title: 'Account' }} />
    </Stack>
  </StorageProvider></ThemeProvider>;
}
