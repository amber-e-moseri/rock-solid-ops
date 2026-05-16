import { ApiError } from "./errors.ts";

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const REQUEST_TIMEOUT_MS = 15000;

export function applyAllowedOrigin(req: Request) {
  const allowed = String(Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const origin = String(req.headers.get("Origin") || "").trim();
  
  const isDev = origin.includes("localhost") || origin.includes("127.0.0.1");
  
  if (!origin) return;
  
  if (isDev || !allowed.length || allowed.includes(origin)) {
    corsHeaders["Access-Control-Allow-Origin"] = origin;
  } else {
    corsHeaders["Access-Control-Allow-Origin"] = "*";
  }
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

export function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new ApiError("REQUEST_TIMEOUT", `${label} timed out`, 504)), timeoutMs);
    }),
  ]);
}

export function parseDate(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function normalizeTimeSlot(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const hhmmss = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (hhmmss) {
    return `${hhmmss[1].padStart(2, "0")}:${hhmmss[2]}:${String(hhmmss[3] || "00").padStart(2, "0")}`;
  }
  const ampm = raw.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!ampm) return null;
  let hh = Number(ampm[1]);
  const mm = ampm[2];
  const ap = ampm[3].toUpperCase();
  if (ap === "PM" && hh < 12) hh += 12;
  if (ap === "AM" && hh === 12) hh = 0;
  return `${String(hh).padStart(2, "0")}:${mm}:00`;
}

export function safeLower(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

