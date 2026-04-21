import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openaiKey) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roleData } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "super_admin"])
      .maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch pending embeddings
    const { data: pending, error: pendingErr } = await admin
      .from("email_embeddings")
      .select("id, source_id, content")
      .eq("status", "pending")
      .limit(20);

    if (pendingErr) throw pendingErr;
    if (!pending || pending.length === 0) {
      return new Response(JSON.stringify({ processed: 0, failed: 0, total: 0, remainingPending: 0, hasMore: false, message: "No pending embeddings" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    let failed = 0;

    for (const item of pending) {
      try {
        if (!item.content || item.content.trim().length === 0) {
          await admin
            .from("email_embeddings")
            .update({ status: "failed", updated_at: new Date().toISOString() })
            .eq("id", item.id);
          failed++;
          continue;
        }

        // Call OpenAI embeddings API
        const embRes = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "text-embedding-3-small",
            input: item.content.slice(0, 8000),
          }),
        });

        if (!embRes.ok) {
          const errText = await embRes.text();
          console.error("OpenAI error:", embRes.status, errText);
          await admin
            .from("email_embeddings")
            .update({ status: "failed", updated_at: new Date().toISOString() })
            .eq("id", item.id);
          failed++;
          continue;
        }

        const embJson = await embRes.json();
        const vector = embJson.data?.[0]?.embedding;

        if (!vector) {
          await admin
            .from("email_embeddings")
            .update({ status: "failed", updated_at: new Date().toISOString() })
            .eq("id", item.id);
          failed++;
          continue;
        }

        await admin
          .from("email_embeddings")
          .update({
            embedding: vector,
            status: "completed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.id);
        processed++;
      } catch (e) {
        console.error("Item error:", e);
        failed++;
      }
    }

    const { count: remainingPending } = await admin
      .from("email_embeddings")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");

    return new Response(JSON.stringify({ processed, failed, total: pending.length, remainingPending: remainingPending || 0, hasMore: (remainingPending || 0) > 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-email-embeddings error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
