import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { kickoffEmailEmbeddingJob } from "@/lib/email-embedding-job";
import {
  Search, RefreshCw, Sparkles, Send, Save, Copy, Check,
  Loader2, MailOpen, Inbox, AlertCircle, Paperclip, X, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const ATTACHMENT_BUCKET = "rma-attachments";
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024; // 25 MB
const ALLOWED_EXTENSIONS = [
  "jpg", "jpeg", "png", "heic", "webp",
  "pdf", "doc", "docx", "xls", "xlsx", "zip",
];

interface UploadedAttachment {
  name: string;
  path: string;
  size: number;
  contentType?: string;
}

interface ThreadAttachment {
  name: string;
  path?: string;
  size?: number;
  contentType?: string | null;
  uploadedAt?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getExtension(name: string): string {
  const idx = name.lastIndexOf(".");
  if (idx < 0) return "";
  return name.slice(idx + 1).toLowerCase();
}


interface RmaRow {
  id: string;
  rma_number: string;
  customer_name: string;
  customer_email: string | null;
  product_name: string;
  product_model: string | null;
  status: string;
  issue_description: string;
  created_at: string;
  has_unread_customer_reply: boolean;
}

interface ThreadMsg {
  id: string;
  direction: "outbound" | "inbound";
  subject: string | null;
  body: string;
  created_at: string;
  reply_token_used_at: string | null;
  attachments: ThreadAttachment[];
}

const statusLabel: Record<string, string> = {
  registered: "已登記",
  shipped: "已寄出",
  received: "已收件",
  diagnosing: "檢測中",
  awaiting_parts: "待零件",
  repairing: "維修中",
  returned: "已寄回",
  completed: "已完成",
  cancelled: "已取消",
};

const RmaReplyTab = () => {
  const [rmas, setRmas] = useState<RmaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [thread, setThread] = useState<ThreadMsg[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);

  const [subject, setSubject] = useState("");
  const [draft, setDraft] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [ragInfo, setRagInfo] = useState<{ model?: string; ragCount?: number } | null>(null);

  const selected = rmas.find((r) => r.id === selectedId) || null;

  const loadRmas = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("rma_requests")
      .select("id, rma_number, customer_name, customer_email, product_name, product_model, status, issue_description, created_at, has_unread_customer_reply")
      .order("has_unread_customer_reply", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      toast.error("讀取 RMA 失敗：" + error.message);
    } else {
      setRmas((data || []) as RmaRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadRmas(); }, [loadRmas]);

  const loadThread = useCallback(async (rmaId: string) => {
    setThreadLoading(true);
    const { data, error } = await supabase
      .from("rma_thread_messages")
      .select("id, direction, subject, body, created_at, reply_token_used_at")
      .eq("rma_request_id", rmaId)
      .order("created_at", { ascending: true });
    if (error) toast.error("讀取對話失敗：" + error.message);
    else setThread((data || []) as ThreadMsg[]);
    setThreadLoading(false);
  }, []);

  // when selecting, load thread + reset draft + clear unread
  useEffect(() => {
    if (!selected) return;
    loadThread(selected.id);
    setSubject(`Re: [${selected.rma_number}] 您的維修申請進度回覆`);
    setDraft("");
    setRagInfo(null);

    if (selected.has_unread_customer_reply) {
      supabase
        .from("rma_requests")
        .update({ has_unread_customer_reply: false })
        .eq("id", selected.id)
        .then(({ error }) => {
          if (!error) {
            setRmas((prev) => prev.map((r) => r.id === selected.id ? { ...r, has_unread_customer_reply: false } : r));
          }
        });
    }
  }, [selectedId]);

  const filteredRmas = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rmas.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.rma_number.toLowerCase().includes(q) ||
        r.customer_name.toLowerCase().includes(q) ||
        (r.customer_email || "").toLowerCase().includes(q) ||
        r.product_name.toLowerCase().includes(q) ||
        (r.product_model || "").toLowerCase().includes(q)
      );
    });
  }, [rmas, search, statusFilter]);

  const handleAiDraft = async () => {
    if (!selected) return;
    setDrafting(true);
    try {
      // Get latest customer message: latest inbound, else original issue
      const latestInbound = [...thread].reverse().find((m) => m.direction === "inbound");
      const customerBody = latestInbound?.body || selected.issue_description;

      const { data, error } = await supabase.functions.invoke("draft-email-reply", {
        body: {
          subject: `[${selected.rma_number}] ${selected.product_name}`,
          body: customerBody,
          sender: selected.customer_name,
          rmaNumber: selected.rma_number,
        },
      });
      if (error) throw error;
      setDraft((data as any)?.draft || "");
      setRagInfo({ model: (data as any)?.model, ragCount: (data as any)?.ragCount });
      toast.success("AI 草稿完成");
    } catch (e: any) {
      toast.error("AI 草擬失敗：" + (e?.message || ""));
    } finally {
      setDrafting(false);
    }
  };

  const handleSend = async () => {
    if (!selected || !draft.trim() || !subject.trim()) return;
    if (!selected.customer_email) {
      toast.error("此 RMA 沒有客戶 Email，無法寄送");
      return;
    }
    if (!confirm(`確定要寄送回覆給 ${selected.customer_email} 嗎？`)) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-rma-reply", {
        body: {
          rmaRequestId: selected.id,
          subject: subject.trim(),
          body: draft.trim(),
        },
      });
      if (error) throw error;
      const result = data as any;
      if (result?.error) throw new Error(result.error);
      toast.success("已寄出回覆");
      setDraft("");
      await loadThread(selected.id);
    } catch (e: any) {
      toast.error("寄送失敗：" + (e?.message || ""));
    } finally {
      setSending(false);
    }
  };

  const handleSaveToKnowledge = async () => {
    if (!selected || !draft.trim()) {
      toast.error("草稿為空");
      return;
    }
    setSaving(true);
    try {
      const latestInbound = [...thread].reverse().find((m) => m.direction === "inbound");
      const customerBody = latestInbound?.body || selected.issue_description;

      const content = `【客戶問題】
RMA：${selected.rma_number}
客戶：${selected.customer_name}
產品：${selected.product_name} ${selected.product_model || ""}

${customerBody}

---

【客服回覆（已人工確認）】
${draft.trim()}`;

      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase.from("email_knowledge_sources").insert({
        source_type: "rma_reply",
        title: `RMA 往來｜${selected.rma_number}｜${selected.customer_name}`,
        content,
        created_by: user?.id,
        metadata: {
          tag: "RMA 往來",
          rma_number: selected.rma_number,
          rma_request_id: selected.id,
          saved_from: "rma_reply_tab",
          saved_at: new Date().toISOString(),
        },
      });
      if (error) throw error;

      toast.success("已存入知識庫，正在喚醒背景索引…");
      kickoffEmailEmbeddingJob("rma-reply-save").catch(() => { /* non-fatal */ });
    } catch (e: any) {
      toast.error("存入知識庫失敗：" + (e?.message || ""));
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = () => {
    if (!draft) return;
    navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 min-h-[600px]">
      {/* Left: list */}
      <div className="rma-card p-0 overflow-hidden flex flex-col">
        <div className="p-3 border-b space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜尋 RMA / 客戶 / 產品"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs border rounded px-2 py-1 bg-background flex-1"
            >
              <option value="all">全部狀態</option>
              {Object.entries(statusLabel).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <Button size="sm" variant="ghost" onClick={loadRmas} disabled={loading}>
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto max-h-[680px]">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
          ) : filteredRmas.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">沒有符合的 RMA</div>
          ) : (
            <ul className="divide-y">
              {filteredRmas.map((r) => (
                <li
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className={cn(
                    "p-3 cursor-pointer hover:bg-muted/50 transition-colors",
                    selectedId === r.id && "bg-primary/5 border-l-2 border-l-primary",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-sm truncate">{r.rma_number}</span>
                        {r.has_unread_customer_reply && (
                          <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" title="有未讀客戶回覆" />
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{r.customer_name}</div>
                      <div className="text-xs text-muted-foreground truncate">{r.product_name} {r.product_model}</div>
                    </div>
                    <Badge variant="outline" className="text-[10px] flex-shrink-0">
                      {statusLabel[r.status] || r.status}
                    </Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {format(new Date(r.created_at), "yyyy-MM-dd HH:mm")}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Right: detail */}
      <div className="rma-card">
        {!selected ? (
          <div className="text-center py-20 text-muted-foreground">
            <Inbox className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>請從左側選擇一筆 RMA 開始回覆</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary */}
            <div className="flex items-start justify-between gap-3 pb-3 border-b">
              <div>
                <h3 className="text-lg font-semibold">{selected.rma_number}</h3>
                <p className="text-sm text-muted-foreground">
                  {selected.customer_name} · {selected.customer_email || "無 Email"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {selected.product_name} {selected.product_model}
                </p>
              </div>
              <Badge variant="outline">{statusLabel[selected.status] || selected.status}</Badge>
            </div>

            {/* Conversation */}
            <div>
              <h4 className="text-sm font-semibold flex items-center gap-1.5 mb-2">
                <MailOpen className="w-4 h-4" /> 問題與回覆記錄
              </h4>
              <div className="space-y-2 max-h-[260px] overflow-y-auto pr-2">
                {/* original issue */}
                <div className="bg-muted/30 border-l-2 border-l-muted-foreground/30 p-3 rounded-r text-sm">
                  <div className="text-xs text-muted-foreground mb-1">
                    客戶原始問題 · {format(new Date(selected.created_at), "yyyy-MM-dd HH:mm")}
                  </div>
                  <div className="whitespace-pre-wrap">{selected.issue_description}</div>
                </div>
                {threadLoading ? (
                  <div className="text-center py-4"><Loader2 className="w-4 h-4 animate-spin mx-auto text-muted-foreground" /></div>
                ) : (
                  thread.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        "p-3 rounded text-sm border-l-2",
                        m.direction === "outbound"
                          ? "bg-primary/5 border-l-primary ml-6"
                          : "bg-emerald-50 dark:bg-emerald-950/20 border-l-emerald-500 mr-6",
                      )}
                    >
                      <div className="text-xs text-muted-foreground mb-1 flex items-center justify-between">
                        <span>{m.direction === "outbound" ? "客服回覆" : "客戶回覆"} · {format(new Date(m.created_at), "yyyy-MM-dd HH:mm")}</span>
                        {m.direction === "outbound" && m.reply_token_used_at && (
                          <Badge variant="secondary" className="text-[10px]">客戶已回覆</Badge>
                        )}
                      </div>
                      {m.subject && <div className="font-medium text-xs mb-1">{m.subject}</div>}
                      <div className="whitespace-pre-wrap">{m.body}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Compose */}
            <div className="space-y-3 pt-3 border-t">
              <div>
                <Label htmlFor="subject" className="text-xs">主旨</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-xs">回覆內容</Label>
                <div className="flex items-center gap-2">
                  {ragInfo && (
                    <span className="text-[10px] text-muted-foreground">
                      模型：{ragInfo.model} · 引用 {ragInfo.ragCount ?? 0} 筆知識庫
                    </span>
                  )}
                  <Button size="sm" variant="outline" onClick={handleAiDraft} disabled={drafting}>
                    {drafting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    AI 草擬
                  </Button>
                </div>
              </div>

              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="點擊「AI 草擬」自動生成回覆，或直接在此輸入…"
                rows={12}
                className="font-mono text-sm"
              />

              {!selected.customer_email && (
                <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/20 p-2 rounded">
                  <AlertCircle className="w-4 h-4" />
                  此 RMA 沒有客戶 Email，無法寄送
                </div>
              )}

              <div className="flex flex-wrap gap-2 justify-end">
                <Button size="sm" variant="ghost" onClick={handleCopy} disabled={!draft}>
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  複製
                </Button>
                <Button size="sm" variant="outline" onClick={handleSaveToKnowledge} disabled={saving || !draft}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  存入知識庫
                </Button>
                <Button size="sm" onClick={handleSend} disabled={sending || !draft || !subject || !selected.customer_email}>
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  寄出回覆
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RmaReplyTab;
