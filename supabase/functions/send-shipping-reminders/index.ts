import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PUBLISHED_URL = "https://rma-helper-hub.lovable.app";
const REMINDER_DELAY_HOURS = 48;
const REMINDER_ENABLED_AFTER = "2026-04-28T12:00:00Z";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Authorize the caller. Two paths are accepted:
 *   1. Service role bearer token (used by cron / internal services)
 *   2. A logged-in user JWT whose user has role admin or super_admin
 *
 * Anything else (no header, anon key, invalid token, non-admin user) → unauthorized.
 *
 * Returns: { kind: 'service' } | { kind: 'admin', userId } | { kind: 'unauthorized', status }
 */
async function authorize(req: Request, supabaseUrl: string, serviceKey: string, anonKey: string) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return { kind: "unauthorized" as const, status: 401 };
  }
  const token = authHeader.slice(7).trim();
  if (!token) return { kind: "unauthorized" as const, status: 401 };

  // Path 1: service role (cron / internal).
  // Identify by exact-match against the env var, OR by decoding the JWT and
  // checking the `role` claim. The env-var match handles legacy keys, the
  // claim check handles new sb_secret_* keys whose string value may differ
  // from what the function sees in env.
  if (token === serviceKey) {
    return { kind: "service" as const };
  }
  try {
    const parts = token.split(".");
    if (parts.length === 3) {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
      if (payload?.role === "service_role") {
        return { kind: "service" as const };
      }
      if (payload?.role === "anon") {
        return { kind: "unauthorized" as const, status: 401 };
      }
    }
  } catch {
    // not a parseable JWT — fall through to user-JWT path
  }

  // Reject anon key explicitly (we don't want anonymous callers triggering reminders)
  if (token === anonKey) {
    return { kind: "unauthorized" as const, status: 401 };
  }

  // Path 2: user JWT — verify and check admin role
  try {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return { kind: "unauthorized" as const, status: 401 };
    }
    const { data: roleData, error: roleErr } = await userClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    if (roleErr || !roleData) {
      return { kind: "unauthorized" as const, status: 403 };
    }
    const isAdmin = roleData.some((r: { role: string }) => r.role === "admin" || r.role === "super_admin");
    if (!isAdmin) {
      return { kind: "unauthorized" as const, status: 403 };
    }
    return { kind: "admin" as const, userId: userData.user.id };
  } catch (e) {
    console.error("authorize error:", e);
    return { kind: "unauthorized" as const, status: 401 };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";

    const auth = await authorize(req, supabaseUrl, supabaseServiceKey, supabaseAnonKey);
    if (auth.kind === "unauthorized") {
      return jsonResponse({ error: "Unauthorized" }, auth.status);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Optional manual override (admin or service-role only — already gated above)
    let targetRmaId: string | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body && typeof body.rma_request_id === "string") {
          targetRmaId = body.rma_request_id;
        }
      } catch {
        // ignore
      }
    }

    const cutoffIso = new Date(Date.now() - REMINDER_DELAY_HOURS * 3600 * 1000).toISOString();

    let query = supabase
      .from("rma_requests")
      .select("id, rma_number, customer_name, customer_email, product_name, issue_type, created_at, shipping_reminder_sent_at")
      .eq("status", "registered")
      .not("customer_email", "is", null);

    if (targetRmaId) {
      query = query.eq("id", targetRmaId);
    } else {
      query = query
        .is("shipping_reminder_sent_at", null)
        .lte("created_at", cutoffIso)
        .gte("created_at", REMINDER_ENABLED_AFTER)
        .neq("issue_type", "軟體問題");
    }

    const { data: candidates, error: candErr } = await query.limit(100);

    if (candErr) {
      console.error("Error querying candidates:", candErr);
      return jsonResponse({ error: candErr.message }, 500);
    }

    if (!candidates || candidates.length === 0) {
      return jsonResponse({ success: true, processed: 0, message: "No reminders to send" });
    }

    let sentCount = 0;
    const errors: Array<{ rma_number: string; error: string }> = [];

    for (const rma of candidates) {
      try {
        const { data: shipping } = await supabase
          .from("rma_shipping")
          .select("id")
          .eq("rma_request_id", rma.id)
          .eq("direction", "inbound")
          .maybeSingle();

        if (shipping) {
          console.log(`Skip ${rma.rma_number}: inbound shipping already exists`);
          continue;
        }

        if (!rma.customer_email) {
          console.log(`Skip ${rma.rma_number}: no customer email`);
          continue;
        }

        if (rma.issue_type === "軟體問題") {
          console.log(`Skip ${rma.rma_number}: software-only issue`);
          errors.push({ rma_number: rma.rma_number, error: "skipped_software_issue" });
          continue;
        }

        const shippingUrl = `${PUBLISHED_URL}/shipping-form?rma=${encodeURIComponent(rma.rma_number)}`;
        const createdDate = new Date(rma.created_at).toLocaleDateString("zh-TW", {
          year: "numeric",
          month: "long",
          day: "numeric",
          timeZone: "Asia/Taipei",
        });

        // Server-to-server call to the transactional email function.
        // send-transactional-email runs with verify_jwt = false and enforces
        // the service-role key check in code, so we pass the key in the
        // `apikey` header (the new sb_secret_* keys are API keys, not JWTs,
        // and must not be used as bearer tokens against the gateway).
        const serviceKey = supabaseServiceKey;
        const emailResp = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
            "apikey": serviceKey,
          },
          body: JSON.stringify({
            templateName: "shipping-reminder",
            recipientEmail: rma.customer_email,
            idempotencyKey: `shipping-reminder-${rma.id}`,
            templateData: {
              customerName: rma.customer_name || "客戶",
              rmaNumber: rma.rma_number,
              productName: rma.product_name || "保固服務商品",
              createdDate,
              shippingUrl,
            },
          }),
        });

        if (!emailResp.ok) {
          const errText = await emailResp.text();
          throw new Error(`Email send failed (${emailResp.status}): ${errText}`);
        }
        const emailRespBody = await emailResp.text();
        console.log(`Reminder enqueued for ${rma.rma_number}: ${emailRespBody.slice(0, 200)}`);

        const { error: updErr } = await supabase
          .from("rma_requests")
          .update({ shipping_reminder_sent_at: new Date().toISOString() })
          .eq("id", rma.id);

        if (updErr) {
          console.error(`Failed to mark reminder sent for ${rma.rma_number}:`, updErr);
        }

        try {
          await supabase.functions.invoke("slack-notify", {
            body: {
              type: "status_change",
              rma_number: rma.rma_number,
              customer_name: rma.customer_name || "未提供",
              customer_phone: "",
              product_model: rma.product_name || "",
              serial_number: "",
              status: "registered",
              old_status: "registered",
              issue_description: `📧 已寄送 48 小時未寄件 Email 提醒至 ${rma.customer_email}`,
            },
          });
        } catch (slackErr) {
          console.error(`Slack notify failed for ${rma.rma_number}:`, slackErr);
        }

        sentCount++;
        console.log(`Reminder sent for ${rma.rma_number}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown error";
        console.error(`Error processing ${rma.rma_number}:`, message);
        errors.push({ rma_number: rma.rma_number, error: message });
      }
    }

    return jsonResponse({
      success: true,
      candidates: candidates.length,
      sent: sentCount,
      errors,
      caller: auth.kind,
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return jsonResponse({ error: message }, 500);
  }
});
