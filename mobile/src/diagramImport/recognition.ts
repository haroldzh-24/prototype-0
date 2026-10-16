import type { Reconstruction, Proposal, Crop } from './model';
import { validateReconstruction, validProposal, validCrop, inchesPerPixel } from './model';
import { createGeometryRecognizer, stableHash } from './geometryDetector';

export type Raster = { width: number; height: number; rgba: Uint8ClampedArray };
export type SymbolTemplate = { id: string; application: string; version: string; type: Proposal['type']; raster: Raster; notes: string };
export interface DiagramRecognizer {
  id: string;
  /** Scope templates to an evaluated drawing convention; no universal icon assumption. */
  templates: readonly SymbolTemplate[];
  recognize(input: { raster: Raster; signal: AbortSignal }): Promise<{ proposals: Proposal[]; layoutRegion?: Crop; projection: Reconstruction['projection']; warnings: string[] }>;
}
export const recognizers: readonly DiagramRecognizer[] = [createGeometryRecognizer()]; // No vendor symbol templates are enabled.
export async function propose(draft: Reconstruction, raster: Raster, recognizer: DiagramRecognizer, signal: AbortSignal) {
  validateReconstruction(draft);
  if (signal.aborted) throw new Error('Recognition cancelled.');
  if (!draft.aligned || !Number.isInteger(raster.width) || !Number.isInteger(raster.height) || raster.width<1 || raster.height<1 || raster.width>4096 || raster.height>4096 || Math.abs(raster.width*draft.aligned.height-raster.height*draft.aligned.width)>1.5*Math.max(draft.aligned.width,draft.aligned.height) || raster.rgba.length !== raster.width * raster.height * 4) throw new Error('Recognition raster must match the aligned page aspect ratio.');
  const result = await recognizer.recognize({ raster, signal });
  if (signal.aborted) throw new Error('Recognition cancelled.');
  if (result.proposals.length > 1000 || !result.proposals.every(validProposal) || new Set(result.proposals.map(p => p.id)).size !== result.proposals.length || result.layoutRegion && !validCrop(result.layoutRegion) || !['unknown', 'top-down', 'perspective'].includes(result.projection)) throw new Error('Detector returned invalid proposals.');
  // Never auto-accept, auto-calibrate, or upgrade an unknown projection to metric top-down.
  let scaleStatus: NonNullable<Proposal['recognition']>['scaleStatus']='uncalibrated';
  try { inchesPerPixel(draft); scaleStatus=draft.calibration?.approximate?'calibrated-approximate':'calibrated'; } catch { /* Geometry can be reviewed without stage units. */ }
  const proposals = result.proposals.map(p => ({ ...p, id:'rec-'+stableHash(draft.aligned!.asset.path+':'+recognizer.id)+'-'+p.id.slice(0,64)+'-'+stableHash(p.id), accepted: false, approximate: true, source: recognizer.id,
    ...(p.recognition ? {recognition:{...p.recognition,sourceImage:{path:draft.aligned!.asset.path,page:draft.aligned!.page},scaleStatus}} : {}) }));
  if(new Set(proposals.map(p=>p.id)).size!==proposals.length)throw new Error('Ambiguous detection IDs. Use manual overlays.');
  return { ...result, proposals };
}
