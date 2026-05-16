import md5 from "https://esm.sh/md5@2.3.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function applyAllowedOrigin(req: Request) {
  const allowed = String(Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const origin = String(req.headers.get("Origin") || "").trim();
  if (origin && allowed.includes(origin)) {
    corsHeaders["Access-Control-Allow-Origin"] = origin;
  } else {
    delete corsHeaders["Access-Control-Allow-Origin"];
  }
}

Deno.serve(async (req) => {
  applyAllowedOrigin(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const MAILCHIMP_API_KEY = Deno.env.get("MAILCHIMP_API_KEY")!;
    const MAILCHIMP_SERVER_PREFIX = Deno.env.get("MAILCHIMP_SERVER_PREFIX")!;
    const MAILCHIMP_AUDIENCE_ID = Deno.env.get("MAILCHIMP_AUDIENCE_ID")!;

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").trim().toLowerCase();
    const firstName = String(body?.first_name || "").trim();
    const lastName = String(body?.last_name || "").trim();
    const phone = String(body?.phone || "").trim();
    const campus = String(body?.campus || "").trim();
    const fellowshipCode = String(body?.fellowship_code || "").trim();
    const templateKey = String(body?.template_key || "").trim();

    if (!email) {
      return new Response(JSON.stringify({ ok: false, error: "email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const subscriberHash = md5(email);
    const mergeFields = {
      FNAME: firstName,
      LNAME: lastName,
      PHONE: phone,
      CAMPUS: campus,
      FELLOWCODE: fellowshipCode,
      TEMPLATE: templateKey,
    };

    const mailchimpUrl = `https://${MAILCHIMP_SERVER_PREFIX}.api.mailchimp.com/3.0/lists/${MAILCHIMP_AUDIENCE_ID}/members/${subscriberHash}`;
    const mcRes = await fetch(mailchimpUrl, {
      method: "PUT",
      headers: {
        Authorization: `apikey ${MAILCHIMP_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email_address: email,
        status_if_new: "subscribed",
        merge_fields: mergeFields,
      }),
    });

    const mcJson = await mcRes.json().catch(() => ({}));
    if (!mcRes.ok) {
      const message = String(mcJson?.detail || mcJson?.title || `Mailchimp failed with ${mcRes.status}`);
      console.error("MAILCHIMP_CONTACT_SYNC_FAILED", { email, status: mcRes.status, message });
      await db.from("audit_logs").insert({
        actor_email: "mailchimp-sync@system",
        action: "MAILCHIMP_CONTACT_SYNC_FAILED",
        entity_type: "mailchimp_contact",
        entity_id: email,
        status: "FAILED",
        details: { email, error: message, status: mcRes.status },
      });
      return new Response(JSON.stringify({ ok: false, error: message }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await db.from("audit_logs").insert({
      actor_email: "mailchimp-sync@system",
      action: "MAILCHIMP_CONTACT_SYNCED",
      entity_type: "mailchimp_contact",
      entity_id: email,
      status: "SUCCESS",
      details: {
        email,
        mailchimp_id: mcJson?.id || null,
        template_key: templateKey,
      },
    });

    return new Response(JSON.stringify({ ok: true, synced: email }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
