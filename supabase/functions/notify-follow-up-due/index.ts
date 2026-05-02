import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth: require CRON_SECRET via header (preferred) or Bearer token
    const cronSecret = Deno.env.get("CRON_SECRET");
    if (!cronSecret) {
      return new Response(JSON.stringify({ error: "CRON_SECRET not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const provided =
      req.headers.get("x-cron-secret") ??
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (provided !== cronSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch all follow_up RMAs with due date already passed
    const nowIso = new Date().toISOString();
    const { data: rows, error } = await supabase
      .from("rma_requests")
      .select("id, rma_number, customer_name, product_model, follow_up_due_at, updated_at")
      .eq("status", "follow_up")
      .not("follow_up_due_at", "is", null)
      .lte("follow_up_due_at", nowIso)
      .order("follow_up_due_at", { ascending: true });

    if (error) {
      console.error("Query failed:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const due = rows ?? [];
    console.log(`Found ${due.length} follow-up RMAs due/overdue`);

    if (due.length === 0) {
      return new Response(JSON.stringify({ success: true, count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build Slack message; include link to admin follow-up tab if SITE_URL set
    const siteUrl = Deno.env.get("SITE_URL");
    const tabLink = siteUrl ? `${siteUrl.replace(/\/$/, "")}/admin/logistics?tab=followup` : null;
    const lines = due.slice(0, 20).map((r) => {
      const days = Math.floor(
        (Date.now() - new Date(r.follow_up_due_at!).getTime()) / 86400000
      );
      const overdueText = days >= 0 ? `逾期 ${days} 天` : `${-days} 天後到期`;
      return `• \`${r.rma_number}\` — ${r.customer_name} (${r.product_model ?? "—"}) · ${overdueText}`;
    });
    const more = due.length > 20 ? `\n_…還有 ${due.length - 20} 筆_` : "";
    const cta = tabLink
      ? `\n→ <${tabLink}|前往「客戶關懷」分頁處理>`
      : `\n→ 前往「後勤管理 → 客戶關懷」分頁處理`;
    const text = `📞 *後續關懷提醒* — 共 ${due.length} 筆需要聯繫客戶\n${lines.join("\n")}${more}${cta}`;

    const slackUrl = Deno.env.get("SLACK_WEBHOOK_URL");
    if (slackUrl) {
      const slackRes = await fetch(slackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!slackRes.ok) {
        console.error("Slack webhook failed:", await slackRes.text());
      }
    } else {
      console.warn("SLACK_WEBHOOK_URL not set; skipping Slack notification");
    }

    return new Response(
      JSON.stringify({ success: true, count: due.length, ids: due.map((r) => r.id) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Error:", e);
    const msg = e instanceof Error ? e.message : "Internal server error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
