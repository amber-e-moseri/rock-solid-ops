import { errorResponse, jsonResponse } from "../shared-utils/edge-hardening.ts";

export function ok<T>(data: T): Response {
  return jsonResponse({
    ok: true,
    data,
    statusCode: 200,
  });
}

export function error(status: number, message: string): Response {
  return errorResponse(message, {
    code: "ERROR",
    message,
    retryable: status >= 500,
    statusCode: status,
    isUserError: status >= 400 && status < 500,
  });
}
