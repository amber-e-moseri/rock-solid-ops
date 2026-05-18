import { safeLogAudit } from "./http.ts";

export function withTrace(
  details: Record<string, unknown> = {},
  traceId?: string | null,
): Record<string, unknown> {
  const trace = String(traceId || "").trim();
  if (!trace) return details;
  return { ...details, trace_id: trace };
}

export async function writeAudit(
  db: any,
  action: string,
  entityId: string,
  details: Record<string, unknown> = {},
  options: {
    actor_email?: string;
    entity_type?: string;
    status?: "SUCCESS" | "FAILED" | "SKIPPED";
  } = {},
): Promise<boolean> {
  return safeLogAudit(db, {
    actor_email: options.actor_email || "system",
    action,
    entity_type: options.entity_type || "edge_function",
    entity_id: String(entityId || ""),
    status: options.status || "SUCCESS",
    details,
  });
}

export async function writeSyncLog(
  db: any,
  phase: string,
  message: string,
  details: Record<string, unknown> | null = null,
  runBy = "system",
): Promise<void> {
  const phaseText = String(phase || "").toUpperCase();
  const status = phaseText.includes("ERROR") || phaseText.includes("FAILED")
    ? "FAILED"
    : phaseText.includes("SKIP")
    ? "SKIPPED"
    : "SUCCESS";
  await db.from("audit_logs").insert({
    action: phase || "SYNC_EVENT",
    entity_type: "edge_function",
    entity_id: String(runBy || "system"),
    status,
    details: {
      message,
      run_by: runBy,
      ...(details ?? {}),
    },
    logged_at: new Date().toISOString(),
  });
}
