import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  token: z.string().min(10).max(200),
  body: z.string().min(1).max(10000),
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { token, body } = parsed.data;

    const { data: msg } = await admin
      .from("rma_thread_messages")
      .select("id, rma_request_id, subject, reply_token_expires_at, reply_token_used_at")
      .eq("reply_token", token)
      .maybeSingle();

    if (!msg) {
      return new Response(JSON.stringify({ error: "連結無效" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (msg.reply_token_used_at) {
      return new Response(JSON.stringify({ error: "此連結已使用過" }), {
        status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (msg.reply_token_expires_at && new Date(msg.reply_token_expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "連結已過期" }), {
        status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert inbound message
    const inboundSubject = msg.subject ? `Re: ${msg.subject}` : null;
    const { error: insErr } = await admin.from("rma_thread_messages").insert({
      rma_request_id: msg.rma_request_id,
      direction: "inbound",
      subject: inboundSubject,
      body,
      parent_message_id: msg.id,
    });
    if (insErr) {
      console.error("insert inbound err:", insErr);
      throw insErr;
    }

    // Mark token used
    await admin
      .from("rma_thread_messages")
      .update({ reply_token_used_at: new Date().toISOString() })
      .eq("id", msg.id);

    // Fire-and-forget Slack notify
    try {
      const { data: rma } = await admin
        .from("rma_requests")
        .select("rma_number, customer_name")
        .eq("id", msg.rma_request_id)
        .maybeSingle();
      await admin.functions.invoke("slack-notify", {
        body: {
          type: "rma_customer_reply",
          rma_number: rma?.rma_number,
          customer_name: rma?.customer_name,
          preview: body.slice(0, 200),
        },
      });
    } catch (e) {
      console.error("slack notify failed (non-fatal):", e);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("submit-customer-reply error:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
