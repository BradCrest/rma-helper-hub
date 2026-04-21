import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_LIMIT = 20;

const jsonResponse = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestStartedAt = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openaiKey) {
      return jsonResponse({
        ok: false,
        processed: 0,
        failed: 0,
        total: 0,
        remainingPending: 0,
        hasMore: false,
        error: "OPENAI_API_KEY not configured",
        diagnostics: {
          batchSize: BATCH_LIMIT,
          durationMs: Date.now() - requestStartedAt,
          errorType: "missing_api_key",
        },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({
        ok: false,
        processed: 0,
        failed: 0,
        total: 0,
        remainingPending: 0,
        hasMore: false,
        error: "Unauthorized",
        diagnostics: {
          batchSize: BATCH_LIMIT,
          durationMs: Date.now() - requestStartedAt,
          errorType: "unauthorized",
        },
      }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();

    if (!user) {
      return jsonResponse({
        ok: false,
        processed: 0,
        failed: 0,
        total: 0,
        remainingPending: 0,
        hasMore: false,
        error: "Unauthorized",
        diagnostics: {
          batchSize: BATCH_LIMIT,
          durationMs: Date.now() - requestStartedAt,
          errorType: "unauthorized",
        },
      }, 401);
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roleData } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "super_admin"])
      .maybeSingle();

    if (!roleData) {
      return jsonResponse({
        ok: false,
        processed: 0,
        failed: 0,
        total: 0,
        remainingPending: 0,
        hasMore: false,
        error: "Forbidden",
        diagnostics: {
          batchSize: BATCH_LIMIT,
          durationMs: Date.now() - requestStartedAt,
          errorType: "forbidden",
        },
      }, 403);
    }

    const { data: pending, error: pendingErr } = await admin
      .from("email_embeddings")
      .select("id, source_id, content")
      .eq("status", "pending")
      .limit(BATCH_LIMIT);

    if (pendingErr) {
      return jsonResponse({
        ok: false,
        processed: 0,
        failed: 0,
        total: 0,
        remainingPending: 0,
        hasMore: false,
        error: pendingErr.message,
        diagnostics: {
          batchSize: BATCH_LIMIT,
          durationMs: Date.now() - requestStartedAt,
          errorType: "pending_query_failed",
        },
      });
    }

    if (!pending || pending.length === 0) {
      return jsonResponse({
        ok: true,
        processed: 0,
        failed: 0,
        total: 0,
        remainingPending: 0,
        hasMore: false,
        diagnostics: {
          batchSize: BATCH_LIMIT,
          durationMs: Date.now() - requestStartedAt,
          pendingFetched: 0,
          failureCount: 0,
          failedIds: [],
        },
      });
    }

    let processed = 0;
    let failed = 0;
    const failedIds: string[] = [];

    for (const item of pending) {
      try {
        if (!item.content || item.content.trim().length === 0) {
          await admin
            .from("email_embeddings")
            .update({ status: "failed", updated_at: new Date().toISOString() })
            .eq("id", item.id);
          failed += 1;
          failedIds.push(item.id);
          continue;
        }

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
          failed += 1;
          failedIds.push(item.id);
          continue;
        }

        const embJson = await embRes.json();
        const vector = embJson.data?.[0]?.embedding;

        if (!vector) {
          await admin
            .from("email_embeddings")
            .update({ status: "failed", updated_at: new Date().toISOString() })
            .eq("id", item.id);
          failed += 1;
          failedIds.push(item.id);
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
        processed += 1;
      } catch (error) {
        console.error("Item error:", error);
        await admin
          .from("email_embeddings")
          .update({ status: "failed", updated_at: new Date().toISOString() })
          .eq("id", item.id);
        failed += 1;
        failedIds.push(item.id);
      }
    }

    const { count: remainingPending, error: remainingPendingError } = await admin
      .from("email_embeddings")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");

    if (remainingPendingError) {
      return jsonResponse({
        ok: false,
        processed,
        failed,
        total: pending.length,
        remainingPending: 0,
        hasMore: false,
        error: remainingPendingError.message,
        diagnostics: {
          batchSize: BATCH_LIMIT,
          durationMs: Date.now() - requestStartedAt,
          pendingFetched: pending.length,
          failureCount: failed,
          failedIds: failedIds.slice(0, 10),
          errorType: "remaining_count_failed",
        },
      });
    }

    return jsonResponse({
      ok: true,
      processed,
      failed,
      total: pending.length,
      remainingPending: remainingPending || 0,
      hasMore: (remainingPending || 0) > 0,
      diagnostics: {
        batchSize: BATCH_LIMIT,
        durationMs: Date.now() - requestStartedAt,
        pendingFetched: pending.length,
        failureCount: failed,
        failedIds: failedIds.slice(0, 10),
      },
    });
  } catch (error) {
    console.error("generate-email-embeddings error:", error);
    return jsonResponse({
      ok: false,
      processed: 0,
      failed: 0,
      total: 0,
      remainingPending: 0,
      hasMore: false,
      error: error instanceof Error ? error.message : "Unknown error",
      diagnostics: {
        batchSize: BATCH_LIMIT,
        durationMs: Date.now() - requestStartedAt,
        errorType: "unexpected_exception",
      },
    });
  }
});
