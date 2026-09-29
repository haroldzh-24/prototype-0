export const targetFamilies = ['USPSA', 'PCSL', 'IDPA'] as const;
export type TargetFamily = typeof targetFamilies[number];
export const isTargetFamily = (value: unknown): value is TargetFamily => targetFamilies.includes(value as TargetFamily);
