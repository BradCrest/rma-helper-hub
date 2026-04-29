import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({ token: z.string().min(10).max(200) });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "缺少 token" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { token } = parsed.data;

    const { data: msg } = await admin
      .from("rma_thread_messages")
      .select("id, rma_request_id, subject, body, reply_token_expires_at, reply_token_used_at, created_at")
      .eq("reply_token", token)
      .maybeSingle();

    if (!msg) {
      return new Response(JSON.stringify({ status: "not_found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (msg.reply_token_used_at) {
      return new Response(JSON.stringify({ status: "used" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (msg.reply_token_expires_at && new Date(msg.reply_token_expires_at) < new Date()) {
      return new Response(JSON.stringify({ status: "expired" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch RMA basic info (no PII)
    const { data: rma } = await admin
      .from("rma_requests")
      .select("rma_number, product_name, product_model, issue_description, customer_name")
      .eq("id", msg.rma_request_id)
      .maybeSingle();

    return new Response(
      JSON.stringify({
        status: "ok",
        rmaNumber: rma?.rma_number || "",
        customerName: rma?.customer_name || "",
        productName: rma?.product_name || "",
        productModel: rma?.product_model || "",
        originalIssue: rma?.issue_description || "",
        adminSubject: msg.subject || "",
        adminReply: msg.body || "",
        sentAt: msg.created_at,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("lookup-rma-reply-thread error:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
