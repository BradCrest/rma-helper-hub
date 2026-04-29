import { useEffect, useState, useCallback } from "react";
import { Loader2, Trash2, RefreshCw, HardDrive } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

interface CleanupLog {
  id: string;
  cleanup_run_at: string;
  trigger_source: string;
  files_deleted: number;
  bytes_freed: number;
  error: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function AttachmentCleanupSettings() {
  const [logs, setLogs] = useState<CleanupLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("rma_attachment_cleanup_logs")
      .select("id, cleanup_run_at, trigger_source, files_deleted, bytes_freed, error")
      .order("cleanup_run_at", { ascending: false })
      .limit(10);
    if (error) {
      toast.error("讀取清理紀錄失敗：" + error.message);
    } else {
      setLogs((data || []) as CleanupLog[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const runCleanup = async () => {
    if (!confirm("立即執行附件清理？\n\n會刪除所有「已完成且結案超過 90 天」的 RMA 對應的附件。")) return;
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("cleanup-rma-attachments", {
        body: { trigger: "manual" },
      });
      if (error) throw error;
      const result = data as { filesDeleted?: number; bytesFreed?: number; error?: string | null };
      if (result?.error) {
        toast.error("清理過程中發生錯誤：" + result.error);
      } else {
        toast.success(
          `清理完成：刪除 ${result?.filesDeleted ?? 0} 個檔案，釋出 ${formatBytes(result?.bytesFreed ?? 0)}`,
        );
      }
      await loadLogs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "執行失敗");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-border p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <HardDrive className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">附件清理</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadLogs} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={runCleanup} disabled={running}>
            {running ? (
              <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
            ) : (
              <Trash2 className="w-4 h-4 mr-1.5" />
            )}
            立即執行清理
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mb-4">
        系統每週日凌晨 03:00 (UTC) 會自動清理「已完成且結案超過 90 天」的 RMA 對應的回覆附件，釋放儲存空間。
        附件刪除後，訊息本文與檔名仍保留在對話紀錄中，但檔案無法再下載。
      </p>

      {logs.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-6">
          目前尚無清理紀錄
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="text-left py-2 px-2 font-medium">執行時間</th>
                <th className="text-left py-2 px-2 font-medium">觸發來源</th>
                <th className="text-right py-2 px-2 font-medium">刪除數量</th>
                <th className="text-right py-2 px-2 font-medium">釋出空間</th>
                <th className="text-left py-2 px-2 font-medium">狀態</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="py-2 px-2 whitespace-nowrap">
                    {format(new Date(log.cleanup_run_at), "yyyy-MM-dd HH:mm")}
                  </td>
                  <td className="py-2 px-2">
                    {log.trigger_source === "manual" ? "手動" : "排程"}
                  </td>
                  <td className="py-2 px-2 text-right">{log.files_deleted}</td>
                  <td className="py-2 px-2 text-right">{formatBytes(log.bytes_freed)}</td>
                  <td className="py-2 px-2">
                    {log.error ? (
                      <span className="text-destructive text-xs" title={log.error}>失敗</span>
                    ) : (
                      <span className="text-emerald-600 text-xs">成功</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
