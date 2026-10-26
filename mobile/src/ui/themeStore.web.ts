import type { ThemePreference } from './theme';

/** Web: localStorage, so the app's SQLite database is the only one opened (see themeStore.ts). */
const KEY = 'psp.theme';
export function loadThemePreference(): ThemePreference {
  try { const value = globalThis.localStorage?.getItem(KEY); return value === 'day' || value === 'night' ? value : 'system'; } catch { return 'system'; }
}
export function saveThemePreference(value: ThemePreference) {
  try { globalThis.localStorage?.setItem(KEY, value); } catch { /* private mode or blocked storage: the choice still applies */ }
}
