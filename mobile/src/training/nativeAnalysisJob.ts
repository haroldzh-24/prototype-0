/** One media extraction at a time, including across mounted editors. Release only after native settles. */
let active: symbol | undefined;
export type NativeAnalysisControl = {
  prepare(job: string): void; cancel(job: string): void; release(job: string): void;
  progress?(job: string): number;
};
export async function runNativeAnalysis<T>(native: NativeAnalysisControl, job: string, signal: AbortSignal | undefined,
  extract: () => Promise<T>, onProgress?: (fraction: number) => void): Promise<T> {
  const check = () => { if (signal?.aborted) throw new Error('Analysis cancelled.'); };
  check();
  if (active) throw new Error('Another media analysis is still finishing. Try again shortly.');
  if (typeof native.prepare !== 'function' || typeof native.release !== 'function')
    throw new Error('Rebuild the iOS app to use the updated analysis modules. Manual editing remains available.');
  const token = Symbol(job); active = token;
  let prepared = false, timer: ReturnType<typeof setInterval> | undefined;
  const cancel = () => { try { native.cancel(job); } catch { /* Late native completion is still discarded. */ } };
  try {
    native.prepare(job); prepared = true;
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) { cancel(); check(); }
    if (onProgress && native.progress) timer = setInterval(() => {
      if (signal?.aborted) return;
      try { const value = native.progress!(job); if (Number.isFinite(value)) onProgress(Math.max(0, Math.min(1, value))); }
      catch { /* Progress is optional; extraction owns errors. */ }
    }, 500);
    const result = await extract(); check(); return result;
  } finally {
    if (timer) clearInterval(timer);
    signal?.removeEventListener('abort', cancel);
    try { if (prepared) native.release(job); }
    finally { if (active === token) active = undefined; }
  }
}
