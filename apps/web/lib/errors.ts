import { NextResponse } from "next/server";
import type { ApiError, ErrorCode } from "./types";

export function apiError(
  status: number,
  error: ErrorCode,
  message: string,
  extra?: Partial<ApiError>,
): NextResponse<ApiError> {
  return NextResponse.json({ error, message, ...extra }, { status });
}
