import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { kickoffEmailEmbeddingJob } from "@/lib/email-embedding-job";
import {
  Search, RefreshCw, Sparkles, Send, Save, Copy, Check,
  Loader2, MailOpen, Inbox, AlertCircle, Paperclip, X, FileText, Trash2, FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import SharedLibraryPicker, { type PickedLibFile } from "@/components/admin/SharedLibraryPicker";

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
  source?: "upload" | "library";
  libraryFileId?: string;
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

  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

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
      .select("id, direction, subject, body, created_at, reply_token_used_at, attachments")
      .eq("rma_request_id", rmaId)
      .order("created_at", { ascending: true });
    if (error) toast.error("讀取對話失敗：" + error.message);
    else setThread((data || []) as unknown as ThreadMsg[]);
    setThreadLoading(false);
  }, []);

  const deleteThreadAttachment = useCallback(async (
    messageId: string,
    attachment: ThreadAttachment,
    rmaId: string,
  ) => {
    if (!attachment.path) {
      toast.error("此附件沒有有效路徑，無法刪除");
      return;
    }
    if (!confirm(`確定要刪除附件「${attachment.name}」？此動作無法復原。`)) return;
    try {
      // Remove from storage
      const { error: rmErr } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .remove([attachment.path]);
      if (rmErr) throw new Error(`儲存刪除失敗：${rmErr.message}`);

      // Read current attachments, filter, then update
      const { data: msgRow, error: readErr } = await supabase
        .from("rma_thread_messages")
        .select("attachments")
        .eq("id", messageId)
        .maybeSingle();
      if (readErr) throw new Error(`讀取訊息失敗：${readErr.message}`);
      const current = Array.isArray(msgRow?.attachments)
        ? (msgRow!.attachments as unknown as ThreadAttachment[])
        : [];
      const next = current.filter((a) => a.path !== attachment.path);
      const { error: updErr } = await supabase
        .from("rma_thread_messages")
        .update({ attachments: next as unknown as never })
        .eq("id", messageId);
      if (updErr) throw new Error(`更新訊息失敗：${updErr.message}`);

      toast.success("附件已刪除");
      await loadThread(rmaId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "刪除失敗");
    }
  }, [loadThread]);
  useEffect(() => {
    if (!selected) return;
    loadThread(selected.id);
    setSubject(`Re: [${selected.rma_number}] 您的維修申請進度回覆`);
    setDraft("");
    setRagInfo(null);
    setAttachments([]);

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

  const handleAddAttachments = async (files: FileList | null) => {
    if (!files || files.length === 0 || !selected) return;
    const fileArr = Array.from(files);

    if (attachments.length + fileArr.length > MAX_ATTACHMENTS) {
      toast.error(`最多只能附加 ${MAX_ATTACHMENTS} 個檔案`);
      return;
    }

    setUploadingFiles(true);
    const uploaded: UploadedAttachment[] = [];
    try {
      for (const file of fileArr) {
        const ext = getExtension(file.name);
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
          toast.error(`不支援的檔案類型：${file.name}`);
          continue;
        }
        if (file.size > MAX_ATTACHMENT_SIZE) {
          toast.error(`檔案超過 25 MB：${file.name}`);
          continue;
        }
        const sanitizeForKey = (name: string) => {
          const dot = name.lastIndexOf(".");
          const base = dot > 0 ? name.slice(0, dot) : name;
          const ext = dot > 0 ? name.slice(dot) : "";
          const safeBase =
            base
              .replace(/[^\w.-]+/g, "_")
              .replace(/_+/g, "_")
              .replace(/^_|_$/g, "") || "file";
          const safeExt = ext.replace(/[^\w.]+/g, "");
          return `${safeBase}${safeExt}`.slice(0, 120);
        };
        const safeName = sanitizeForKey(file.name);
        const path = `rma-replies/${selected.id}/${crypto.randomUUID()}-${safeName}`;
        const { error: upErr } = await supabase.storage
          .from(ATTACHMENT_BUCKET)
          .upload(path, file, {
            contentType: file.type || undefined,
            upsert: false,
          });
        if (upErr) {
          toast.error(`上傳失敗：${file.name} - ${upErr.message}`);
          continue;
        }
        uploaded.push({
          name: file.name,
          path,
          size: file.size,
          contentType: file.type || undefined,
        });
      }
      if (uploaded.length > 0) {
        setAttachments((prev) => [...prev, ...uploaded]);
        toast.success(`已上傳 ${uploaded.length} 個附件`);
      }
    } finally {
      setUploadingFiles(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveAttachment = async (idx: number) => {
    const att = attachments[idx];
    if (!att) return;
    // Only delete physical file for upload-source attachments. Library references
    // must NOT delete the original file in the shared-library bucket.
    if (att.source !== "library") {
      await supabase.storage.from(ATTACHMENT_BUCKET).remove([att.path]).catch(() => {});
    }
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAddFromLibrary = async (picked: PickedLibFile[]) => {
    if (!selected || picked.length === 0) return;
    if (attachments.length + picked.length > MAX_ATTACHMENTS) {
      toast.error(`最多只能附加 ${MAX_ATTACHMENTS} 個檔案`);
      return;
    }
    // Library files are referenced by path — no copy/upload needed. The backend
    // will issue a 30-day signed URL pointing to the original shared-library file.
    const added: UploadedAttachment[] = picked.map((f) => ({
      name: f.name,
      path: f.path,
      size: f.size,
      contentType: f.content_type || undefined,
      source: "library",
      libraryFileId: f.id,
    }));
    setAttachments((prev) => [...prev, ...added]);
    toast.success(`已從檔案庫加入 ${added.length} 個附件`);

    // Best-effort: bump usage count for each picked file
    for (const f of picked) {
      (async () => {
        const { data: row } = await supabase
          .from("shared_library_files")
          .select("download_count")
          .eq("id", f.id)
          .maybeSingle();
        await supabase
          .from("shared_library_files")
          .update({ download_count: (row?.download_count ?? 0) + 1 })
          .eq("id", f.id);
      })().catch(() => {});
    }
  };

  const handleSend = async () => {
    if (!selected || !draft.trim() || !subject.trim()) return;
    if (!selected.customer_email) {
      toast.error("此 RMA 沒有客戶 Email，無法寄送");
      return;
    }
    const attachmentNote = attachments.length > 0 ? `（含 ${attachments.length} 個附件）` : "";
    if (!confirm(`確定要寄送回覆給 ${selected.customer_email} 嗎？${attachmentNote}`)) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-rma-reply", {
        body: {
          rmaRequestId: selected.id,
          subject: subject.trim(),
          body: draft.trim(),
          attachments,
        },
      });
      if (error) throw error;
      const result = data as any;
      if (result?.error) throw new Error(result.error);
      toast.success("已寄出回覆");
      setDraft("");
      setAttachments([]);
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
        source_type: "email",
        title: `RMA 往來｜${selected.rma_number}｜${selected.customer_name}`,
        content,
        created_by: user?.id,
        metadata: {
          tag: "RMA 往來",
          origin: "rma_reply",
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
      const raw = String(e?.message || "");
      if (raw.includes("source_type_check")) {
        toast.error("知識庫資料表設定尚未更新，請稍後重試或聯絡管理員（DB constraint 過期）");
      } else {
        toast.error("存入知識庫失敗：" + raw.slice(0, 200));
      }
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
                      {Array.isArray(m.attachments) && m.attachments.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-border/40 space-y-1">
                          {m.attachments.map((a, i) => (
                            <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground group">
                              <Paperclip className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">{a.name}</span>
                              {typeof a.size === "number" && (
                                <span className="text-[10px]">({formatBytes(a.size)})</span>
                              )}
                              {a.path && selected && (
                                <button
                                  type="button"
                                  onClick={() => deleteThreadAttachment(m.id, a, selected.id)}
                                  className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive/80"
                                  title="刪除附件"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
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

              {/* Attachments */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5" />
                    附件 {attachments.length > 0 && `(${attachments.length}/${MAX_ATTACHMENTS})`}
                  </Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    accept={ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",")}
                    onChange={(e) => handleAddAttachments(e.target.files)}
                  />
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      onClick={() => setPickerOpen(true)}
                      disabled={uploadingFiles || attachments.length >= MAX_ATTACHMENTS}
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      檔案庫
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingFiles || attachments.length >= MAX_ATTACHMENTS}
                    >
                      {uploadingFiles ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Paperclip className="w-3.5 h-3.5" />
                      )}
                      上傳
                    </Button>
                  </div>
                </div>
                {attachments.length > 0 && (
                  <ul className="space-y-1 border rounded p-2 bg-muted/20">
                    {attachments.map((a, idx) => (
                      <li
                        key={a.path}
                        className="flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <FileText className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
                          <span className="truncate">{a.name}</span>
                          {a.source === "library" && (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 flex-shrink-0"
                              title="來自檔案庫，Email 連結直接指向原檔（30 天內有效）"
                            >
                              檔案庫
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground flex-shrink-0">
                            ({formatBytes(a.size)})
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          onClick={() => handleRemoveAttachment(idx)}
                          disabled={sending}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-[10px] text-muted-foreground">
                  最多 {MAX_ATTACHMENTS} 個檔案，單檔上限 25 MB。Email 內以下載連結呈現，30 天內有效。
                </p>
              </div>

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
                <Button size="sm" onClick={handleSend} disabled={sending || uploadingFiles || !draft || !subject || !selected.customer_email}>
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  寄出回覆
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
      <SharedLibraryPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onConfirm={handleAddFromLibrary}
        maxSelectable={MAX_ATTACHMENTS - attachments.length}
      />
    </div>
  );
};

export default RmaReplyTab;
