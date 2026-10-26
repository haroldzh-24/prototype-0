import { useEffect, useState } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import { DarkTheme, DefaultTheme, ThemeProvider, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
// One import per weight, so only these five font files are bundled (the package index pulls in all 36).
import { Barlow_500Medium } from '@expo-google-fonts/barlow/500Medium';
import { Barlow_600SemiBold } from '@expo-google-fonts/barlow/600SemiBold';
import { Barlow_700Bold } from '@expo-google-fonts/barlow/700Bold';
import { BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed/700Bold';
import { BarlowCondensed_800ExtraBold } from '@expo-google-fonts/barlow-condensed/800ExtraBold';
import { colors } from '../ui/tokens';
import { onThemeChange, setSystemMode, setThemePreference, themePreference, useThemeMode } from '../ui/theme';
import { loadThemePreference, saveThemePreference } from '../ui/themeStore';
import { StorageProvider } from '@/storage/StorageProvider';

export default function Layout() {
  // Restore the saved choice and the phone's appearance before the first screen renders, so nothing flashes.
  useState(() => { setSystemMode(Appearance.getColorScheme() === 'dark' ? 'night' : 'day'); setThemePreference(loadThemePreference()); return true; });
  const system = useColorScheme();
  useEffect(() => { setSystemMode(system === 'dark' ? 'night' : 'day'); }, [system]);
  useEffect(() => onThemeChange(() => saveThemePreference(themePreference())), []);
  const mode = useThemeMode();
  const [fontsLoaded, fontError] = useFonts({ Barlow_500Medium, Barlow_600SemiBold, Barlow_700Bold, BarlowCondensed_700Bold, BarlowCondensed_800ExtraBold });
  if (!fontsLoaded && !fontError) return null; // local font files: a moment under the splash screen; system font if they fail
  const base = mode === 'night' ? DarkTheme : DefaultTheme;
  const navigation = { ...base, colors: { ...base.colors, background: colors.background, card: colors.background, text: colors.text, border: colors.border, primary: colors.accent } };
  return <ThemeProvider value={navigation}><StatusBar style={mode === 'night' ? 'light' : 'dark'} /><StorageProvider>
    <Stack screenOptions={{ headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.text, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="index" options={{ title: 'Home', headerShown: false }} />
      <Stack.Screen name="planner" options={{ title: 'Matches', headerShown: false }} />
      <Stack.Screen name="match" options={{ title: 'Stages', headerShown: false }} />
      <Stack.Screen name="saved-stages" options={{ title: 'Saved stages' }} />
      <Stack.Screen name="builder" options={{ title: 'Stage builder', headerShown: false, gestureEnabled: false, fullScreenGestureEnabled: false }} />
      <Stack.Screen name="training" options={{ title: 'Training', headerShown: false }} />
      <Stack.Screen name="account" options={{ title: 'Profile', headerShown: false }} />
    </Stack>
  </StorageProvider></ThemeProvider>;
}
