/**
 * Derivative images (rendered pages, aligned/cropped layouts) created while the import screen is open.
 * They live in app storage but are only kept if a saved draft references them; see cleanupSessionFiles.
 */
const created = new Set<string>();
export function recordDerivative(path: string): void { created.add(path); }
export function takeDerivatives(): string[] { const paths = [...created]; created.clear(); return paths; }
/** Paths eligible for deletion: created this session and referenced by no saved draft on any stage. */
export function unreferencedPaths(paths: readonly string[], inUse: ReadonlySet<string>): string[] {
  return paths.filter(path => !inUse.has(path));
}
export const DOCUMENT_PATH = /^diagram-imports\/[A-Za-z0-9-]+\.[A-Za-z0-9]{1,8}$/;
