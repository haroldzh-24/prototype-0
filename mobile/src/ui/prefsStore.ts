import Storage from 'expo-sqlite/kv-store';

/**
 * Small device preferences (day/night choice, eye height). Native: the synchronous key-value store, read before the
 * first screen renders so nothing flashes. Web has its own file: a second SQLite database opening alongside the
 * app's races for the browser's file handles, so it uses localStorage instead.
 */
export function readPref(key: string): string | null {
  try { return Storage.getItemSync(key); } catch { return null; }
}
export function writePref(key: string, value: string) {
  try { Storage.setItemSync(key, value); } catch { /* the value still applies for this session */ }
}
