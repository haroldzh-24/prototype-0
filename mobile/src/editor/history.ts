/** Immutable document snapshots; viewport and transient tool state never enter history. */
export type History<T> = { past: T[]; present: T; future: T[]; group: T | null };
export const history = <T>(present: T): History<T> => ({ past: [], present, future: [], group: null });
const equal = <T>(a: T, b: T) => a === b || JSON.stringify(a) === JSON.stringify(b);
export function record<T>(h: History<T>, next: T): History<T> {
  if (equal(h.present, next)) return h;
  return { ...h, past: h.group === null ? [...h.past, h.present].slice(-100) : h.past, present: next, future: [] };
}
export function begin<T>(h: History<T>): History<T> { return h.group !== null ? h : { ...h, group: h.present }; }
export function end<T>(h: History<T>): History<T> {
  return h.group === null ? h : { ...h, past: equal(h.group, h.present) ? h.past : [...h.past, h.group].slice(-100), group: null };
}
export function undo<T>(value: History<T>): History<T> {
  const h = end(value); return !h.past.length ? h : { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future], group: null };
}
export function redo<T>(value: History<T>): History<T> {
  const h = end(value); return !h.future.length ? h : { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), group: null };
}
