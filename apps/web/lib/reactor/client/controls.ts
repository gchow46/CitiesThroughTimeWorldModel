export type Axis = -1 | 0 | 1;
export type MoveDir = "forward" | "back" | "left" | "right" | "fl" | "fr" | "bl" | "br";
export type LookDir = { x: Axis; y: Axis };
export const MOVEMENT: Record<MoveDir, { forward: Axis; right: Axis }> = {
  forward: { forward: 1, right: 0 },
  back: { forward: -1, right: 0 },
  left: { forward: 0, right: -1 },
  right: { forward: 0, right: 1 },
  fl: { forward: 1, right: -1 },
  fr: { forward: 1, right: 1 },
  bl: { forward: -1, right: -1 },
  br: { forward: -1, right: 1 },
};
export const OYSTER_TRANSLATIONS = [
  ["Back_Left", "Back", "Back_Right"],
  ["Left", "None", "Right"],
  ["Front_Left", "Front", "Front_Right"],
] as const;
export const OYSTER_ROTATIONS = [
  ["Mouse_Down_Left", "Mouse_Down", "Mouse_Down_Right"],
  ["Mouse_Left", "None", "Mouse_Right"],
  ["Mouse_Up_Left", "Mouse_Up", "Mouse_Up_Right"],
] as const;
export function mouseAxis(delta: number): Axis {
  return Math.abs(delta) < 2 ? 0 : delta > 0 ? 1 : -1;
}
export type Controls = { forward: Axis; right: Axis; lookX: Axis; lookY: Axis };
export const IDLE: Controls = { forward: 0, right: 0, lookX: 0, lookY: 0 };
export const CONTROL_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

export function controlsFromKeys(keys: ReadonlySet<string>): Controls {
  const axis = (positive: string, negative: string) =>
    (Number(keys.has(positive)) - Number(keys.has(negative))) as Axis;
  return {
    forward: axis("KeyW", "KeyS"),
    right: axis("KeyD", "KeyA"),
    lookX: axis("ArrowRight", "ArrowLeft"),
    lookY: axis("ArrowUp", "ArrowDown"),
  };
}

export function sameControls(a: Controls, b: Controls) {
  return (
    a.forward === b.forward && a.right === b.right && a.lookX === b.lookX && a.lookY === b.lookY
  );
}

export class ControlQueue {
  private desired: Controls = { ...IDLE };
  private sent: Controls = { ...IDLE };
  private running = false;
  private closed = false;
  private pending: Promise<void> = Promise.resolve();

  constructor(
    private readonly apply: (controls: Controls) => Promise<void>,
    private readonly onError: () => void,
  ) {}

  set(controls: Controls) {
    if (this.closed) return;
    this.desired = { ...controls };
    if (!this.running) this.pending = this.flush();
  }

  close() {
    this.closed = true;
    this.desired = { ...IDLE };
  }

  async closeAndStop() {
    this.close();
    await this.pending;
    await this.apply(IDLE);
  }

  private async flush() {
    if (this.running || this.closed) return;
    this.running = true;
    try {
      while (!this.closed && !sameControls(this.sent, this.desired)) {
        const next = { ...this.desired };
        await this.apply(next);
        this.sent = next;
      }
    } catch {
      this.closed = true;
      this.onError();
    } finally {
      this.running = false;
    }
  }
}
