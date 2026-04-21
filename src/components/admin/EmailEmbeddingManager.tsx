import { useCallback, useEffect, useRef, useState } from "react";
import { Database, RefreshCw, Play, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
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

interface EmailEmbeddingManagerProps {
  autoStartSignal?: number;
}

const EmailEmbeddingManager = ({ autoStartSignal = 0 }: EmailEmbeddingManagerProps) => {
  const [status, setStatus] = useState<EmailEmbeddingStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processMessage, setProcessMessage] = useState("");
  const processingRef = useRef(false);
  const stopRequestedRef = useRef(false);

  const fetchStatus = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setIsLoading(true);

    try {
      const { count: total } = await supabase
        .from("email_embeddings")
        .select("id", { count: "exact", head: true });
      const { count: completed } = await supabase
        .from("email_embeddings")
        .select("id", { count: "exact", head: true })
        .eq("status", "completed");
      const { count: pending } = await supabase
        .from("email_embeddings")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      const { count: failed } = await supabase
        .from("email_embeddings")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed");

      const nextStatus = {
        total: total || 0,
        completed: completed || 0,
        pending: pending || 0,
        failed: failed || 0,
        percentage: (total || 0) > 0 ? Math.round(((completed || 0) / (total || 0)) * 100) : 0,
      };

      setStatus(nextStatus);
      return nextStatus;
    } catch (e) {
      console.error("status fetch error:", e);
      toast.error("無法取得嵌入狀態");
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
    setProcessMessage(mode === "auto" ? "偵測到待索引項目，系統正在自動處理" : "系統正在分批建立索引");

    let totalProcessed = 0;
    let staleRounds = 0;

    try {
      while (!stopRequestedRef.current) {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) {
          toast.error("請先登入");
          break;
        }

        const { data, error } = await supabase.functions.invoke("generate-email-embeddings", {
          headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
        });

        if (error) throw error;

        const processed = data?.processed ?? 0;
        const failed = data?.failed ?? 0;
        const remainingPending = typeof data?.remainingPending === "number" ? data.remainingPending : null;

        totalProcessed += processed;
        staleRounds = processed === 0 ? staleRounds + 1 : 0;

        const refreshed = await fetchStatus({ silent: true });
        const nextPending = remainingPending ?? refreshed?.pending ?? 0;

        if (nextPending <= 0) {
          setProcessMessage(totalProcessed > 0 ? `索引完成，共處理 ${totalProcessed} 筆` : "所有知識來源已完成索引");
          break;
        }

        if (staleRounds >= 2 || (failed > 0 && processed === 0)) {
          setProcessMessage(`尚有 ${nextPending} 筆待索引，請檢查失敗項目後再重試`);
          toast.error(`索引已暫停，仍有 ${nextPending} 筆待處理`);
          break;
        }

        setProcessMessage(`本輪完成 ${processed} 筆，剩餘 ${nextPending} 筆待索引`);
        await new Promise((resolve) => setTimeout(resolve, 700));
      }

      if (mode === "manual" && totalProcessed > 0) {
        toast.success(`處理完成！共處理 ${totalProcessed} 筆`);
      }
    } catch (e: any) {
      console.error(e);
      setProcessMessage("索引處理失敗，請稍後再試");
      toast.error("處理失敗：" + (e.message || "請稍後再試"));
    } finally {
      processingRef.current = false;
      setIsProcessing(false);
    }
  }, [fetchStatus]);

  useEffect(() => {
    let active = true;

    fetchStatus().then((nextStatus) => {
      if (active && (nextStatus?.pending || 0) > 0) {
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
        void processPendingEmbeddings("auto");
      }
    });
  }, [autoStartSignal, fetchStatus, processPendingEmbeddings]);

  const handleProcess = async () => {
    await processPendingEmbeddings("manual");
    await fetchStatus({ silent: true });
  };

  const allDone = status && status.pending === 0 && status.total > 0;

  return (
    <div className="rma-card p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {allDone ? (
            <CheckCircle className="w-5 h-5 text-green-600" />
          ) : status && status.pending > 0 ? (
            <AlertCircle className="w-5 h-5 text-orange-600" />
          ) : (
            <Database className="w-5 h-5" />
          )}
          <div>
            <h3 className="font-semibold text-foreground">Email 知識庫向量索引</h3>
            <p className="text-sm text-muted-foreground">系統會分批處理 pending 項目，直到全部完成</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => void fetchStatus()} disabled={isLoading || isProcessing}>
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
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

          {processMessage && <p className="text-xs text-muted-foreground">{processMessage}</p>}

          {status.pending > 0 && (
            <div className="flex items-center justify-between p-2 bg-yellow-50 dark:bg-yellow-950/30 rounded-md border border-yellow-200 dark:border-yellow-800">
              <div className="flex items-center gap-2 text-sm text-yellow-700 dark:text-yellow-400">
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertCircle className="w-4 h-4" />}
                <span>{isProcessing ? `自動處理中，剩餘 ${status.pending} 筆` : `${status.pending} 筆待處理`}</span>
              </div>
              <Button onClick={handleProcess} disabled={isProcessing} size="sm">
                {isProcessing ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" /> 處理中...
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3 mr-1" /> 立即生成
                  </>
                )}
              </Button>
            </div>
          )}

          {status.failed > 0 && (
            <p className="text-xs text-destructive">⚠️ {status.failed} 筆嵌入失敗，請檢查內容後重新觸發</p>
          )}

          {allDone && (
            <p className="text-sm text-green-600 flex items-center justify-center gap-2 pt-2">
              <CheckCircle className="w-4 h-4" /> 所有知識來源已完成索引
            </p>
          )}

          {status.total === 0 && (
            <p className="text-sm text-muted-foreground text-center py-2">尚無知識來源，請先在上方新增</p>
          )}
        </div>
      )}
    </div>
  );
};

export default EmailEmbeddingManager;
