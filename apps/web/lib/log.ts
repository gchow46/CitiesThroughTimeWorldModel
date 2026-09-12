import { pino } from "pino";
import crypto from "node:crypto";

/** Structured logger — every line carries requestId; callers add model/route. */
export const log = pino({ level: process.env.LOG_LEVEL ?? "info" });

export function newRequestId(): string {
  return crypto.randomBytes(8).toString("hex");
}

export function reqLog(requestId: string, bindings: Record<string, unknown>) {
  return log.child({ requestId, ...bindings });
}
