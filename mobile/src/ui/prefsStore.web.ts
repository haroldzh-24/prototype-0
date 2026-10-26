/** Web: localStorage, so the app's SQLite database is the only one opened (see prefsStore.ts). */
export function readPref(key: string): string | null {
  try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
}
export function writePref(key: string, value: string) {
  try { globalThis.localStorage?.setItem(key, value); } catch { /* private mode or blocked storage: the value still applies */ }
}
