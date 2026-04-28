import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PUBLISHED_URL = "https://rma-helper-hub.lovable.app";
const REMINDER_DELAY_HOURS = 48;
// Only send automated reminders for RMAs created on/after this timestamp.
// Historical RMAs (created before this) will NEVER receive automated reminders.
// Manual admin-triggered sends (with rma_request_id in POST body) bypass this check.
const REMINDER_ENABLED_AFTER = "2026-04-28T12:00:00Z";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Optional: allow admin to manually trigger for a specific RMA
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

    // Find candidate RMAs: status='registered', no inbound shipping, >48h old, no reminder sent
    const cutoffIso = new Date(Date.now() - REMINDER_DELAY_HOURS * 3600 * 1000).toISOString();

    let query = supabase
      .from("rma_requests")
      .select("id, rma_number, customer_name, customer_email, product_name, created_at, shipping_reminder_sent_at")
      .eq("status", "registered")
      .not("customer_email", "is", null);

    if (targetRmaId) {
      query = query.eq("id", targetRmaId);
    } else {
      query = query
        .is("shipping_reminder_sent_at", null)
        .lte("created_at", cutoffIso)
        .gte("created_at", REMINDER_ENABLED_AFTER);
    }

    const { data: candidates, error: candErr } = await query.limit(100);

    if (candErr) {
      console.error("Error querying candidates:", candErr);
      return new Response(JSON.stringify({ error: candErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!candidates || candidates.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "No reminders to send" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let sentCount = 0;
    const errors: Array<{ rma_number: string; error: string }> = [];

    for (const rma of candidates) {
      try {
        // Check if customer has already submitted inbound shipping
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

        // Send transactional email
        const shippingUrl = `${PUBLISHED_URL}/shipping?rma=${encodeURIComponent(rma.rma_number)}&autoopen=1`;
        const createdDate = new Date(rma.created_at).toLocaleDateString("zh-TW", {
          year: "numeric",
          month: "long",
          day: "numeric",
          timeZone: "Asia/Taipei",
        });

        // Direct fetch to send-transactional-email (more reliable than functions.invoke in cron context)
        const emailResp = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
            "apikey": supabaseServiceKey,
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
        await emailResp.text();

        // Mark as sent
        const { error: updErr } = await supabase
          .from("rma_requests")
          .update({ shipping_reminder_sent_at: new Date().toISOString() })
          .eq("id", rma.id);

        if (updErr) {
          console.error(`Failed to mark reminder sent for ${rma.rma_number}:`, updErr);
        }

        // Slack notification (best-effort, don't fail the whole job)
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

    return new Response(
      JSON.stringify({
        success: true,
        candidates: candidates.length,
        sent: sentCount,
        errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
