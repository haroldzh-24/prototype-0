import { useEffect, useState } from 'react';
import { dayPalette, nightPalette, setActivePalette } from './tokens';

/**
 * Day / night theme. The preference (system, day or night) is chosen on the Profile screen and saved by the root
 * layout; this module only holds the current state and notifies subscribers, so it has no native dependencies.
 */
export type ThemeMode = 'day' | 'night';
export type ThemePreference = 'system' | 'day' | 'night';

let preference: ThemePreference = 'system';
let systemMode: ThemeMode = 'day';
let mode: ThemeMode = 'day';
const listeners = new Set<() => void>();

/** Night when chosen, or when following a system that is dark. */
export const resolveMode = (pref: ThemePreference, system: ThemeMode): ThemeMode => pref === 'system' ? system : pref;

function apply() {
  const next = resolveMode(preference, systemMode);
  setActivePalette(next === 'night' ? nightPalette : dayPalette);
  if (next !== mode) { mode = next; }
  listeners.forEach(listener => listener());
}
export const themeMode = () => mode;
export const themePreference = () => preference;
export function setThemePreference(next: ThemePreference) { if (next !== preference) { preference = next; apply(); } }
export function setSystemMode(next: ThemeMode) { if (next !== systemMode) { systemMode = next; apply(); } }
/** Subscribe to any change (mode or preference). Returns an unsubscribe function. */
export function onThemeChange(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

/**
 * Re-renders the calling component when the theme changes and returns the current mode. Call it in every screen (and
 * in memoized components) so a switch restyles the screen in place without losing its state.
 */
export function useThemeMode(): ThemeMode {
  const [, setVersion] = useState(0);
  useEffect(() => onThemeChange(() => setVersion(v => v + 1)), []);
  return mode;
}
