import md5 from "https://esm.sh/md5@2.3.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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
    console.log("MAILCHIMP_SYNC_REQUEST", body);
    const limit = Number(body.limit || 10);
    const requestedEmail = String(body.email || "").trim().toLowerCase();

    let queueQuery = db
      .from("email_queue")
      .select("*")
      .eq("status", "Pending");

    if (requestedEmail) {
      queueQuery = queueQuery.eq("recipient_email", requestedEmail);
    }

    const { data: emails, error: loadError } = await queueQuery
      .order("created_at", { ascending: true })
      .limit(limit);

    if (loadError) throw loadError;
    console.log("PENDING_EMAIL_ROWS_FOUND", emails?.length || 0);

    const results = [];

    for (const email of emails || []) {
      try {
        const normalizedEmail = String(email.recipient_email || "")
          .trim()
          .toLowerCase();

        if (!normalizedEmail) {
          throw new Error("Missing recipient_email");
        }

        const subscriberHash = md5(normalizedEmail);
        const payload = email.payload || {};

        const mergeFields = {
          FNAME: payload.first_name || "",
          LNAME: payload.last_name || "",
          PHONE: payload.phone || "",
          CAMPUS: payload.campus || "",
          CLASSLABEL: payload.class_label || "",
          CLASS_TIME: payload.class_time || "",
          CLASS_DAY: payload.class_day || "",
          CLASS_DATE: payload.class_date || "",
          TEACHER: payload.teacher_name || "",
          TIMEZONE: payload.timezone || "",
        };

        const permanentTag = String(email.template_key || "foundation_welcome");
        const triggerTag = `${permanentTag}_trigger_${Date.now()}_${String(email.id || "").slice(0, 8)}`;

        const mailchimpUrl =
          `https://${MAILCHIMP_SERVER_PREFIX}.api.mailchimp.com/3.0/lists/${MAILCHIMP_AUDIENCE_ID}/members/${subscriberHash}`;

        const mcRes = await fetch(mailchimpUrl, {
          method: "PUT",
          headers: {
            Authorization: `apikey ${MAILCHIMP_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email_address: normalizedEmail,
            status_if_new: "subscribed",
            merge_fields: mergeFields,
            tags: [permanentTag, triggerTag],
          }),
        });

        const mcJson = await mcRes.json().catch(() => ({}));

        if (!mcRes.ok) {
          throw new Error(
            mcJson.detail ||
              mcJson.title ||
              `Mailchimp failed with ${mcRes.status}`,
          );
        }

        await db
          .from("email_queue")
          .update({
            status: "Sent",
            error_message: null,
            sent_at: new Date().toISOString(),
          })
          .eq("id", email.id);

        await db.from("audit_logs").insert({
          actor_email: "mailchimp-sync@system",
          action: "MAILCHIMP_EMAIL_SYNCED",
          entity_type: "email_queue",
          entity_id: email.id,
          status: "SUCCESS",
          details: {
            recipient_email: normalizedEmail,
            template_key: email.template_key,
            mailchimp_id: mcJson.id,
          },
        });

        results.push({
          id: email.id,
          recipient_email: normalizedEmail,
          status: "Sent",
        });
      } catch (emailError) {
        const message =
          emailError instanceof Error ? emailError.message : String(emailError);
        console.error("MAILCHIMP_ERROR", emailError);

        await db
          .from("email_queue")
          .update({
            status: "Failed",
            error_message: message,
          })
          .eq("id", email.id);

        await db.from("error_submissions").insert({
          source_form: "mailchimp-sync",
          error_message: message,
          raw_data: email,
        });

        await db.from("audit_logs").insert({
          actor_email: "mailchimp-sync@system",
          action: "MAILCHIMP_EMAIL_FAILED",
          entity_type: "email_queue",
          entity_id: email.id,
          status: "FAILED",
          details: {
            error: message,
            recipient_email: email.recipient_email,
            template_key: email.template_key,
          },
        });

        results.push({
          id: email.id,
          recipient_email: email.recipient_email,
          status: "Failed",
          error: message,
        });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed: results.length,
        results,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return new Response(
      JSON.stringify({
        ok: false,
        error: message,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});
