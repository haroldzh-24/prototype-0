/** Inject platform UUID v4 generation; independent of collection length or session counters. */
export function createObjectId(type: 'target' | 'wall' | 'faultLine', randomUUID: () => string): string {
  return type + '-' + randomUUID();
}
