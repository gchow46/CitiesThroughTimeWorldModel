import type { WorldModelAdapter } from "./reactor/client/adapter";

export class SessionRun {
  readonly abort = new AbortController();
  private adapter?: WorldModelAdapter;
  private cleanup?: Promise<void>;

  check() {
    this.abort.signal.throwIfAborted();
  }

  async attach(adapter: WorldModelAdapter) {
    if (this.abort.signal.aborted) {
      await adapter.dispose();
      this.check();
    }
    this.adapter = adapter;
  }

  stop() {
    this.abort.abort();
    this.cleanup ??= this.adapter?.dispose() ?? Promise.resolve();
    return this.cleanup;
  }
}
