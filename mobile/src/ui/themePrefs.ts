import { readPref, writePref } from './prefsStore';
import type { ThemePreference } from './theme';

/** The saved day/night choice (System when nothing is saved). Kept apart from theme.ts so that stays dependency-free. */
const THEME_KEY = 'psp.theme';
export function loadThemePreference(): ThemePreference {
  const value = readPref(THEME_KEY);
  return value === 'day' || value === 'night' ? value : 'system';
}
export const saveThemePreference = (value: ThemePreference) => writePref(THEME_KEY, value);
