import { supabase } from "@/integrations/supabase/client";

export const EMAIL_EMBEDDING_JOB_TYPE = "email_knowledge_embedding";

export interface EmailEmbeddingCounts {
  total: number;
  completed: number;
  pending: number;
  processing: number;
  failed: number;
  percentage: number;
}

export interface EmailEmbeddingJobStatus {
  id: string;
  job_type: string;
  status: string;
  trigger_source: string | null;
  last_started_at: string | null;
  last_finished_at: string | null;
  last_heartbeat_at: string | null;
  last_error: string | null;
  last_processed_count: number;
  last_failed_count: number;
  created_at: string;
  updated_at: string;
}

export interface KickoffEmailEmbeddingJobResult {
  ok: boolean;
  started: boolean;
  alreadyRunning?: boolean;
  message: string;
  worker?: {
    ok?: boolean;
    processed?: number;
    failed?: number;
    total?: number;
    remainingPending?: number;
    hasMore?: boolean;
  };
}

export async function fetchEmailEmbeddingCounts(): Promise<EmailEmbeddingCounts> {
  const [
    { count: total, error: totalError },
    { count: completed, error: completedError },
    { count: pending, error: pendingError },
    { count: processing, error: processingError },
    { count: failed, error: failedError },
  ] = await Promise.all([
    supabase.from("email_embeddings").select("id", { count: "exact", head: true }),
    supabase.from("email_embeddings").select("id", { count: "exact", head: true }).eq("status", "completed"),
    supabase.from("email_embeddings").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("email_embeddings").select("id", { count: "exact", head: true }).eq("status", "processing"),
    supabase.from("email_embeddings").select("id", { count: "exact", head: true }).eq("status", "failed"),
  ]);

  const error = totalError || completedError || pendingError || processingError || failedError;
  if (error) throw error;

  const totalValue = total || 0;
  const completedValue = completed || 0;

  return {
    total: totalValue,
    completed: completedValue,
    pending: pending || 0,
    processing: processing || 0,
    failed: failed || 0,
    percentage: totalValue > 0 ? Math.round((completedValue / totalValue) * 100) : 0,
  };
}

export async function fetchEmailEmbeddingJobStatus(): Promise<EmailEmbeddingJobStatus | null> {
  const { data, error } = await supabase
    .from("email_embedding_jobs")
    .select("*")
    .eq("job_type", EMAIL_EMBEDDING_JOB_TYPE)
    .maybeSingle();

  if (error) throw error;
  return (data as EmailEmbeddingJobStatus | null) ?? null;
}

export async function kickoffEmailEmbeddingJob(
  triggerSource: string,
  accessToken?: string,
): Promise<KickoffEmailEmbeddingJobResult> {
  let token = accessToken;

  if (!token) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      throw new Error("尚未登入");
    }

    token = session.access_token;
  }

  const { data, error } = await supabase.functions.invoke("kickoff-email-embedding-job", {
    headers: { Authorization: `Bearer ${token}` },
    body: { triggerSource },
  });

  if (error) throw error;
  return (data as KickoffEmailEmbeddingJobResult) || {
    ok: true,
    started: false,
    message: "背景索引已收到請求",
  };
}
