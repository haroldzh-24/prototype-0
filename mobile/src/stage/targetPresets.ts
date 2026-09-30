import type { TargetFamily } from './targetFamily';
import type { TargetOutline } from './targetShape';

export type TargetPreset = Readonly<{
  id: string; name: string; family: TargetFamily; variant: string;
  type: 'cardboardTarget' | 'steelPlate' | 'steelPopper';
  width: number; height: number; outline: TargetOutline;
  sourceUnits: 'in' | 'mm'; source: string; reference: string;
  verification: 'verified' | 'approximate' | 'unverified';
}>;
const polygon = (points: readonly (readonly [number, number])[]): TargetOutline => ({ kind: 'polygon', points });
// Illustrative outside contours, not scoring zones or certified cutting templates.
const torso = polygon([[.33,0],[.67,0],[.67,.2],[1,.35],[1,.85],[.75,1],[.25,1],[0,.85],[0,.35],[.33,.2]]);
const classic = polygon([[.5,0],[1,.25],[1,.75],[.7,1],[.3,1],[0,.75],[0,.25]]);
const competition = polygon([[.25,0],[.75,0],[1,.2],[1,.85],[.75,1],[.25,1],[0,.85],[0,.2]]);
const popper = polygon([[.5,0],[.75,.08],[.75,.22],[1,.35],[1,.5],[.65,.62],[.65,.9],[.8,1],[.2,1],[.35,.9],[.35,.62],[0,.5],[0,.35],[.25,.22],[.25,.08]]);
const chl = 'https://chltargets.com/';
const uspsa = 'https://uspsa.org/documents/rules/current/USPSA-Competition-Rules.pdf';
const idpa = 'https://www.idpa.com/wp-content/uploads/2026/01/2026-IDPA-Rulebook-2.pdf';
const paper = (id: string, name: string, family: TargetFamily, variant: string, width: number, height: number, outline: TargetOutline, source: string, reference: string): TargetPreset =>
  ({ id, name, family, variant, width, height, outline, source, reference, sourceUnits: 'in', verification: 'approximate', type: 'cardboardTarget' });
const entries: TargetPreset[] = [
  paper('uspsa-metric-chl-v1', 'USPSA Metric (CHL)', 'USPSA', 'Full size', 18.12, 29.93, torso, chl+'uspsa-ipsc-cb-torso-cardboard-20-target-pack-free-shipping/', 'Manufacturer overall target dimensions; approximate outline. Not shipping or scoring-zone size.'),
  paper('uspsa-classic-chl-v1', 'IPSC Classic (CHL)', 'USPSA', 'Full size', 18.12, 22.84, classic, chl+'uspsa-ipsc-cb-classic-cardboard-60-target-pack/', 'Manufacturer overall dimensions including outer cardboard; approximate outline.'),
  paper('uspsa-reduced-at-v1', 'Reduced USPSA (Action Target)', 'USPSA', 'Reduced size', 9.125, 14.875, torso, 'https://shop.actiontarget.com/', 'Manufacturer reduced IPSC-CB product dimensions; not inferred by halving a different vendor target. Approximate contour.'),
  paper('pcsl-practical-2025-v1', 'PCSL Practical', 'PCSL', '2025+ full size', 18, 24, torso, chl+'pcsl-practical-target-2025-version-cb-100-target-pack-free-shipping/', 'Supplier explicitly calls the overall dimensions approximate; contour/notches unverified.'),
  paper('pcsl-mini-practical-2025-v1', 'PCSL Mini Practical', 'PCSL', '2025+ half scale', 9, 12, torso, chl+'pcsl-mini-practical-target-scale-2025-version-cb-100-target-pack-free-shipping/', 'Supplier approximate overall dimensions; not the 3 × 4.5-inch A zone.'),
  paper('pcsl-competition-2025-v1', 'PCSL Competition', 'PCSL', '2025+ non-humanoid', 18, 24, competition, chl+'pcsl-competition-target-2025-version-cb-100-target-pack-free-shipping/', 'Supplier approximate overall dimensions; contour/notches unverified.'),
  paper('pcsl-k-zone-legacy-v1', 'PCSL K-Zone (legacy)', 'PCSL', 'Legacy', 18, 23, torso, chl+'pcsl-cb-k-zone-100-target-pack-free-shipping/', 'Supplier approximate overall dimensions. Legacy target; rulebook limits its current use.'),
  paper('idpa-standard-2026-v1', 'IDPA Standard', 'IDPA', 'Full size', 18.125, 30.75, torso, idpa, '2026 rulebook p20 overall outline including border, corroborated by CHL target dimensions. Simplified contour, not scoring zones.'),
  paper('idpa-alternate-2026-v1', 'IDPA Alternate', 'IDPA', 'Non-humanoid alternate', 18.125, 30.75, competition, idpa, '2026 rulebook p20 alternate; limited use where standard target is prohibited. Overall dimensions; contour approximate.'),
  ...(['USPSA', 'PCSL', 'IDPA'] as const).map(family => ({ id: family.toLowerCase()+'-round-8-v1', name: family+' 8-inch round plate', family, variant: '8-inch diameter', type: 'steelPlate' as const,
    width: 8, height: 8, outline: { kind: 'ellipse' as const }, sourceUnits: 'in' as const, verification: 'verified' as const,
    source: family === 'USPSA' ? uspsa : family === 'IDPA' ? idpa : 'https://rules.pcsleague.com/rulebook/10-targets.html', reference: 'Explicit 8-inch circular preset; exact nominal geometry, not a universal required plate size or match legality certification.' })),
  { id: 'idpa-square-6-v1', name: 'IDPA 6-inch square plate', family: 'IDPA', variant: '6-inch square', type: 'steelPlate', width: 6, height: 6, outline: { kind: 'rectangle' }, sourceUnits: 'in', verification: 'verified', source: idpa, reference: 'Nominal 6-inch square; rule 4.12.9 allows this minimum size.' },
  { id: 'uspsa-mini-popper-bst-v1', name: 'Mini Pepper Popper (Blue Steel)', family: 'USPSA', variant: '28-inch mini', type: 'steelPopper', width: 8, height: 28, outline: popper, sourceUnits: 'in', verification: 'approximate', source: 'https://www.bluesteeltargets.com/products/mini-pepper-popper-28', reference: 'Manufacturer gives 28-inch target height and 8-inch circle; simplified contour and maximum silhouette width require drawing verification. Base dimensions excluded.' },
];
// Freeze nested outlines too: placed objects receive their own serializable snapshot.
for (const preset of entries) { if (preset.outline.kind === 'polygon') { preset.outline.points.forEach(Object.freeze); Object.freeze(preset.outline.points); } Object.freeze(preset.outline); Object.freeze(preset); }
export const targetPresets: readonly TargetPreset[] = Object.freeze(entries);
export const targetPreset = (id: string): TargetPreset | undefined => targetPresets.find(p => p.id === id);
export const presetsForFamily = (family: TargetFamily) => targetPresets.filter(p => p.family === family);
export const defaultTargetPreset = (family: TargetFamily): TargetPreset => presetsForFamily(family)[0];
