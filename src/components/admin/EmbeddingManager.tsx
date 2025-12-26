import { useState, useEffect } from "react";
import { Database, RefreshCw, Play, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

interface EmbeddingStatus {
  total: number;
  embedded: number;
  percentage: number;
}

const EmbeddingManager = () => {
  const [status, setStatus] = useState<EmbeddingStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState<{ processed: number; total: number } | null>(null);

  const fetchStatus = async () => {
    setIsLoading(true);
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-rma-embeddings`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ action: "status" }),
        }
      );
      
      if (!resp.ok) throw new Error("無法取得狀態");
      
      const data = await resp.json();
      setStatus(data);
    } catch (error) {
      console.error("Error fetching embedding status:", error);
      toast.error("無法取得向量索引狀態");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const processBatch = async (offset: number = 0): Promise<boolean> => {
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-rma-embeddings`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ action: "batch", batch_size: 25, offset }),
        }
      );
      
      if (!resp.ok) {
        const error = await resp.json().catch(() => ({}));
        throw new Error(error.error || "處理失敗");
      }
      
      const data = await resp.json();
      
      setProcessProgress({
        processed: data.embedded || 0,
        total: data.total || 0,
      });
      
      return data.hasMore;
    } catch (error) {
      console.error("Error processing batch:", error);
      throw error;
    }
  };

  const handleStartProcessing = async () => {
    setIsProcessing(true);
    setProcessProgress({ processed: 0, total: status?.total || 0 });
    
    try {
      let offset = 0;
      let hasMore = true;
      
      while (hasMore) {
        hasMore = await processBatch(offset);
        offset += 25;
        
        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      toast.success("向量索引處理完成！");
      await fetchStatus();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "處理失敗");
    } finally {
      setIsProcessing(false);
      setProcessProgress(null);
    }
  };

  const getStatusColor = () => {
    if (!status) return "text-muted-foreground";
    if (status.percentage === 100) return "text-green-600";
    if (status.percentage > 50) return "text-yellow-600";
    return "text-orange-600";
  };

  const getStatusIcon = () => {
    if (!status) return <Database className="w-5 h-5" />;
    if (status.percentage === 100) return <CheckCircle className="w-5 h-5 text-green-600" />;
    if (status.percentage > 0) return <AlertCircle className="w-5 h-5 text-yellow-600" />;
    return <AlertCircle className="w-5 h-5 text-orange-600" />;
  };

  return (
    <div className="rma-card p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {getStatusIcon()}
          <div>
            <h3 className="font-semibold text-foreground">RAG 向量索引</h3>
            <p className="text-sm text-muted-foreground">
              用於 AI 語意搜尋的向量資料庫
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchStatus}
          disabled={isLoading || isProcessing}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
        </Button>
      </div>

      {status && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">索引進度</span>
            <span className={getStatusColor()}>
              {status.embedded} / {status.total} ({status.percentage}%)
            </span>
          </div>
          
          <Progress value={status.percentage} className="h-2" />

          {status.percentage < 100 && (
            <div className="pt-2">
              <Button
                onClick={handleStartProcessing}
                disabled={isProcessing}
                size="sm"
                className="w-full"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    處理中... ({processProgress?.processed || 0} / {processProgress?.total || 0})
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    開始建立向量索引
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                首次建立約需 2-5 分鐘，依資料量而定
              </p>
            </div>
          )}

          {status.percentage === 100 && (
            <div className="pt-2 text-center">
              <p className="text-sm text-green-600 flex items-center justify-center gap-2">
                <CheckCircle className="w-4 h-4" />
                AI 分析已啟用 RAG 語意搜尋
              </p>
            </div>
          )}
        </div>
      )}

      {!status && !isLoading && (
        <p className="text-sm text-muted-foreground text-center py-4">
          無法取得狀態資訊
        </p>
      )}
    </div>
  );
};

export default EmbeddingManager;
