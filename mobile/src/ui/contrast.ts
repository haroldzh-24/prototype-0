import { a11y, onA11yChange } from './a11y';
import { setHighContrast } from './theme';
import { loadContrastPreference, saveContrastPreference } from './themePrefs';
import type { ContrastPreference } from './themePrefs';

/**
 * High contrast is on when iOS Increase Contrast is on (Settings › Accessibility › Display & Text Size) or when the
 * shooter picks HIGH in Profile (bright sun at the range). This module keeps the theme in step with both.
 */
let preference: ContrastPreference = 'standard';
let started = false;
const sync = () => setHighContrast(preference === 'high' || a11y().increaseContrast);
export const contrastPreference = () => preference;
export function setContrastPreference(next: ContrastPreference) { preference = next; saveContrastPreference(next); sync(); }
export function startContrast() {
  if (started) return; started = true;
  preference = loadContrastPreference();
  onA11yChange(sync); sync();
}
