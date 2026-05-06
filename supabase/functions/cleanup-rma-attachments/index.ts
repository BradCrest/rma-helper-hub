// Scheduled (and manual) cleanup of RMA reply attachments.
// Rule: when an RMA's status = 'closed' and it was closed > 90 days ago,
// remove all storage objects under rma-attachments/rma-replies/{rma_id}/
// and clear the `attachments` jsonb arrays in rma_thread_messages.
// Writes an audit log row to rma_attachment_cleanup_logs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "rma-attachments";
const RETENTION_DAYS = 90;

interface AttachmentDetail {
  rma_id: string;
  rma_number?: string | null;
  message_id: string;
  path: string;
  size: number;
  age_days: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  let trigger = "cron";
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.trigger === "manual") trigger = "manual";
  } catch (_) {}

  const detailsAll: AttachmentDetail[] = [];
  let filesDeleted = 0;
  let bytesFreed = 0;
  let runError: string | null = null;

  try {
    // 1. Find candidate RMAs: closed and stale.
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400 * 1000).toISOString();
    const { data: rmas, error: rmaErr } = await admin
      .from("rma_requests")
      .select("id, rma_number, status, updated_at")
      .eq("status", "closed")
      .lt("updated_at", cutoff);
    if (rmaErr) throw new Error(`load rmas: ${rmaErr.message}`);

    for (const rma of rmas ?? []) {
      // 2. Find messages with attachments for this RMA.
      const { data: messages, error: msgErr } = await admin
        .from("rma_thread_messages")
        .select("id, attachments, created_at")
        .eq("rma_request_id", rma.id);
      if (msgErr) {
        console.error("load messages failed", rma.id, msgErr.message);
        continue;
      }

      const pathsToDelete: string[] = [];
      const messageIdsToClear: string[] = [];

      for (const m of messages ?? []) {
        const atts = Array.isArray(m.attachments) ? m.attachments : [];
        if (atts.length === 0) continue;
        for (const a of atts) {
          if (!a?.path) continue;
          pathsToDelete.push(a.path);
          const ageMs = Date.now() - new Date(m.created_at).getTime();
          detailsAll.push({
            rma_id: rma.id,
            rma_number: rma.rma_number,
            message_id: m.id,
            path: a.path,
            size: typeof a.size === "number" ? a.size : 0,
            age_days: Math.floor(ageMs / 86400000),
          });
          bytesFreed += typeof a.size === "number" ? a.size : 0;
        }
        messageIdsToClear.push(m.id);
      }

      if (pathsToDelete.length === 0) continue;

      // 3. Remove storage objects (batches of 100).
      for (let i = 0; i < pathsToDelete.length; i += 100) {
        const batch = pathsToDelete.slice(i, i + 100);
        const { error: rmErr } = await admin.storage.from(BUCKET).remove(batch);
        if (rmErr) {
          console.error("storage remove failed", rmErr.message);
        } else {
          filesDeleted += batch.length;
        }
      }

      // 4. Clear attachments jsonb on those messages.
      if (messageIdsToClear.length > 0) {
        const { error: updErr } = await admin
          .from("rma_thread_messages")
          .update({ attachments: [] })
          .in("id", messageIdsToClear);
        if (updErr) console.error("clear attachments failed", updErr.message);
      }
    }
  } catch (e) {
    runError = e instanceof Error ? e.message : String(e);
    console.error("cleanup error", runError);
  }

  // 5. Write audit log
  await admin.from("rma_attachment_cleanup_logs").insert({
    trigger_source: trigger,
    files_deleted: filesDeleted,
    bytes_freed: bytesFreed,
    details: detailsAll,
    error: runError,
  });

  return new Response(
    JSON.stringify({
      ok: !runError,
      filesDeleted,
      bytesFreed,
      error: runError,
    }),
    {
      status: runError ? 500 : 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
