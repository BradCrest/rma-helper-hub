import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const BodySchema = z.object({
  rmaId: z.string().uuid(),
  reuseExisting: z.boolean().optional().default(true),
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const cronSecret = Deno.env.get("CRON_SECRET");
    const admin = createClient(supabaseUrl, serviceKey);

    // Auth: admin OR cron secret
    const provided =
      req.headers.get("x-cron-secret") ??
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    let userId: string | null = null;
    let isCron = false;
    if (cronSecret && provided === cronSecret) {
      isCron = true;
    } else {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: roleData } = await admin
        .from("user_roles").select("role").eq("user_id", user.id)
        .in("role", ["admin", "super_admin"]).maybeSingle();
      if (!roleData) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = user.id;
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { rmaId, reuseExisting } = parsed.data;

    // Verify RMA exists
    const { data: rma, error: rmaErr } = await admin
      .from("rma_requests").select("id, rma_number").eq("id", rmaId).maybeSingle();
    if (rmaErr || !rma) {
      return new Response(JSON.stringify({ error: "RMA not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Reuse the most recent un-submitted survey if requested
    if (reuseExisting) {
      const { data: existing } = await admin
        .from("rma_followup_surveys")
        .select("id, token, sent_at")
        .eq("rma_id", rmaId)
        .is("submitted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing) {
        const surveyUrl = buildSurveyUrl(req, existing.token);
        return new Response(JSON.stringify({
          success: true, reused: true, id: existing.id, token: existing.token, surveyUrl,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const { data: created, error: insertErr } = await admin
      .from("rma_followup_surveys")
      .insert({ rma_id: rmaId, created_by: userId })
      .select("id, token")
      .single();
    if (insertErr || !created) {
      console.error("insert survey err:", insertErr);
      return new Response(JSON.stringify({ error: insertErr?.message ?? "Insert failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const surveyUrl = buildSurveyUrl(req, created.token);
    return new Response(JSON.stringify({
      success: true, reused: false, id: created.id, token: created.token, surveyUrl,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("create-follow-up-survey error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function buildSurveyUrl(req: Request, token: string): string {
  const siteUrl = Deno.env.get("SITE_URL");
  if (siteUrl) return `${siteUrl.replace(/\/$/, "")}/follow-up-survey/${token}`;
  // Fallback to request origin
  const origin = req.headers.get("origin");
  if (origin) return `${origin}/follow-up-survey/${token}`;
  return `/follow-up-survey/${token}`;
}
