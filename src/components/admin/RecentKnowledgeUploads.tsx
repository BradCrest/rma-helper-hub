import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { FileText, Loader2, CheckCircle2, AlertCircle, Clock, RotateCw, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { kickoffEmailEmbeddingJob } from "@/lib/email-embedding-job";

interface UploadGroup {
  source_id: string;
  file_path: string;
  file_name: string;
  file_size: number | null;
  earliest_created_at: string;
  total_chunks: number;
  total: number;
  completed: number;
  pending: number;
  processing: number;
  failed: number;
  saved_from?: string;
  tag?: string;
}

const SAVED_FROM_LABELS: Record<string, string> = {
  email_knowledge_chat: "💬 知識庫 AI 對話（修正）",
  email_knowledge_chat_learning: "✨ 知識庫 AI 對話（主動學習）",
  draft_email_reply: "✍️ 草擬回覆信件（修正）",
  draft_email_reply_learning: "✨ 草擬回覆信件（主動學習）",
};

const resolveDisplayName = (source: { file_name?: string | null; metadata?: any }) => {
  if (source.file_name) return source.file_name;
  const savedFrom = source.metadata?.saved_from;
  if (savedFrom && SAVED_FROM_LABELS[savedFrom]) return SAVED_FROM_LABELS[savedFrom];
  const tag = source.metadata?.tag;
  if (tag) return `#${tag}`;
  return "（手動建立）";
};

export interface RecentKnowledgeUploadsHandle {
  refresh: () => void;
  scrollIntoView: () => void;
}

const POLL_INTERVAL = 5000;
const WINDOW_HOURS = 24;

const formatRelativeTime = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec} 秒前`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分鐘前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小時前`;
  return new Date(iso).toLocaleString("zh-TW");
};

const formatSize = (bytes: number | null) => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

const RecentKnowledgeUploads = forwardRef<RecentKnowledgeUploadsHandle>((_props, ref) => {
  const [groups, setGroups] = useState<UploadGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reindexing, setReindexing] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    try {
      const sinceIso = new Date(Date.now() - WINDOW_HOURS * 3600 * 1000).toISOString();
      const { data: sources, error: srcErr } = await supabase
        .from("email_knowledge_sources")
        .select("id, file_path, file_name, file_size, created_at, metadata")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false });
      if (srcErr) throw srcErr;

      const sourceList = (sources || []) as any[];
      if (sourceList.length === 0) {
        setGroups([]);
        return;
      }

      const ids = sourceList.map((s) => s.id);
      const { data: embs, error: embErr } = await supabase
        .from("email_embeddings")
        .select("source_id, status")
        .in("source_id", ids);
      if (embErr) throw embErr;

      const statusBySource = new Map<string, { completed: number; pending: number; processing: number; failed: number; total: number }>();
      for (const e of (embs || []) as any[]) {
        const cur = statusBySource.get(e.source_id) || { completed: 0, pending: 0, processing: 0, failed: 0, total: 0 };
        cur.total += 1;
        if (e.status === "completed") cur.completed += 1;
        else if (e.status === "pending") cur.pending += 1;
        else if (e.status === "processing") cur.processing += 1;
        else if (e.status === "failed") cur.failed += 1;
        statusBySource.set(e.source_id, cur);
      }

      // Group by file_path (file uploads share the same file_path across chunks).
      // Manual / AI-saved entries (no file_path) are grouped per-source by saved_from + id.
      const groupMap = new Map<string, UploadGroup>();
      for (const s of sourceList) {
        const savedFrom = s.metadata?.saved_from as string | undefined;
        const tag = s.metadata?.tag as string | undefined;
        const key = s.file_path || `__${savedFrom || "manual"}__${s.id}`;
        const stat = statusBySource.get(s.id) || { completed: 0, pending: 0, processing: 0, failed: 0, total: 0 };
        const existing = groupMap.get(key);
        if (existing) {
          existing.total_chunks += 1;
          existing.total += stat.total;
          existing.completed += stat.completed;
          existing.pending += stat.pending;
          existing.processing += stat.processing;
          existing.failed += stat.failed;
          if (new Date(s.created_at) < new Date(existing.earliest_created_at)) {
            existing.earliest_created_at = s.created_at;
          }
        } else {
          groupMap.set(key, {
            source_id: s.id,
            file_path: s.file_path || "",
            file_name: resolveDisplayName(s),
            file_size: s.file_size,
            earliest_created_at: s.created_at,
            total_chunks: 1,
            total: stat.total,
            completed: stat.completed,
            pending: stat.pending,
            processing: stat.processing,
            failed: stat.failed,
            saved_from: savedFrom,
            tag,
          });
        }
      }

      const arr = Array.from(groupMap.values()).sort(
        (a, b) => new Date(b.earliest_created_at).getTime() - new Date(a.earliest_created_at).getTime()
      );
      setGroups(arr);
    } catch (e) {
      console.error("[RecentKnowledgeUploads] fetch error", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleReindex = async (group: UploadGroup) => {
    const key = group.file_path || group.source_id;
    setReindexing((prev) => new Set(prev).add(key));
    try {
      // Get all source ids in this group
      let sourceIds: string[] = [];
      if (group.file_path) {
        const { data, error } = await supabase
          .from("email_knowledge_sources")
          .select("id")
          .eq("file_path", group.file_path);
        if (error) throw error;
        sourceIds = (data || []).map((r: any) => r.id);
      } else {
        sourceIds = [group.source_id];
      }

      if (sourceIds.length === 0) throw new Error("找不到對應的知識來源");

      const { error: updErr } = await supabase
        .from("email_embeddings")
        .update({ status: "pending", last_error: null, processing_started_at: null })
        .in("source_id", sourceIds)
        .in("status", ["failed", "processing"]);
      if (updErr) throw updErr;

      const result = await kickoffEmailEmbeddingJob("reindex");
      toast.success(`已重新排程索引：${result.message}`);
      await fetchData();
    } catch (e: any) {
      console.error(e);
      toast.error("重新索引失敗：" + (e.message || "未知錯誤"));
    } finally {
      setReindexing((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  useImperativeHandle(ref, () => ({
    refresh: () => {
      void fetchData();
    },
    scrollIntoView: () => {
      containerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
  }), [fetchData]);

  useEffect(() => {
    void fetchData();
    const id = setInterval(() => void fetchData(), POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchData]);

  return (
    <div ref={containerRef} className="rma-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          <div>
            <p className="font-medium text-foreground">最近上傳檔案的索引狀態</p>
            <p className="text-xs text-muted-foreground">顯示過去 {WINDOW_HOURS} 小時內上傳，每 5 秒自動更新</p>
          </div>
        </div>
        <button
          onClick={() => void fetchData()}
          className="p-2 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground"
          title="立即重新整理"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {isLoading && groups.length === 0 ? (
        <div className="text-center py-6">
          <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-6 text-sm text-muted-foreground">
          過去 {WINDOW_HOURS} 小時內沒有上傳記錄
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => {
            const key = g.file_path || g.source_id;
            const pct = g.total > 0 ? Math.round((g.completed / g.total) * 100) : 0;
            const allDone = g.total > 0 && g.completed === g.total;
            const hasIssue = g.failed > 0;
            const inProgress = g.pending > 0 || g.processing > 0;
            const isReindexing = reindexing.has(key);

            return (
              <div key={key} className="border border-border rounded-lg p-3 bg-muted/20">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate" title={g.file_name}>
                        {g.file_name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatRelativeTime(g.earliest_created_at)}
                        {g.file_size ? ` · ${formatSize(g.file_size)}` : ""}
                        {` · 切成 ${g.total_chunks} 段`}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-1">
                    {allDone && <CheckCircle2 className="w-5 h-5 text-primary" />}
                    {inProgress && !hasIssue && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
                    {hasIssue && <AlertCircle className="w-5 h-5 text-destructive" />}
                  </div>
                </div>

                <div className="mt-2">
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${hasIssue ? "bg-destructive" : "bg-primary"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mt-1.5">
                    <span className="text-muted-foreground">{pct}% ({g.completed}/{g.total})</span>
                    {g.completed > 0 && <span className="text-primary">✓ 完成 {g.completed}</span>}
                    {g.pending > 0 && <span className="text-muted-foreground">⏳ 待處理 {g.pending}</span>}
                    {g.processing > 0 && <span className="text-primary">⚙️ 處理中 {g.processing}</span>}
                    {g.failed > 0 && <span className="text-destructive">✗ 失敗 {g.failed}</span>}
                    {(hasIssue || (inProgress && !isReindexing)) && (
                      <button
                        onClick={() => void handleReindex(g)}
                        disabled={isReindexing}
                        className="ml-auto inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50"
                      >
                        {isReindexing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCw className="w-3 h-3" />}
                        重新索引
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

RecentKnowledgeUploads.displayName = "RecentKnowledgeUploads";

export default RecentKnowledgeUploads;
