import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertCircle, CheckCircle, Clock3, Database, Loader2, Play, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  fetchEmailEmbeddingCounts,
  fetchEmailEmbeddingJobStatus,
  kickoffEmailEmbeddingJob,
  type EmailEmbeddingCounts,
  type EmailEmbeddingJobStatus,
} from "@/lib/email-embedding-job";

interface EmailEmbeddingManagerProps {
  autoStartSignal?: number;
}

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
  const [counts, setCounts] = useState<EmailEmbeddingCounts | null>(null);
  const [job, setJob] = useState<EmailEmbeddingJobStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTriggering, setIsTriggering] = useState(false);

  const fetchDashboard = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setIsLoading(true);

    try {
      const [nextCounts, nextJob] = await Promise.all([
        fetchEmailEmbeddingCounts(),
        fetchEmailEmbeddingJobStatus(),
      ]);
      setCounts(nextCounts);
      setJob(nextJob);
      return { counts: nextCounts, job: nextJob };
    } catch (error) {
      console.error("email embedding dashboard error:", error);
      if (!options?.silent) toast.error("無法取得背景索引狀態");
      return null;
    } finally {
      if (!options?.silent) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDashboard();
    const timer = window.setInterval(() => {
      void fetchDashboard({ silent: true });
    }, 8000);
    return () => window.clearInterval(timer);
  }, [fetchDashboard]);

  useEffect(() => {
    if (autoStartSignal <= 0) return;
    void fetchDashboard({ silent: true });
  }, [autoStartSignal, fetchDashboard]);

  const handleKickoff = useCallback(async () => {
    setIsTriggering(true);
    try {
      const result = await kickoffEmailEmbeddingJob("manual");
      toast.success(result.message);
      await fetchDashboard({ silent: true });
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "背景索引喚醒失敗");
    } finally {
      setIsTriggering(false);
    }
  }, [fetchDashboard]);

  const statusTone = useMemo(() => {
    if (job?.status === "failed") return "destructive";
    if (job?.status === "running") return "primary";
    if ((counts?.pending || 0) > 0 || (counts?.processing || 0) > 0) return "primary";
    return "muted";
  }, [counts?.pending, counts?.processing, job?.status]);

  const statusMessage = useMemo(() => {
    if (!counts) return "讀取中...";
    if (job?.status === "failed") return job.last_error || "背景索引發生錯誤";
    if (job?.status === "running") {
      return counts.processing > 0
        ? `背景索引執行中，目前有 ${counts.processing} 筆處理中、${counts.pending} 筆待處理`
        : "背景索引正在啟動中";
    }
    if (counts.pending > 0 || counts.processing > 0) {
      return `尚有 ${counts.pending} 筆待處理、${counts.processing} 筆處理中；排程會自動續跑`;
    }
    if (counts.failed > 0) {
      return `目前有 ${counts.failed} 筆失敗，可稍後檢查錯誤後再重新喚醒背景索引`;
    }
    if (counts.total === 0) return "尚無知識來源，請先新增內容或上傳檔案";
    return "所有知識來源已完成索引";
  }, [counts, job]);

  const isBusy = isLoading || isTriggering;
  const hasPendingWork = (counts?.pending || 0) > 0 || (counts?.processing || 0) > 0;

  return (
    <div className="rma-card p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {job?.status === "failed" ? (
            <AlertCircle className="h-5 w-5 text-destructive" />
          ) : !counts ? (
            <Database className="h-5 w-5 text-muted-foreground" />
          ) : counts.pending === 0 && counts.processing === 0 && counts.total > 0 ? (
            <CheckCircle className="h-5 w-5 text-primary" />
          ) : (
            <Activity className="h-5 w-5 text-primary" />
          )}
          <div>
            <h3 className="font-semibold text-foreground">Email 知識庫向量索引</h3>
            <p className="text-sm text-muted-foreground">改為背景自動索引，頁面只顯示工作狀態</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void fetchDashboard()} disabled={isBusy}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          <Button size="sm" onClick={handleKickoff} disabled={isBusy}>
            {isTriggering ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> 喚醒中...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" /> 立即喚醒背景索引
              </>
            )}
          </Button>
        </div>
      </div>

      {counts && (
        <>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">完成進度</span>
              <span className="text-foreground">
                {counts.completed} / {counts.total} ({counts.percentage}%)
              </span>
            </div>
            <Progress value={counts.percentage} className="h-2" />
          </div>

          <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-md bg-muted/40 px-3 py-2 text-muted-foreground">待處理：{counts.pending} 筆</div>
            <div className="rounded-md bg-muted/40 px-3 py-2 text-muted-foreground">處理中：{counts.processing} 筆</div>
            <div className="rounded-md bg-muted/40 px-3 py-2 text-muted-foreground">完成：{counts.completed} 筆</div>
            <div className="rounded-md bg-muted/40 px-3 py-2 text-muted-foreground">失敗：{counts.failed} 筆</div>
            <div className="rounded-md bg-muted/40 px-3 py-2 text-muted-foreground">最近批次完成：{job?.last_processed_count ?? 0} 筆</div>
            <div className="rounded-md bg-muted/40 px-3 py-2 text-muted-foreground">最近批次失敗：{job?.last_failed_count ?? 0} 筆</div>
          </div>

          <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">背景工作狀態</span>
              <span className={statusTone === "destructive" ? "text-destructive" : statusTone === "primary" ? "text-primary" : "text-muted-foreground"}>
                {job?.status === "running"
                  ? "執行中"
                  : job?.status === "failed"
                    ? "失敗"
                    : hasPendingWork
                      ? "待排程續跑"
                      : "閒置"}
              </span>
            </div>
            <p className="text-sm text-foreground">{statusMessage}</p>
            <div className="grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-2">
              <div className="flex items-center gap-2 rounded-md bg-background px-3 py-2">
                <Clock3 className="h-3.5 w-3.5" /> 最近啟動：{formatDateTime(job?.last_started_at ?? null)}
              </div>
              <div className="flex items-center gap-2 rounded-md bg-background px-3 py-2">
                <Clock3 className="h-3.5 w-3.5" /> 最近心跳：{formatDateTime(job?.last_heartbeat_at ?? null)}
              </div>
              <div className="flex items-center gap-2 rounded-md bg-background px-3 py-2">
                <Clock3 className="h-3.5 w-3.5" /> 最近完成：{formatDateTime(job?.last_finished_at ?? null)}
              </div>
              <div className="rounded-md bg-background px-3 py-2 text-muted-foreground">觸發來源：{job?.trigger_source || "尚無紀錄"}</div>
            </div>
            {job?.last_error && (
              <p className="text-xs text-destructive">最近錯誤：{job.last_error}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default EmailEmbeddingManager;
