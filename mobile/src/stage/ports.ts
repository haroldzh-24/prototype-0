import type { FiringPort, WallGeometry } from './model';
import { parseLength } from './measurements';

export function validatePorts(wall: WallGeometry, ports: readonly FiringPort[]): string | null {
  const ids = new Set<string>();
  for (const port of ports) {
    if (!port.id.trim() || ids.has(port.id)) return 'Port IDs must be nonempty and unique.';
    ids.add(port.id);
    if (![port.offset, port.width, port.height, port.sill].every(Number.isFinite)) return 'Port measurements must be finite numbers.';
    if (port.width <= 0 || port.height <= 0) return 'Port width and height must be positive.';
    if (port.sill < 0) return 'Sill elevation cannot be below the wall bottom.';
    if (Math.abs(port.offset) + port.width / 2 > wall.length / 2) return 'Port must fit between the wall ends.';
    if (port.sill + port.height > wall.height) return 'Port top cannot exceed wall height.';
  }
  return null;
}

/** A centered opening that also fits small walls. The caller allocates its ID once. */
export function createPort(wall: WallGeometry, id: string): FiringPort {
  const height = Math.min(24, wall.height);
  return { id, offset: 0, width: Math.min(24, wall.length), height, sill: Math.min(36, wall.height - height) };
}

export const portFields = [
  { key: 'offset', label: 'Port offset' }, { key: 'width', label: 'Port width' },
  { key: 'height', label: 'Port height' }, { key: 'sill', label: 'Sill elevation' },
] as const;
type PortField = typeof portFields[number]['key'];
export const portValues = (port: FiringPort): Record<PortField, string> => ({
  offset: String(port.offset), width: String(port.width), height: String(port.height), sill: String(port.sill),
});
export function parsePortDraft(port: FiringPort, draft: Record<PortField, string>):
  { port: FiringPort; error?: never } | { error: string; port?: never } {
  const values = { ...port };
  for (const { key, label } of portFields) {
    const value = parseLength(draft[key]);
    if (value === null) return { error: 'Enter a valid measurement for ' + label + '.' };
    values[key] = value;
  }
  return { port: values };
}
