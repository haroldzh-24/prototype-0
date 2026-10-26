import Storage from 'expo-sqlite/kv-store';
import type { ThemePreference } from './theme';

/**
 * Where the day/night choice is kept. Native: the synchronous key-value store, read before the first screen renders
 * so nothing flashes. (Web has its own file: a second SQLite database opening alongside the app's races for the
 * browser's file handles, so it uses localStorage instead.)
 */
const KEY = 'psp.theme';
export function loadThemePreference(): ThemePreference {
  try { const value = Storage.getItemSync(KEY); return value === 'day' || value === 'night' ? value : 'system'; } catch { return 'system'; }
}
export function saveThemePreference(value: ThemePreference) {
  try { Storage.setItemSync(KEY, value); } catch { /* the choice still applies for this session */ }
}
