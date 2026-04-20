import { useState, useEffect } from "react";
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

const EmailEmbeddingManager = () => {
  const [status, setStatus] = useState<EmailEmbeddingStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const fetchStatus = async () => {
    setIsLoading(true);
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

      const t = total || 0;
      const c = completed || 0;
      setStatus({
        total: t,
        completed: c,
        pending: pending || 0,
        failed: failed || 0,
        percentage: t > 0 ? Math.round((c / t) * 100) : 0,
      });
    } catch (e) {
      console.error("status fetch error:", e);
      toast.error("無法取得嵌入狀態");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleProcess = async () => {
    setIsProcessing(true);
    try {
      let totalProcessed = 0;
      while (true) {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) {
          toast.error("請先登入");
          break;
        }
        const { data, error } = await supabase.functions.invoke("generate-email-embeddings", {
          headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
        });
        if (error) throw error;
        if (!data || data.processed === 0) break;
        totalProcessed += data.processed;
        await new Promise((r) => setTimeout(r, 500));
        await fetchStatus();
      }
      toast.success(`處理完成！共處理 ${totalProcessed} 筆`);
      await fetchStatus();
    } catch (e: any) {
      console.error(e);
      toast.error("處理失敗：" + (e.message || "請稍後再試"));
    } finally {
      setIsProcessing(false);
    }
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
            <p className="text-sm text-muted-foreground">用於 AI 語意搜尋的 Email 知識庫</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchStatus} disabled={isLoading || isProcessing}>
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

          {status.pending > 0 && (
            <div className="flex items-center justify-between p-2 bg-yellow-50 dark:bg-yellow-950/30 rounded-md border border-yellow-200 dark:border-yellow-800">
              <div className="flex items-center gap-2 text-sm text-yellow-700 dark:text-yellow-400">
                <AlertCircle className="w-4 h-4" />
                <span>{status.pending} 筆待處理</span>
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
            <p className="text-sm text-muted-foreground text-center py-2">
              尚無知識來源，請先在上方新增
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default EmailEmbeddingManager;
