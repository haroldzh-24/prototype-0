/** Synchronous reservation protects double taps; generations reject completions after unmount. */
export class OperationGate {
  private generation = 0;
  private mounted = true;
  private token: number | null = null;
  get busy() { return this.token !== null; }
  activate() { this.mounted = true; }
  begin(): number | null {
    if (!this.mounted || this.busy) return null;
    this.token = ++this.generation; return this.token;
  }
  current(token: number) { return this.mounted && this.token === token; }
  finish(token: number) { if (this.token === token) this.token = null; }
  dispose() { this.mounted = false; this.token = null; this.generation++; }
}
