import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_LIMIT = 20;
const MAX_RUNTIME_MS = 45_000;
const STALE_PROCESSING_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const JOB_TYPE = "email_knowledge_embedding";

const jsonResponse = (payload: Record<string, unknown>, status = 200) => new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const nowIso = () => new Date().toISOString();
const extractMessage = (value: unknown, fallback: string) => value instanceof Error ? value.message : typeof value === "string" && value.trim() ? value : fallback;
const isInternalRequest = (authHeader: string | null, serviceKey: string) => authHeader === `Bearer ${serviceKey}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const requestStartedAt = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const authHeader = req.headers.get("Authorization");

    if (!openaiKey) return jsonResponse({ ok: false, processed: 0, failed: 0, total: 0, remainingPending: 0, hasMore: false, error: "OPENAI_API_KEY not configured", diagnostics: { batchSize: BATCH_LIMIT, durationMs: Date.now() - requestStartedAt, errorType: "missing_api_key" } }, 500);
    if (!authHeader) return jsonResponse({ ok: false, processed: 0, failed: 0, total: 0, remainingPending: 0, hasMore: false, error: "Unauthorized", diagnostics: { batchSize: BATCH_LIMIT, durationMs: Date.now() - requestStartedAt, errorType: "unauthorized" } }, 401);

    if (!isInternalRequest(authHeader, serviceKey)) {
      const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return jsonResponse({ ok: false, processed: 0, failed: 0, total: 0, remainingPending: 0, hasMore: false, error: "Unauthorized", diagnostics: { batchSize: BATCH_LIMIT, durationMs: Date.now() - requestStartedAt, errorType: "unauthorized" } }, 401);
      const adminCheck = createClient(supabaseUrl, serviceKey);
      const { data: roleData } = await adminCheck.from("user_roles").select("role").eq("user_id", user.id).in("role", ["admin", "super_admin"]).maybeSingle();
      if (!roleData) return jsonResponse({ ok: false, processed: 0, failed: 0, total: 0, remainingPending: 0, hasMore: false, error: "Forbidden", diagnostics: { batchSize: BATCH_LIMIT, durationMs: Date.now() - requestStartedAt, errorType: "forbidden" } }, 403);
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const requestBody = await req.json().catch(() => ({}));
    const triggerSource = typeof requestBody?.triggerSource === "string" ? requestBody.triggerSource : "manual";
    const staleBeforeIso = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();

    await admin.from("email_embedding_jobs").upsert({ job_type: JOB_TYPE, status: "running", trigger_source: triggerSource, last_started_at: nowIso(), last_heartbeat_at: nowIso(), last_error: null }, { onConflict: "job_type" });

    const { data: staleProcessing, error: staleError } = await admin.from("email_embeddings").select("id, attempt_count").eq("status", "processing").lt("processing_started_at", staleBeforeIso).limit(200);
    if (staleError) throw staleError;

    for (const item of staleProcessing || []) {
      const attempts = Number(item.attempt_count || 0);
      const nextStatus = attempts >= MAX_ATTEMPTS ? "failed" : "pending";
      await admin.from("email_embeddings").update({ status: nextStatus, processing_started_at: null, last_error: nextStatus === "failed" ? "處理逾時，已達最大重試次數" : "處理逾時，已重新排入佇列", updated_at: nowIso() }).eq("id", item.id);
    }

    let processed = 0, failed = 0, pendingFetched = 0, remainingPending = 0;
    const failedIds: string[] = [];
    let hasMore = false;

    while (Date.now() - requestStartedAt < MAX_RUNTIME_MS) {
      await admin.from("email_embedding_jobs").update({ status: "running", trigger_source: triggerSource, last_heartbeat_at: nowIso(), updated_at: nowIso() }).eq("job_type", JOB_TYPE);
      const { data: pending, error: pendingErr } = await admin.from("email_embeddings").select("id, content, attempt_count").eq("status", "pending").order("updated_at", { ascending: true }).limit(BATCH_LIMIT);
      if (pendingErr) throw pendingErr;
      if (!pending || pending.length === 0) break;
      pendingFetched += pending.length;

      for (const item of pending) {
        const attemptCount = Number(item.attempt_count || 0) + 1;
        await admin.from("email_embeddings").update({ status: "processing", processing_started_at: nowIso(), attempt_count: attemptCount, last_error: null, updated_at: nowIso() }).eq("id", item.id).eq("status", "pending");
        try {
          if (!item.content || item.content.trim().length === 0) {
            await admin.from("email_embeddings").update({ status: "failed", processing_started_at: null, last_error: "內容為空白，無法建立索引", updated_at: nowIso() }).eq("id", item.id);
            failed++; failedIds.push(item.id); continue;
          }
          const embRes = await fetch("https://api.openai.com/v1/embeddings", { method: "POST", headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "text-embedding-3-small", input: item.content.slice(0, 8000) }) });
          if (!embRes.ok) {
            const errText = await embRes.text();
            const nextStatus = attemptCount >= MAX_ATTEMPTS ? "failed" : "pending";
            await admin.from("email_embeddings").update({ status: nextStatus, processing_started_at: null, last_error: `OpenAI ${embRes.status}: ${errText.slice(0, 500)}`, updated_at: nowIso() }).eq("id", item.id);
            failed++; failedIds.push(item.id); continue;
          }
          const embJson = await embRes.json();
          const vector = embJson.data?.[0]?.embedding;
          if (!vector) {
            const nextStatus = attemptCount >= MAX_ATTEMPTS ? "failed" : "pending";
            await admin.from("email_embeddings").update({ status: nextStatus, processing_started_at: null, last_error: "Embedding 回傳內容缺失", updated_at: nowIso() }).eq("id", item.id);
            failed++; failedIds.push(item.id); continue;
          }
          await admin.from("email_embeddings").update({ embedding: vector, status: "completed", processing_started_at: null, last_error: null, updated_at: nowIso() }).eq("id", item.id);
          processed++;
        } catch (error) {
          const nextStatus = attemptCount >= MAX_ATTEMPTS ? "failed" : "pending";
          await admin.from("email_embeddings").update({ status: nextStatus, processing_started_at: null, last_error: extractMessage(error, "建立索引時發生未預期錯誤"), updated_at: nowIso() }).eq("id", item.id);
          failed++; failedIds.push(item.id);
        }
      }

      const { count, error: remainingError } = await admin.from("email_embeddings").select("id", { count: "exact", head: true }).in("status", ["pending", "processing"]);
      if (remainingError) throw remainingError;
      remainingPending = count || 0;
      hasMore = remainingPending > 0;
      if (!hasMore || Date.now() - requestStartedAt >= MAX_RUNTIME_MS - 5000) break;
    }

    const { count: finalCount, error: finalError } = await admin.from("email_embeddings").select("id", { count: "exact", head: true }).in("status", ["pending", "processing"]);
    if (finalError) throw finalError;
    remainingPending = finalCount || 0;
    hasMore = remainingPending > 0;

    await admin.from("email_embedding_jobs").update({ status: "idle", trigger_source: triggerSource, last_heartbeat_at: nowIso(), last_finished_at: nowIso(), last_processed_count: processed, last_failed_count: failed, last_error: null, updated_at: nowIso() }).eq("job_type", JOB_TYPE);

    return jsonResponse({ ok: true, processed, failed, total: pendingFetched, remainingPending, hasMore, diagnostics: { batchSize: BATCH_LIMIT, durationMs: Date.now() - requestStartedAt, pendingFetched, failureCount: failed, failedIds: failedIds.slice(0, 10) } });
  } catch (error) {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const message = extractMessage(error, "Unknown error");
    await admin.from("email_embedding_jobs").update({ status: "failed", last_error: message, last_finished_at: nowIso(), updated_at: nowIso() }).eq("job_type", JOB_TYPE);
    return jsonResponse({ ok: false, processed: 0, failed: 0, total: 0, remainingPending: 0, hasMore: false, error: message, diagnostics: { batchSize: BATCH_LIMIT, durationMs: Date.now() - requestStartedAt, errorType: "unexpected_exception" } }, 500);
  }
});
