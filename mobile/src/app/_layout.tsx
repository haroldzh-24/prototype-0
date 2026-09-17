import { DarkTheme, ThemeProvider, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StorageProvider } from '@/storage/StorageProvider';
export default function Layout() {
  return <ThemeProvider value={DarkTheme}><StatusBar style="light" /><StorageProvider>
    <Stack screenOptions={{ headerStyle: { backgroundColor: '#101411' }, headerTintColor: '#e1e5db', contentStyle: { backgroundColor: '#101411' } }}>
      <Stack.Screen name="index" options={{ title: 'HOME' }} />
      <Stack.Screen name="planner" options={{ title: 'STAGE PLANNER' }} />
      <Stack.Screen name="saved-stages" options={{ title: 'SAVED STAGES' }} />
      <Stack.Screen name="builder" options={{ title: 'STAGE BUILDER' }} />
      <Stack.Screen name="training" options={{ title: 'TRAINING' }} />
      <Stack.Screen name="account" options={{ title: 'ACCOUNT' }} />
    </Stack>
  </StorageProvider></ThemeProvider>;
}
