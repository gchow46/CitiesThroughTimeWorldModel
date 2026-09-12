export class VideoSlot {
  private video: HTMLVideoElement | null = null;
  private waiters = new Set<(video: HTMLVideoElement) => void>();
  set(video: HTMLVideoElement | null) {
    this.video = video;
    if (video) this.waiters.forEach((resolve) => resolve(video));
  }
  wait(signal: AbortSignal): Promise<HTMLVideoElement> {
    signal.throwIfAborted();
    if (this.video) return Promise.resolve(this.video);
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        this.waiters.delete(ready);
        signal.removeEventListener("abort", abort);
      };
      const ready = (video: HTMLVideoElement) => {
        cleanup();
        resolve(video);
      };
      const abort = () => {
        cleanup();
        reject(new DOMException("Cancelled", "AbortError"));
      };
      this.waiters.add(ready);
      signal.addEventListener("abort", abort, { once: true });
    });
  }
}
