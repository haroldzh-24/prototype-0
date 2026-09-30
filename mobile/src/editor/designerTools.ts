export type DesignerTool = 'select' | 'pan' | 'target' | 'wall' | 'faultLine';
export type TapIntent = { started: number; moved: boolean; multiple: boolean };
export const startTap = (count: number, now: number): TapIntent => ({ started: now, moved: false, multiple: count !== 1 });
export const trackTap = (intent: TapIntent, count: number, dx: number, dy: number): TapIntent => ({ ...intent, moved: intent.moved || Math.hypot(dx, dy) > 6, multiple: intent.multiple || count > 1 });
export const deliberateTap = (intent: TapIntent, now: number) => !intent.moved && !intent.multiple && now - intent.started < 500;
