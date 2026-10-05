/** Shared companion-app chrome. Stage material colors remain independent. */
export const colors = {
  background: '#0A0A0A', panel: '#171717', secondary: '#212121', selected: '#2A2A2A',
  border: '#333333', text: '#F1F1F1', muted: '#9B9B9B', subdued: '#696969',
  accent: '#28BFE8', danger: '#E08080', grid: '#292929', gridMinor: '#202020',
  movement: '#58C9B9', warning: '#EAB54D',
};
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const typography = {
  title: { fontSize: 22, lineHeight: 28, fontWeight: '600' as const },
  section: { fontSize: 15, lineHeight: 21, fontWeight: '500' as const },
  body: { fontSize: 13, lineHeight: 19, fontWeight: '400' as const },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const },
  category: { fontSize: 10, lineHeight: 14, letterSpacing: 0.7, fontWeight: '500' as const },
  value: { fontSize: 25, lineHeight: 31, fontWeight: '500' as const },
};
