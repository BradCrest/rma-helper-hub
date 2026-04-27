import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Mail, Search, RefreshCw, Sparkles, Copy, Check, ExternalLink,
  Loader2, AlertCircle, Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Tabs, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { toast } from "sonner";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";
import { cn } from "@/lib/utils";

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
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [messages, setMessages] = useState<EmailListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<EmailDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [draft, setDraft] = useState("");
  const [draftLoading, setDraftLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const buildQuery = useCallback(() => {
    const parts: string[] = ["in:inbox"];
    if (filter === "unread") parts.push("is:unread");
    if (search.trim()) parts.push(search.trim());
    return parts.join(" ");
  }, [filter, search]);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("gmail-list-messages", {
        body: { q: buildQuery(), maxResults: 30 },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setMessages(data?.messages ?? []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "讀取信件失敗";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const loadDetail = useCallback(async (messageId: string) => {
    setDetailLoading(true);
    setDetail(null);
    setDraft("");
    try {
      const { data, error } = await supabase.functions.invoke("gmail-get-message", {
        body: { messageId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setDetail(data);

      // Auto mark as read if currently unread
      if (data?.unread) {
        await supabase.functions.invoke("gmail-modify-message", {
          body: { messageId, removeLabelIds: ["UNREAD"] },
        });
        setMessages((prev) => prev.map((m) =>
          m.id === messageId
            ? { ...m, unread: false, labelIds: m.labelIds.filter((l) => l !== "UNREAD") }
            : m
        ));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "讀取信件內容失敗";
      toast.error(msg);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    loadDetail(id);
  };

  const detectedRma = (() => {
    if (!detail) return null;
    const haystack = `${detail.subject}\n${detail.textPlain || htmlToText(detail.textHtml)}`;
    const m = haystack.match(RMA_REGEX);
    return m?.[0] ?? null;
  })();

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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  const unreadCount = messages.filter((m) => m.unread).length;

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
          <Button onClick={loadMessages} disabled={loading} variant="outline" size="sm">
            <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
            同步
          </Button>
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
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={draftLoading ? "AI 正在撰寫草稿..." : ""}
                    className="min-h-[200px] font-mono text-sm"
                    readOnly={draftLoading}
                  />
                  <p className="text-xs text-muted-foreground">
                    可直接編輯後複製貼回 Gmail 寄出
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Need to import Label component
import { Label } from "@/components/ui/label";

export default CustomerEmailTab;
