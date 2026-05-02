import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PostSchema = z.object({
  token: z.string().min(8).max(200),
  satisfaction: z.number().int().min(1).max(5),
  comments: z.string().max(2000).optional().default(""),
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    if (req.method === "GET") {
      const url = new URL(req.url);
      const token = url.searchParams.get("token");
      if (!token) {
        return new Response(JSON.stringify({ error: "Missing token" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data, error } = await admin
        .from("rma_followup_surveys")
        .select("id, submitted_at, sent_at, rma:rma_requests!inner(rma_number, customer_name, product_model)")
        .eq("token", token)
        .maybeSingle();
      if (error || !data) {
        return new Response(JSON.stringify({ error: "Survey not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({
        submitted: !!data.submitted_at,
        submittedAt: data.submitted_at,
        sentAt: data.sent_at,
        rma: data.rma,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = PostSchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { token, satisfaction, comments } = parsed.data;

    const { data: existing, error: lookupErr } = await admin
      .from("rma_followup_surveys")
      .select("id, submitted_at")
      .eq("token", token)
      .maybeSingle();
    if (lookupErr || !existing) {
      return new Response(JSON.stringify({ error: "Survey not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (existing.submitted_at) {
      return new Response(JSON.stringify({ error: "Survey already submitted", alreadySubmitted: true }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: updateErr } = await admin
      .from("rma_followup_surveys")
      .update({
        satisfaction,
        comments: comments || null,
        submitted_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (updateErr) {
      console.error("update survey err:", updateErr);
      return new Response(JSON.stringify({ error: updateErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("submit-follow-up-survey error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
