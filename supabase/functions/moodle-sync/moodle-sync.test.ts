import { onlyAssignedSyncJobs } from "./index.ts";

Deno.test("WAITLISTED -> Moodle exclusion: only ASSIGNED jobs are kept for sync", () => {
  const rows = [
    { id: "1", registration_status: "ASSIGNED", sync_status: "PENDING" },
    { id: "2", registration_status: "WAITLISTED", sync_status: "PENDING" },
    { id: "3", registration_status: "REVIEW", sync_status: "RETRYING" },
    { id: "4", registration_status: "ASSIGNED", sync_status: "FAILED" },
  ];

  const filtered = onlyAssignedSyncJobs(rows as any);
  if (filtered.length !== 2) throw new Error(`expected 2 assigned rows, got ${filtered.length}`);
  if (filtered.some((r: any) => String(r.registration_status).toUpperCase() !== "ASSIGNED")) {
    throw new Error("non-ASSIGNED row leaked into Moodle sync batch");
  }
});
