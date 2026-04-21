import { useCallback, useEffect, useRef, useState } from "react";
import { Database, RefreshCw, Play, CheckCircle, AlertCircle, Loader2, WifiOff, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface EmailEmbeddingStatus {
  total: number;
  completed: number;
  pending: number;
  failed: number;
  percentage: number;
}

interface EmailEmbeddingDiagnostics {
  batchSize?: number;
  durationMs?: number;
  pendingFetched?: number;
  failureCount?: number;
  failedIds?: string[];
  errorType?: string;
}

interface EmailEmbeddingResponse {
  ok: boolean;
  processed: number;
  failed: number;
  total: number;
  remainingPending: number;
  hasMore: boolean;
  error?: string;
  diagnostics?: EmailEmbeddingDiagnostics;
}

interface EmailEmbeddingManagerProps {
  autoStartSignal?: number;
}

const RETRY_BASE_DELAY_MS = 2000;
const RETRY_MAX_ATTEMPTS = 4;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isTransientFunctionError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || "");
  const normalized = message.toLowerCase();

  return [
    "failed to fetch",
    "functionsfetcherror",
    "networkerror",
    "load failed",
    "network request failed",
    "the network connection was lost",
    "request timed out",
    "gateway",
    "timeout",
  ].some((keyword) => normalized.includes(keyword));
};

const formatDateTime = (value: string | null) => {
  if (!value) return "尚無紀錄";
  return new Date(value).toLocaleString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const EmailEmbeddingManager = ({ autoStartSignal = 0 }: EmailEmbeddingManagerProps) => {
  const [status, setStatus] = useState<EmailEmbeddingStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processMessage, setProcessMessage] = useState("");
  const [lastBatchProcessed, setLastBatchProcessed] = useState(0);
  const [lastSuccessAt, setLastSuccessAt] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const processingRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const pendingRef = useRef<number | null>(null);

  const fetchStatus = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setIsLoading(true);

    try {
      const [
        { count: total, error: totalError },
        { count: completed, error: completedError },
        { count: pending, error: pendingError },
        { count: failed, error: failedError },
      ] = await Promise.all([
        supabase.from("email_embeddings").select("id", { count: "exact", head: true }),
        supabase.from("email_embeddings").select("id", { count: "exact", head: true }).eq("status", "completed"),
        supabase.from("email_embeddings").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("email_embeddings").select("id", { count: "exact", head: true }).eq("status", "failed"),
      ]);

      const error = totalError || completedError || pendingError || failedError;
      if (error) throw error;

      const nextStatus = {
        total: total || 0,
        completed: completed || 0,
        pending: pending || 0,
        failed: failed || 0,
        percentage: (total || 0) > 0 ? Math.round(((completed || 0) / (total || 0)) * 100) : 0,
      };

      pendingRef.current = nextStatus.pending;
      setStatus(nextStatus);
      return nextStatus;
    } catch (e) {
      console.error("status fetch error:", e);
      if (!options?.silent) toast.error("無法取得嵌入狀態");
      return null;
    } finally {
      if (!options?.silent) setIsLoading(false);
    }
  }, []);

  const processPendingEmbeddings = useCallback(async (mode: "auto" | "manual" = "auto") => {
    if (processingRef.current) return;

    processingRef.current = true;
    stopRequestedRef.current = false;
    setIsProcessing(true);
    setRetryCount(0);
    setProcessMessage(mode === "auto" ? "偵測到待索引項目，系統正在自動處理" : "系統正在分批建立索引");

    let totalProcessed = 0;
    let staleRounds = 0;
    let transientFailures = 0;
    let fatalError = false;

    try {
      while (!stopRequestedRef.current) {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          if (!sessionData.session) {
            toast.error("請先登入");
            fatalError = true;
            break;
          }

          const invokeStartedAt = Date.now();
          const { data, error } = await supabase.functions.invoke("generate-email-embeddings", {
            headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
          });

          if (error) throw error;

          const result = (data || {}) as Partial<EmailEmbeddingResponse>;
          if (result.ok === false) {
            const backendError = new Error(result.error || "索引服務回傳錯誤");
            (backendError as Error & { diagnostics?: EmailEmbeddingDiagnostics }).diagnostics = result.diagnostics;
            throw backendError;
          }

          const processed = Number(result.processed ?? 0);
          const failed = Number(result.failed ?? 0);
          const diagnostics = result.diagnostics;
          const remainingPending = typeof result.remainingPending === "number" ? result.remainingPending : null;

          totalProcessed += processed;
          transientFailures = 0;
          setRetryCount(0);
          setLastBatchProcessed(processed);
          setLastSuccessAt(new Date().toISOString());

          const refreshed = await fetchStatus({ silent: true });
          const nextPending = remainingPending ?? refreshed?.pending ?? 0;
          const previousPending = pendingRef.current ?? refreshed?.pending ?? nextPending;
          const madeProgress = processed > 0 || nextPending < previousPending;

          pendingRef.current = nextPending;
          staleRounds = madeProgress ? 0 : staleRounds + 1;

          if (nextPending <= 0) {
            setProcessMessage(totalProcessed > 0 ? `索引完成，共處理 ${totalProcessed} 筆` : "所有知識來源已完成索引");
            break;
          }

          if (staleRounds >= 2) {
            setProcessMessage(`尚有 ${nextPending} 筆待索引，但最近兩輪沒有新進度，請稍後再試`);
            toast.error(`索引已暫停，仍有 ${nextPending} 筆待處理`);
            fatalError = true;
            break;
          }

          const durationSeconds = diagnostics?.durationMs
            ? Math.max(diagnostics.durationMs, Date.now() - invokeStartedAt) / 1000
            : (Date.now() - invokeStartedAt) / 1000;
          const batchSummary = [
            `本輪完成 ${processed} 筆`,
            failed > 0 ? `另有 ${failed} 筆失敗` : null,
            `剩餘 ${nextPending} 筆待索引`,
            `耗時約 ${durationSeconds.toFixed(1)} 秒`,
          ]
            .filter(Boolean)
            .join("，");

          setProcessMessage(
            nextPending > 1000
              ? `${batchSummary}；目前資料量較大，系統會持續分批處理`
              : batchSummary,
          );

          await sleep(nextPending > 1000 ? 1500 : 700);
        } catch (e) {
          if (stopRequestedRef.current) break;

          const transient = isTransientFunctionError(e);
          if (transient && transientFailures < RETRY_MAX_ATTEMPTS) {
            transientFailures += 1;
            setRetryCount(transientFailures);
            const retryDelay = RETRY_BASE_DELAY_MS * 2 ** (transientFailures - 1);
            setProcessMessage(`連線暫時中斷，${Math.round(retryDelay / 1000)} 秒後自動重試（第 ${transientFailures}/${RETRY_MAX_ATTEMPTS} 次）`);
            await sleep(retryDelay);
            continue;
          }

          console.error(e);
          const message = e instanceof Error ? e.message : "請稍後再試";
          setProcessMessage(transient ? "連線多次中斷，請稍後再試" : `索引處理失敗：${message}`);
          toast.error(transient ? "連線多次中斷，請稍後再試" : `處理失敗：${message}`);
          fatalError = true;
          break;
        }
      }

      if (!fatalError && mode === "manual") {
        toast.success(totalProcessed > 0 ? `處理完成！共處理 ${totalProcessed} 筆` : "目前沒有待處理索引");
      }
    } finally {
      processingRef.current = false;
      setIsProcessing(false);
    }
  }, [fetchStatus]);

  useEffect(() => {
    let active = true;

    fetchStatus().then((nextStatus) => {
      if (!active) return;
      if ((nextStatus?.pending || 0) > 0) {
        setProcessMessage(
          (nextStatus?.pending || 0) > 1000
            ? `偵測到 ${nextStatus?.pending} 筆待索引，資料量較大，系統將持續分批處理`
            : `偵測到 ${nextStatus?.pending} 筆待索引，系統正在自動處理`,
        );
        void processPendingEmbeddings("auto");
      }
    });

    return () => {
      active = false;
      stopRequestedRef.current = true;
    };
  }, [fetchStatus, processPendingEmbeddings]);

  useEffect(() => {
    if (autoStartSignal <= 0) return;

    void fetchStatus({ silent: true }).then((nextStatus) => {
      if ((nextStatus?.pending || 0) > 0) {
        setProcessMessage(`已接續新的索引工作，目前剩餘 ${nextStatus?.pending} 筆待索引`);
        void processPendingEmbeddings("auto");
      }
    });
  }, [autoStartSignal, fetchStatus, processPendingEmbeddings]);

  const handleProcess = async () => {
    await processPendingEmbeddings("manual");
    await fetchStatus({ silent: true });
  };

  const allDone = status && status.pending === 0 && status.total > 0;
  const isRetrying = retryCount > 0;

  return (
    <div className="rma-card p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {allDone ? (
            <CheckCircle className="h-5 w-5 text-green-600" />
          ) : isRetrying ? (
            <WifiOff className="h-5 w-5 text-orange-600" />
          ) : status && status.pending > 0 ? (
            <AlertCircle className="h-5 w-5 text-orange-600" />
          ) : (
            <Database className="h-5 w-5" />
          )}
          <div>
            <h3 className="font-semibold text-foreground">Email 知識庫向量索引</h3>
            <p className="text-sm text-muted-foreground">系統會分批處理 pending 項目，直到全部完成</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => void fetchStatus()} disabled={isLoading || isProcessing}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>

      {status && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">索引進度</span>
            <span>
              {status.completed} / {status.total} ({status.percentage}%)
            </span>
          </div>
          <Progress value={status.percentage} className="h-2" />

          <div className="grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-2">
            <div className="rounded-md bg-muted/40 px-3 py-2">剩餘待索引：{status.pending} 筆</div>
            <div className="rounded-md bg-muted/40 px-3 py-2">本輪處理：{lastBatchProcessed} 筆</div>
            <div className="rounded-md bg-muted/40 px-3 py-2">失敗筆數：{status.failed} 筆</div>
            <div className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2">
              <Clock3 className="h-3.5 w-3.5" /> 最近成功：{formatDateTime(lastSuccessAt)}
            </div>
          </div>

          {processMessage && <p className="text-xs text-muted-foreground">{processMessage}</p>}

          {status.pending > 0 && (
            <div className="flex items-center justify-between rounded-md border border-yellow-200 bg-yellow-50 p-2 dark:border-yellow-800 dark:bg-yellow-950/30">
              <div className="flex items-center gap-2 text-sm text-yellow-700 dark:text-yellow-400">
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : isRetrying ? <WifiOff className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                <span>
                  {isRetrying
                    ? `連線暫時中斷，系統正在重試（${retryCount}/${RETRY_MAX_ATTEMPTS}）`
                    : isProcessing
                    ? `自動處理中，剩餘 ${status.pending} 筆`
                    : `${status.pending} 筆待處理`}
                </span>
              </div>
              <Button onClick={handleProcess} disabled={isProcessing} size="sm">
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" /> 處理中...
                  </>
                ) : (
                  <>
                    <Play className="mr-1 h-3 w-3" /> 立即生成
                  </>
                )}
              </Button>
            </div>
          )}

          {status.failed > 0 && (
            <p className="text-xs text-destructive">⚠️ {status.failed} 筆嵌入失敗；其餘項目仍會持續處理，可稍後檢查失敗內容再重試</p>
          )}

          {allDone && (
            <p className="flex items-center justify-center gap-2 pt-2 text-sm text-green-600">
              <CheckCircle className="h-4 w-4" /> 所有知識來源已完成索引
            </p>
          )}

          {status.total === 0 && (
            <p className="py-2 text-center text-sm text-muted-foreground">尚無知識來源，請先在上方新增</p>
          )}
        </div>
      )}
    </div>
  );
};

export default EmailEmbeddingManager;
