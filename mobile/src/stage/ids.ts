/** Inject platform UUID v4 generation; independent of collection length or session counters. */
export function createObjectId(type: import('./operations').AddableType, randomUUID: () => string): string {
  return type + '-' + randomUUID();
}

/** Separate namespace: ports belong to walls, never the StageObject collection. */
export function createPortId(randomUUID: () => string): string { return 'port-' + randomUUID(); }
