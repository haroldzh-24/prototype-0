import type { ImageStyle, TextStyle, ViewStyle } from 'react-native';

/**
 * Design tokens for the outdoor high-contrast look, in a day and a night palette (every text colour is at least 4.5:1
 * on every surface it is used on; checked when the palettes were made). Stage materials follow the approved plan look:
 * ink walls, orange ports, tan cardboard, on a white canvas by day and a near-black one at night.
 *
 * `colors` always reads the active palette, so components pick up a theme switch the next time they render.
 * Screens subscribe with `useThemeMode()` (ui/theme.ts) so a switch re-renders them in place.
 */
export type Palette = {
  background: string; panel: string; secondary: string; selected: string;
  /** Strong outlines (buttons, cards). */ border: string;
  /** Quiet separators. */ hairline: string;
  text: string; muted: string; subdued: string;
  /** Route blue: selection, plan lines, links. */ accent: string; onAccent: string;
  /** Range orange: the one primary action per screen. */ primary: string; onPrimary: string;
  danger: string; onDanger: string;
  /** Text-safe warning colour. */ warning: string;
  /** Caution fill for assumptions (use onCaution text). */ caution: string; onCaution: string;
  movement: string; grid: string; gridMinor: string;
  /** Plan canvas ground, its ink (walls, outlines), and the area around the bay. */ canvas: string; ink: string; offStage: string;
  /** Stage materials on the plan: wall fill, port opening, fault line, start box. */
  wall: string; port: string; faultLine: string; startFill: string;
  /** Target faces: cardboard, steel, IDPA/USPSA white no-shoot, PCSL red no-shoot, and their outline. */
  cardboard: string; steel: string; noShoot: string; noShootRed: string; faceEdge: string;
  /** Editing handles and snap guides. */ handle: string;
  /** Review states: detected by the app (unconfirmed) and suggested (needs a look). */ detected: string; suggested: string;
  /** 3D view: sky, ground, and a mid-tone wall so lighting shows its faces. */ sky: string; ground3d: string; wall3d: string;
};

export const dayPalette: Palette = {
  background: '#FFFFFF', panel: '#FFFFFF', secondary: '#FFFFFF', selected: '#E5ECFF', border: '#0A0A0A', hairline: '#C9C9C9',
  text: '#0A0A0A', muted: '#3D3D3D', subdued: '#595959', accent: '#0040E0', onAccent: '#FFFFFF', primary: '#FF6A13', onPrimary: '#0A0A0A',
  danger: '#C8102E', onDanger: '#FFFFFF', warning: '#7A4A00', caution: '#FFD400', onCaution: '#0A0A0A', movement: '#00703C',
  grid: '#BDBDBD', gridMinor: '#E4E4E4', canvas: '#FFFFFF', ink: '#0A0A0A', offStage: '#E9E9E9',
  wall: '#0A0A0A', port: '#FF6A13', faultLine: '#0A0A0A', startFill: '#FFFFFF',
  cardboard: '#C9A266', steel: '#D3D8DC', noShoot: '#FFFFFF', noShootRed: '#E65959', faceEdge: '#0A0A0A',
  handle: '#0040E0', detected: '#6B2FD6', suggested: '#7A4A00',
  sky: '#D9E2EC', ground3d: '#F7F7F5', wall3d: '#5B636D',
};
export const nightPalette: Palette = {
  background: '#0B0D10', panel: '#14181D', secondary: '#1B2027', selected: '#1A2B52', border: '#C9CED6', hairline: '#2C323A',
  text: '#F2F4F7', muted: '#C3C8D0', subdued: '#9AA1AB', accent: '#6E9BFF', onAccent: '#0B0D10', primary: '#FF7A2E', onPrimary: '#0B0D10',
  danger: '#FF6B6B', onDanger: '#0B0D10', warning: '#FFD45C', caution: '#FFD400', onCaution: '#0B0D10', movement: '#4FD1B0',
  grid: '#3A414B', gridMinor: '#20252C', canvas: '#0F1216', ink: '#E8EAED', offStage: '#050607',
  wall: '#E8EAED', port: '#C2410C', faultLine: '#E8EAED', startFill: '#0F1216',
  cardboard: '#B69964', steel: '#9AA6AE', noShoot: '#E5E7DF', noShootRed: '#E65959', faceEdge: '#0B0D10',
  handle: '#6E9BFF', detected: '#C498FF', suggested: '#FFD45C',
  sky: '#06080B', ground3d: '#161A20', wall3d: '#7E8894',
};

let active: Palette = dayPalette;
/** The palette in use. */
export const palette = () => active;
/** Internal: switch the active palette (ui/theme.ts does this and notifies subscribers). */
export function setActivePalette(next: Palette) { active = next; }

/** Live view of the active palette: `colors.text` is always the current text colour. */
export const colors: Palette = new Proxy({} as Palette, {
  get: (_, key) => active[key as keyof Palette],
  ownKeys: () => Reflect.ownKeys(active),
  getOwnPropertyDescriptor: (_, key) => ({ enumerable: true, configurable: true, value: active[key as keyof Palette] }),
});

/**
 * Theme-aware styles: like StyleSheet.create, but built from the active palette and rebuilt when it changes.
 * `const styles = themed(c => ({ box: { backgroundColor: c.panel } }))`, then `styles.box` as usual.
 */
type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };
export function themed<T extends NamedStyles<T> | NamedStyles<any>>(factory: (c: Palette) => T & NamedStyles<any>): T {
  const cache = new Map<Palette, T>();
  const current = () => { let v = cache.get(active); if (!v) { v = factory(active); cache.set(active, v); } return v; };
  return new Proxy({} as T, {
    get: (_, key) => current()[key as keyof T],
    ownKeys: () => Reflect.ownKeys(current()),
    getOwnPropertyDescriptor: (_, key) => ({ enumerable: true, configurable: true, value: current()[key as keyof T] }),
  });
}

/** Font families (loaded in the root layout; the system font is used until they load or if they fail). */
export const fonts = {
  body: 'Barlow_500Medium', bodyStrong: 'Barlow_600SemiBold', bold: 'Barlow_700Bold',
  display: 'BarlowCondensed_700Bold', displayHeavy: 'BarlowCondensed_800ExtraBold',
};
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
/** Controls are glove-sized: at least 48 pt, 56 pt for primary actions. */
export const touch = { min: 48, primary: 56 };
export const borders = { strong: 3, regular: 2 };
export const typography = {
  title: { fontFamily: fonts.displayHeavy, fontSize: 30, lineHeight: 34, letterSpacing: 0.3 },
  section: { fontFamily: fonts.display, fontSize: 21, lineHeight: 25, letterSpacing: 0.3 },
  body: { fontFamily: fonts.body, fontSize: 17, lineHeight: 23 },
  label: { fontFamily: fonts.display, fontSize: 18, lineHeight: 22, letterSpacing: 0.4 },
  category: { fontFamily: fonts.display, fontSize: 14, lineHeight: 18, letterSpacing: 0.8 },
  value: { fontFamily: fonts.displayHeavy, fontSize: 30, lineHeight: 34 },
};
