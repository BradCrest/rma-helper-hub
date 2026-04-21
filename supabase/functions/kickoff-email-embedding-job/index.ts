import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const JOB_TYPE = "email_knowledge_embedding";
const STALE_JOB_MS = 15 * 60 * 1000;
const jsonResponse = (payload: Record<string, unknown>, status = 200) => new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const normalizeTriggerSource = (value: unknown) => {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "manual";
  return ["manual", "upload", "update", "cron"].includes(normalized) ? normalized : "manual";
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ ok: false, started: false, message: "Unauthorized" }, 401);

  const isCronRequest = authHeader === `Bearer ${anonKey}`;
  const isServiceRequest = authHeader === `Bearer ${serviceKey}`;
  let userId: string | null = null;

  if (!isCronRequest && !isServiceRequest) {
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return jsonResponse({ ok: false, started: false, message: "Unauthorized" }, 401);
    userId = user.id;

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roleData } = await admin.from("user_roles").select("role").eq("user_id", user.id).in("role", ["admin", "super_admin"]).maybeSingle();
    if (!roleData) return jsonResponse({ ok: false, started: false, message: "Forbidden" }, 403);
  }

  const requestBody = await req.json().catch(() => ({}));
  const triggerSource = normalizeTriggerSource(requestBody?.triggerSource ?? (isCronRequest ? "cron" : "manual"));
  const admin = createClient(supabaseUrl, serviceKey);
  const now = new Date();
  const nowIso = now.toISOString();
  const staleBefore = now.getTime() - STALE_JOB_MS;

  const { data: existingJob, error: jobError } = await admin.from("email_embedding_jobs").select("*").eq("job_type", JOB_TYPE).maybeSingle();
  if (jobError) return jsonResponse({ ok: false, started: false, message: jobError.message }, 500);

  if (!existingJob) {
    const { error: insertError } = await admin.from("email_embedding_jobs").insert({ job_type: JOB_TYPE, status: "idle", trigger_source: triggerSource });
    if (insertError) return jsonResponse({ ok: false, started: false, message: insertError.message }, 500);
  }

  const lastHeartbeat = existingJob?.last_heartbeat_at ? new Date(existingJob.last_heartbeat_at).getTime() : 0;
  if (existingJob?.status === "running" && lastHeartbeat > staleBefore) {
    return jsonResponse({ ok: true, started: false, alreadyRunning: true, message: "背景索引已在執行中" });
  }

  const { error: updateError } = await admin.from("email_embedding_jobs").update({ status: "running", trigger_source: triggerSource, last_started_at: nowIso, last_heartbeat_at: nowIso, last_error: null, updated_at: nowIso }).eq("job_type", JOB_TYPE);
  if (updateError) return jsonResponse({ ok: false, started: false, message: updateError.message }, 500);

  try {
    const workerResponse = await fetch(`${supabaseUrl}/functions/v1/generate-email-embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ triggerSource, initiatedBy: userId ?? (isCronRequest ? "cron" : "service") }),
    });

    const workerJson = await workerResponse.json().catch(() => ({}));
    if (!workerResponse.ok) {
      const errorMessage = typeof workerJson?.error === "string" ? workerJson.error : "背景索引啟動失敗";
      await admin.from("email_embedding_jobs").update({ status: "failed", last_error: errorMessage, last_finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("job_type", JOB_TYPE);
      return jsonResponse({ ok: false, started: false, message: errorMessage, worker: workerJson }, 500);
    }

    return jsonResponse({ ok: true, started: true, message: workerJson?.hasMore ? "背景索引已啟動，剩餘項目會由排程持續接手" : "背景索引已啟動", worker: workerJson });
  } catch (error) {
    const message = error instanceof Error ? error.message : "背景索引啟動失敗";
    await admin.from("email_embedding_jobs").update({ status: "failed", last_error: message, last_finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("job_type", JOB_TYPE);
    return jsonResponse({ ok: false, started: false, message }, 500);
  }
});
