import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { kickoffEmailEmbeddingJob } from "@/lib/email-embedding-job";
import {
  Mail, Search, RefreshCw, Sparkles, Copy, Check, ExternalLink,
  Loader2, AlertCircle, Inbox, Save, BookOpen, CheckCircle2,
  Send, Paperclip, FolderOpen, X, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Tabs, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { zhTW } from "date-fns/locale";
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

function sanitizeForKey(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  const safeBase =
    base.replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") ||
    "file";
  const safeExt = ext.replace(/[^\w.]+/g, "");
  return `${safeBase}${safeExt}`.slice(0, 120);
}


interface EmailListItem {
  id: string;
  threadId: string;
  snippet: string;
  labelIds: string[];
  unread: boolean;
  from: string;
  subject: string;
  date: string;
  internalDate: string;
}

interface EmailDetail extends EmailListItem {
  to: string;
  cc: string;
  textPlain: string;
  textHtml: string;
}

const RMA_REGEX = /R[A-Z0-9]{8,12}/gi;

// ============================================================
// Module-level cache: persists across component mount/unmount
// ============================================================
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分鐘
const emailListCache = new Map<string, { data: EmailListItem[]; ts: number }>();
const emailDetailCache = new Map<string, EmailDetail>();

function parseFromHeader(from: string): { name: string; email: string } {
  const match = from.match(/^(.*?)\s*<(.+?)>\s*$/);
  if (match) return { name: match[1].replace(/^"|"$/g, "").trim(), email: match[2].trim() };
  return { name: from, email: from };
}

function htmlToText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatDate(internalDate: string, fallback: string): string {
  const ts = parseInt(internalDate, 10);
  if (Number.isFinite(ts)) {
    const d = new Date(ts);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay
      ? format(d, "HH:mm", { locale: zhTW })
      : format(d, "MM/dd HH:mm", { locale: zhTW });
  }
  return fallback;
}

const CustomerEmailTab = () => {
  const { user } = useAuth();

  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [messages, setMessages] = useState<EmailListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncTs, setLastSyncTs] = useState<number | null>(null);
  const [syncTick, setSyncTick] = useState(0); // for re-rendering "X 分鐘前"

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<EmailDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [draft, setDraft] = useState("");
  const [draftLoading, setDraftLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // 知識庫儲存相關狀態
  const [kbTag, setKbTag] = useState("");
  const [kbSaving, setKbSaving] = useState(false);
  const [kbExistingId, setKbExistingId] = useState<string | null>(null);
  const [kbJustSaved, setKbJustSaved] = useState(false);

  // 寄出回覆相關狀態
  const [replySubject, setReplySubject] = useState("");
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [sending, setSending] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const buildQuery = useCallback(() => {
    const parts: string[] = ["in:inbox"];
    if (filter === "unread") parts.push("is:unread");
    if (search.trim()) parts.push(search.trim());
    return parts.join(" ");
  }, [filter, search]);

  const cacheKey = buildQuery();

  const loadMessages = useCallback(async (forceRefresh = false) => {
    const key = buildQuery();

    // 嘗試讀取快取
    if (!forceRefresh) {
      const cached = emailListCache.get(key);
      if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
        setMessages(cached.data);
        setLastSyncTs(cached.ts);
        setError(null);
        return;
      }
    }

    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("gmail-list-messages", {
        body: { q: key, maxResults: 30 },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const list: EmailListItem[] = data?.messages ?? [];
      setMessages(list);
      const now = Date.now();
      emailListCache.set(key, { data: list, ts: now });
      setLastSyncTs(now);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "讀取信件失敗";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  // 切換 filter / search 或首次掛載時執行
  useEffect(() => {
    loadMessages(false);
  }, [loadMessages]);

  // 每分鐘更新「最後同步：X 分鐘前」顯示
  useEffect(() => {
    const id = setInterval(() => setSyncTick((v) => v + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // 檢查目前選中的信件是否已存在於知識庫
  const checkExistingKnowledge = useCallback(async (messageId: string) => {
    try {
      const { data, error } = await supabase
        .from("email_knowledge_sources")
        .select("id")
        .eq("source_type", "email")
        .filter("metadata->>gmail_message_id", "eq", messageId)
        .maybeSingle();
      if (error) {
        console.warn("檢查知識庫失敗:", error);
        return;
      }
      setKbExistingId(data?.id ?? null);
    } catch (e) {
      console.warn(e);
    }
  }, []);

  const loadDetail = useCallback(async (messageId: string) => {
    // 重置知識庫狀態
    setKbExistingId(null);
    setKbJustSaved(false);
    setKbTag("");
    setDraft("");
    // 重置寄出區塊狀態
    setAttachments([]);
    setReplySubject("");
    setSending(false);

    // 先看快取
    const cached = emailDetailCache.get(messageId);
    if (cached) {
      setDetail(cached);
      setDetailLoading(false);
      setReplySubject(
        cached.subject ? (cached.subject.startsWith("Re:") ? cached.subject : `Re: ${cached.subject}`) : "Re: ",
      );
      void checkExistingKnowledge(messageId);
      return;
    }

    setDetailLoading(true);
    setDetail(null);
    try {
      const { data, error } = await supabase.functions.invoke("gmail-get-message", {
        body: { messageId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setDetail(data);
      emailDetailCache.set(messageId, data);
      setReplySubject(
        data?.subject ? (data.subject.startsWith("Re:") ? data.subject : `Re: ${data.subject}`) : "Re: ",
      );

      // Auto mark as read if currently unread
      if (data?.unread) {
        await supabase.functions.invoke("gmail-modify-message", {
          body: { messageId, removeLabelIds: ["UNREAD"] },
        });
        // 同步快取
        emailDetailCache.set(messageId, { ...data, unread: false, labelIds: data.labelIds.filter((l: string) => l !== "UNREAD") });
        setMessages((prev) => prev.map((m) =>
          m.id === messageId
            ? { ...m, unread: false, labelIds: m.labelIds.filter((l) => l !== "UNREAD") }
            : m
        ));
        // 同步信件列表快取
        const cachedList = emailListCache.get(cacheKey);
        if (cachedList) {
          emailListCache.set(cacheKey, {
            ts: cachedList.ts,
            data: cachedList.data.map((m) =>
              m.id === messageId
                ? { ...m, unread: false, labelIds: m.labelIds.filter((l) => l !== "UNREAD") }
                : m
            ),
          });
        }
      }

      void checkExistingKnowledge(messageId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "讀取信件內容失敗";
      toast.error(msg);
    } finally {
      setDetailLoading(false);
    }
  }, [cacheKey, checkExistingKnowledge]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    loadDetail(id);
  };

  const detectedRma = useMemo(() => {
    if (!detail) return null;
    const haystack = `${detail.subject}\n${detail.textPlain || htmlToText(detail.textHtml)}`;
    const m = haystack.match(RMA_REGEX);
    return m?.[0] ?? null;
  }, [detail]);

  const handleAiDraft = async () => {
    if (!detail) return;
    setDraftLoading(true);
    setDraft("");
    try {
      const { name, email } = parseFromHeader(detail.from);
      const bodyText = detail.textPlain || htmlToText(detail.textHtml) || detail.snippet;
      const { data, error } = await supabase.functions.invoke("draft-email-reply", {
        body: {
          subject: detail.subject,
          body: bodyText,
          sender: `${name} <${email}>`,
          rmaNumber: detectedRma ?? undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setDraft(data?.draft ?? data?.reply ?? "");
      toast.success("AI 草稿已產生");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "AI 草擬失敗";
      toast.error(msg);
    } finally {
      setDraftLoading(false);
    }
  };

  const handleCopyDraft = async () => {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      toast.success("已複製草稿");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("複製失敗，請手動選取");
    }
  };

  const openInGmail = () => {
    if (!detail) return;
    window.open(`https://mail.google.com/mail/u/0/#inbox/${detail.id}`, "_blank");
  };

  // ===== 寄出回覆相關 handlers =====
  const recipient = useMemo(() => {
    if (!detail) return null;
    return parseFromHeader(detail.from);
  }, [detail]);

  const handleAddAttachments = async (files: FileList | null) => {
    if (!files || files.length === 0 || !detail) return;
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
        const safeName = sanitizeForKey(file.name);
        const path = `email-replies/${detail.id}/${crypto.randomUUID()}-${safeName}`;
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
          source: "upload",
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
    if (att.source !== "library") {
      await supabase.storage.from(ATTACHMENT_BUCKET).remove([att.path]).catch(() => {});
    }
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAddFromLibrary = async (picked: PickedLibFile[]) => {
    if (!detail || picked.length === 0) return;
    if (attachments.length + picked.length > MAX_ATTACHMENTS) {
      toast.error(`最多只能附加 ${MAX_ATTACHMENTS} 個檔案`);
      return;
    }
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

  const handleSendReply = async () => {
    if (!detail || !recipient) return;
    if (!draft.trim() || !replySubject.trim()) {
      toast.error("主旨與內文不可為空");
      return;
    }
    if (!recipient.email || !recipient.email.includes("@")) {
      toast.error("無法解析收件人 Email");
      return;
    }
    const attachmentNote = attachments.length > 0 ? `（含 ${attachments.length} 個附件）` : "";
    if (!confirm(`確定要以 noreply 寄送回覆給 ${recipient.email} 嗎？${attachmentNote}`)) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-customer-email-reply", {
        body: {
          gmailMessageId: detail.id,
          recipientEmail: recipient.email,
          recipientName: recipient.name || undefined,
          rmaNumber: detectedRma || undefined,
          subject: replySubject.trim(),
          body: draft.trim(),
          attachments,
        },
      });
      if (error) throw error;
      const result = data as any;
      if (result?.error) {
        throw new Error(
          typeof result.error === "string" ? result.error : JSON.stringify(result.error),
        );
      }
      toast.success(`已寄出回覆給 ${recipient.email}`);
      setAttachments([]);
    } catch (e: any) {
      toast.error("寄送失敗：" + (e?.message || ""));
    } finally {
      setSending(false);
    }
  };

  // 組合「客戶來信 + 客服回覆」寫入內容
  const buildKnowledgeContent = useCallback((d: EmailDetail, replyText: string): string => {
    const bodyText = d.textPlain || htmlToText(d.textHtml) || d.snippet;
    const lines: string[] = [
      "【客戶來信】",
      `寄件人：${d.from}`,
      `主旨：${d.subject || "(無主旨)"}`,
      `時間：${d.date}`,
    ];
    if (detectedRma) lines.push(`RMA：${detectedRma}`);
    lines.push("", bodyText.trim(), "", "---", "", "【客服回覆】", replyText.trim());
    return lines.join("\n");
  }, [detectedRma]);

  const handleSaveToKnowledge = async () => {
    if (!detail || !draft.trim()) return;
    setKbSaving(true);
    try {
      const { name, email } = parseFromHeader(detail.from);
      const content = buildKnowledgeContent(detail, draft);
      const title = `客戶來信：${detail.subject || "(無主旨)"}`;
      const metadataObj: Record<string, string> = {
        language: "zh-TW",
        sender: `${name} <${email}>`,
        gmail_message_id: detail.id,
        gmail_thread_id: detail.threadId,
        saved_at: new Date().toISOString(),
      };
      if (kbTag.trim()) metadataObj.tag = kbTag.trim();
      if (detectedRma) metadataObj.rma_number = detectedRma;
      // Cast to Json — Supabase generated types treat metadata as Json
      const metadata = metadataObj as unknown as never;

      if (kbExistingId) {
        const { error } = await supabase
          .from("email_knowledge_sources")
          .update({ title, content, metadata })
          .eq("id", kbExistingId);
        if (error) throw error;
        toast.success("已更新知識庫項目");
      } else {
        const { data, error } = await supabase
          .from("email_knowledge_sources")
          .insert([{
            source_type: "email",
            title,
            content,
            metadata,
            created_by: user?.id,
          }])
          .select("id")
          .single();
        if (error) throw error;
        setKbExistingId(data.id);
        toast.success("已存入知識庫");
      }

      setKbJustSaved(true);

      // 觸發背景索引（與既有上傳流程一致）
      try {
        const result = await kickoffEmailEmbeddingJob("customer-email-save");
        toast.success(result.message);
      } catch (e) {
        console.error(e);
        toast.error("已存入，但背景索引喚醒失敗，排程稍後仍會自動續跑");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "儲存失敗";
      toast.error(msg);
    } finally {
      setKbSaving(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  const unreadCount = messages.filter((m) => m.unread).length;

  const lastSyncLabel = useMemo(() => {
    if (!lastSyncTs) return null;
    // syncTick 觸發重算
    void syncTick;
    const diff = Date.now() - lastSyncTs;
    if (diff < 60_000) return "剛剛同步";
    return `最後同步：${formatDistanceToNow(lastSyncTs, { locale: zhTW, addSuffix: false })}前`;
  }, [lastSyncTs, syncTick]);

  return (
    <div className="space-y-4">
      {/* Header / toolbar */}
      <div className="rma-card">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">客戶來信</h2>
            <Badge variant="outline" className="gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              已連線
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            {lastSyncLabel && (
              <span className="text-xs text-muted-foreground">{lastSyncLabel}</span>
            )}
            <Button
              onClick={() => loadMessages(true)}
              disabled={loading}
              variant="outline"
              size="sm"
            >
              <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
              同步
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <TabsList>
              <TabsTrigger value="all">全部</TabsTrigger>
              <TabsTrigger value="unread">
                未讀
                {unreadCount > 0 && (
                  <Badge variant="secondary" className="ml-2 h-5">{unreadCount}</Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <form onSubmit={handleSearch} className="flex-1 min-w-[200px] flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="搜尋信件 (Gmail 語法，如 from:xxx)"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button type="submit" variant="secondary" size="sm">搜尋</Button>
          </form>
          <span className="text-sm text-muted-foreground">
            共 {messages.length} 封
          </span>
        </div>
      </div>

      {error && (
        <div className="rma-card flex items-start gap-3 border-destructive/50 bg-destructive/5">
          <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-destructive">無法讀取信件</p>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Two-pane layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
        {/* Left: list */}
        <div className="rma-card p-0 overflow-hidden">
          <div className="max-h-[70vh] overflow-y-auto divide-y divide-border">
            {loading && messages.length === 0 && (
              <div className="p-8 text-center text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                載入中...
              </div>
            )}
            {!loading && messages.length === 0 && (
              <div className="p-8 text-center text-muted-foreground">
                <Inbox className="w-8 h-8 mx-auto mb-2 opacity-50" />
                沒有信件
              </div>
            )}
            {messages.map((m) => {
              const { name } = parseFromHeader(m.from);
              const hasRma = RMA_REGEX.test(`${m.subject} ${m.snippet}`);
              return (
                <button
                  key={m.id}
                  onClick={() => handleSelect(m.id)}
                  className={cn(
                    "w-full text-left p-3 hover:bg-muted/50 transition-colors block",
                    selectedId === m.id && "bg-muted",
                    m.unread && "bg-primary/5",
                  )}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {m.unread && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                      <span className={cn(
                        "truncate text-sm",
                        m.unread ? "font-semibold" : "font-normal text-muted-foreground",
                      )}>
                        {name}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatDate(m.internalDate, m.date)}
                    </span>
                  </div>
                  <p className={cn(
                    "text-sm truncate mb-1",
                    m.unread ? "font-medium text-foreground" : "text-muted-foreground",
                  )}>
                    {m.subject || "(無主旨)"}
                  </p>
                  <p className="text-xs text-muted-foreground line-clamp-1">{m.snippet}</p>
                  {hasRma && (
                    <Badge variant="outline" className="mt-1 text-xs h-5">RMA</Badge>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: detail */}
        <div className="rma-card min-h-[60vh]">
          {!selectedId && (
            <div className="h-full flex items-center justify-center text-center text-muted-foreground py-20">
              <div>
                <Mail className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>從左側選擇一封信件查看內容</p>
              </div>
            </div>
          )}

          {selectedId && detailLoading && (
            <div className="py-20 text-center text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              載入中...
            </div>
          )}

          {detail && !detailLoading && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">{detail.subject || "(無主旨)"}</h3>
                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <span className="text-muted-foreground">寄件人：</span>
                  <span className="font-medium">{detail.from}</span>
                  <span className="text-muted-foreground">收件人：</span>
                  <span>{detail.to}</span>
                  {detail.cc && (
                    <>
                      <span className="text-muted-foreground">副本：</span>
                      <span>{detail.cc}</span>
                    </>
                  )}
                  <span className="text-muted-foreground">時間：</span>
                  <span>{detail.date}</span>
                  {detectedRma && (
                    <>
                      <span className="text-muted-foreground">RMA：</span>
                      <Badge variant="outline" className="w-fit">{detectedRma}</Badge>
                    </>
                  )}
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <pre className="whitespace-pre-wrap font-sans text-sm text-foreground leading-relaxed max-h-[40vh] overflow-y-auto">
                  {detail.textPlain || htmlToText(detail.textHtml) || detail.snippet}
                </pre>
              </div>

              <div className="flex items-center gap-2 flex-wrap border-t border-border pt-4">
                <Button onClick={handleAiDraft} disabled={draftLoading} size="sm">
                  {draftLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4 mr-2" />
                  )}
                  AI 草擬回覆
                </Button>
                <Button onClick={openInGmail} variant="outline" size="sm">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  在 Gmail 開啟
                </Button>
              </div>

              {(draft || draftLoading) && (
                <div className="border-t border-border pt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>AI 草稿</Label>
                    <Button
                      onClick={handleCopyDraft}
                      variant="ghost"
                      size="sm"
                      disabled={!draft}
                    >
                      {copied ? (
                        <Check className="w-4 h-4 mr-2 text-green-600" />
                      ) : (
                        <Copy className="w-4 h-4 mr-2" />
                      )}
                      {copied ? "已複製" : "複製"}
                    </Button>
                  </div>
                  <Textarea
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      // 編輯草稿後，「剛存」狀態失效（提示使用者可再次儲存以更新）
                      if (kbJustSaved) setKbJustSaved(false);
                    }}
                    placeholder={draftLoading ? "AI 正在撰寫草稿..." : ""}
                    className="min-h-[200px] font-mono text-sm"
                    readOnly={draftLoading}
                  />
                  <p className="text-xs text-muted-foreground">
                    可直接編輯後以 noreply 寄出，或複製貼回 Gmail
                  </p>
                </div>
              )}

              {/* 寄出回覆區塊：草稿存在時顯示 */}
              {draft.trim() && !draftLoading && recipient && (
                <div className="border-t border-border pt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Send className="w-4 h-4 text-primary" />
                    <Label className="text-sm font-medium">以 noreply 寄出回覆</Label>
                  </div>

                  <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 items-center text-sm">
                    <span className="text-muted-foreground">收件人：</span>
                    <span className="font-medium break-all">
                      {recipient.email}
                      {recipient.name && recipient.name !== recipient.email && (
                        <span className="text-muted-foreground ml-2">({recipient.name})</span>
                      )}
                    </span>
                    <Label htmlFor="reply-subject" className="text-muted-foreground">
                      主旨：
                    </Label>
                    <Input
                      id="reply-subject"
                      value={replySubject}
                      onChange={(e) => setReplySubject(e.target.value)}
                      className="h-9"
                      disabled={sending}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <Label className="text-xs text-muted-foreground">
                        附件（{attachments.length}/{MAX_ATTACHMENTS}）
                      </Label>
                      <div className="flex items-center gap-2">
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          className="hidden"
                          onChange={(e) => handleAddAttachments(e.target.files)}
                          accept={ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",")}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploadingFiles || sending || attachments.length >= MAX_ATTACHMENTS}
                        >
                          {uploadingFiles ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Paperclip className="w-4 h-4 mr-2" />
                          )}
                          上傳檔案
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setPickerOpen(true)}
                          disabled={sending || attachments.length >= MAX_ATTACHMENTS}
                        >
                          <FolderOpen className="w-4 h-4 mr-2" />
                          從檔案庫選擇
                        </Button>
                      </div>
                    </div>

                    {attachments.length > 0 && (
                      <ul className="border border-border rounded-md divide-y divide-border">
                        {attachments.map((a, idx) => (
                          <li
                            key={`${a.path}-${idx}`}
                            className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                              <span className="truncate">{a.name}</span>
                              <span className="text-xs text-muted-foreground shrink-0">
                                {formatBytes(a.size)}
                              </span>
                              {a.source === "library" && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] h-5 border-blue-300 text-blue-700 bg-blue-50"
                                >
                                  檔案庫
                                </Badge>
                              )}
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => handleRemoveAttachment(idx)}
                              disabled={sending}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
                    <p className="text-xs text-muted-foreground">
                      寄件人為 noreply 系統信箱，附件下載連結 30 天內有效
                    </p>
                    <Button
                      onClick={handleSendReply}
                      disabled={sending || uploadingFiles || !draft.trim() || !replySubject.trim()}
                      size="sm"
                    >
                      {sending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4 mr-2" />
                      )}
                      {sending ? "寄送中..." : "以 noreply 寄出"}
                    </Button>
                  </div>
                </div>
              )}

              {/* 存入知識庫區塊：草稿存在且非載入中才顯示 */}
              {draft.trim() && !draftLoading && (
                <div className="border-t border-border pt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-primary" />
                    <Label className="text-sm font-medium">存入知識庫</Label>
                    {kbExistingId && (
                      <Badge variant="outline" className="text-xs">
                        已存在於知識庫
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    把這封客戶來信和您編輯後的回覆一起寫入知識庫，AI 之後回覆類似問題時能參考。
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end">
                    <div>
                      <Label htmlFor="kb-tag" className="text-xs text-muted-foreground">
                        標籤（選填）
                      </Label>
                      <Input
                        id="kb-tag"
                        value={kbTag}
                        onChange={(e) => setKbTag(e.target.value)}
                        placeholder="例如：保固、退貨、運費"
                        className="h-9"
                        disabled={kbSaving}
                      />
                    </div>
                    <Button
                      onClick={handleSaveToKnowledge}
                      disabled={kbSaving}
                      size="sm"
                      className="h-9"
                    >
                      {kbSaving ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : kbJustSaved ? (
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                      ) : (
                        <Save className="w-4 h-4 mr-2" />
                      )}
                      {kbSaving
                        ? "儲存中..."
                        : kbJustSaved
                        ? "已儲存"
                        : kbExistingId
                        ? "更新已儲存內容"
                        : "存入知識庫"}
                    </Button>
                  </div>

                  {kbJustSaved && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                      <span>已寫入並排程背景索引</span>
                      <Link
                        to="/admin/email-knowledge"
                        className="text-primary hover:underline ml-1"
                      >
                        在知識庫檢視 →
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
      <SharedLibraryPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onConfirm={handleAddFromLibrary}
        maxSelect={MAX_ATTACHMENTS - attachments.length}
      />
    </>
  );
};

export default CustomerEmailTab;
