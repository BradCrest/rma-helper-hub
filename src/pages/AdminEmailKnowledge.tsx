import { useState, useEffect, useRef, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import RmaReplyTab from "@/components/logistics/RmaReplyTab";
import CustomerEmailTab from "@/components/logistics/CustomerEmailTab";
import { ChevronLeft, Home, LogOut, Plus, Trash2, Edit2, Loader2, Mail, FileText, MessageSquare, Save, X, Download, BookOpen, MessageSquareReply } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";

const PAGE_SIZE = 20;
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import EmailEmbeddingManager from "@/components/admin/EmailEmbeddingManager";
import EmailKnowledgeChat from "@/components/admin/EmailKnowledgeChat";
import KnowledgeFileUpload from "@/components/admin/KnowledgeFileUpload";
import RecentKnowledgeUploads, { RecentKnowledgeUploadsHandle } from "@/components/admin/RecentKnowledgeUploads";
import DraftEmailReply from "@/components/admin/DraftEmailReply";
import { kickoffEmailEmbeddingJob } from "@/lib/email-embedding-job";

type SourceType = "faq" | "template" | "email" | "document";

interface KnowledgeSource {
  id: string;
  source_type: SourceType;
  title: string;
  content: string;
  metadata: { language?: string; tag?: string; sender?: string; chunk_index?: number; total_chunks?: number };
  file_path?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  file_size?: number | null;
  created_at: string;
  updated_at: string;
}

const SOURCE_LABELS: Record<SourceType, { label: string; icon: any; color: string }> = {
  faq: { label: "FAQ", icon: FileText, color: "text-blue-600" },
  template: { label: "客服範本", icon: MessageSquare, color: "text-purple-600" },
  email: { label: "客戶 Email", icon: Mail, color: "text-orange-600" },
  document: { label: "文件", icon: FileText, color: "text-emerald-600" },
};

const AdminEmailKnowledge = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const VALID_TABS = ["knowledge", "rma-reply", "email"];
  const initialTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(
    initialTab && VALID_TABS.includes(initialTab) ? initialTab : "knowledge"
  );

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t && VALID_TABS.includes(t) && t !== activeTab) setActiveTab(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleTabChange = (next: string) => {
    setActiveTab(next);
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<SourceType | "all">("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<SourceType>("faq");
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formLanguage, setFormLanguage] = useState("zh-TW");
  const [formTag, setFormTag] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [embeddingRefreshSignal, setEmbeddingRefreshSignal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [tagFilter, setTagFilter] = useState<string | "all">("all");
  const recentUploadsRef = useRef<RecentKnowledgeUploadsHandle>(null);

  const refreshEmbeddingMonitor = () => {
    setEmbeddingRefreshSignal((value) => value + 1);
    recentUploadsRef.current?.refresh();
  };

  const fetchSources = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.from("email_knowledge_sources").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      setSources((data as any) || []);
    } catch (e: any) {
      console.error(e);
      toast.error("載入知識來源失敗");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void fetchSources(); }, []);

  const requestBackgroundIndexing = async (triggerSource: string, fallbackMessage: string) => {
    try {
      const result = await kickoffEmailEmbeddingJob(triggerSource);
      toast.success(result.message);
    } catch (error) {
      console.error(error);
      toast.error(fallbackMessage);
    } finally {
      refreshEmbeddingMonitor();
    }
  };

  const resetForm = () => {
    setEditingId(null); setShowForm(false); setFormType("faq"); setFormTitle(""); setFormContent(""); setFormLanguage("zh-TW"); setFormTag("");
  };

  const handleEdit = (s: KnowledgeSource) => {
    setEditingId(s.id); setShowForm(true); setFormType(s.source_type); setFormTitle(s.title); setFormContent(s.content); setFormLanguage(s.metadata?.language || "zh-TW"); setFormTag(s.metadata?.tag || "");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formContent.trim()) return toast.error("標題與內容為必填");
    setIsSaving(true);
    try {
      const payload = { source_type: formType, title: formTitle.trim(), content: formContent.trim(), metadata: { language: formLanguage, tag: formTag.trim() || undefined }, created_by: user?.id };
      const nextTriggerSource = editingId ? "update" : "manual";
      const fallbackMessage = editingId ? "知識來源已更新，但背景索引喚醒失敗，排程稍後會自動續跑" : "知識來源已新增，但背景索引喚醒失敗，排程稍後會自動續跑";

      if (editingId) {
        const { error } = await supabase.from("email_knowledge_sources").update(payload).eq("id", editingId);
        if (error) throw error;
        toast.success("已更新知識來源");
      } else {
        const { error } = await supabase.from("email_knowledge_sources").insert(payload);
        if (error) throw error;
        toast.success("已新增知識來源");
      }

      resetForm();
      await fetchSources();
      await requestBackgroundIndexing(nextTriggerSource, fallbackMessage);
    } catch (e: any) {
      console.error(e);
      toast.error("儲存失敗：" + (e.message || "請稍後再試"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const target = sources.find((s) => s.id === id);
    const isFileChunk = !!target?.file_path;
    const siblings = isFileChunk ? sources.filter((s) => s.file_path === target!.file_path) : [];
    const confirmMsg = isFileChunk && siblings.length > 1 ? `此項目來自檔案「${target!.file_name}」，共有 ${siblings.length} 段。確定要刪除整個檔案（含所有段落與儲存原檔）？` : "確定要刪除此知識來源？嵌入向量也會一併刪除。";
    if (!confirm(confirmMsg)) return;
    setDeletingId(id);
    try {
      if (isFileChunk && siblings.length > 1) {
        const ids = siblings.map((s) => s.id);
        const { error } = await supabase.from("email_knowledge_sources").delete().in("id", ids);
        if (error) throw error;
        await supabase.storage.from("knowledge-files").remove([target!.file_path!]);
      } else {
        const { error } = await supabase.from("email_knowledge_sources").delete().eq("id", id);
        if (error) throw error;
        if (target?.file_path) await supabase.storage.from("knowledge-files").remove([target.file_path]);
      }
      toast.success("已刪除");
      void fetchSources();
      refreshEmbeddingMonitor();
    } catch (e: any) {
      console.error(e);
      toast.error("刪除失敗");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSignOut = async () => { await signOut(); navigate("/admin"); };

  const triggerDownload = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const escapeCsv = (val: any) => {
    if (val === null || val === undefined) return "";
    const s = typeof val === "string" ? val : JSON.stringify(val);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const handleExport = (format: "json" | "csv" | "md", scope: "all" | "filtered") => {
    const data = scope === "filtered" ? filtered : sources;
    if (data.length === 0) {
      toast.error("沒有可匯出的資料");
      return;
    }
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
    const baseName = `knowledge-base-${scope === "filtered" ? "filtered-" : ""}${stamp}`;

    try {
      if (format === "json") {
        const payload = {
          exported_at: now.toISOString(),
          scope,
          total: data.length,
          sources: data,
        };
        triggerDownload(JSON.stringify(payload, null, 2), `${baseName}.json`, "application/json");
      } else if (format === "csv") {
        const headers = ["類型", "標題", "標籤", "語言", "內容", "檔案名稱", "建立時間", "更新時間"];
        const rows = data.map((s) => [
          SOURCE_LABELS[s.source_type]?.label ?? s.source_type,
          s.title,
          s.metadata?.tag ?? "",
          s.metadata?.language ?? "",
          s.content,
          s.file_name ?? "",
          new Date(s.created_at).toLocaleString("zh-TW"),
          new Date(s.updated_at).toLocaleString("zh-TW"),
        ]);
        const csv = [headers, ...rows].map((r) => r.map(escapeCsv).join(",")).join("\r\n");
        // UTF-8 BOM for Excel
        triggerDownload("\uFEFF" + csv, `${baseName}.csv`, "text/csv;charset=utf-8");
      } else {
        const lines: string[] = [];
        lines.push(`# 客戶回覆及知識庫匯出`);
        lines.push(`匯出時間：${now.toLocaleString("zh-TW")}`);
        lines.push(`共 ${data.length} 筆${scope === "filtered" ? "（已套用篩選）" : ""}`);
        lines.push("");
        lines.push("---");
        lines.push("");
        for (const s of data) {
          const label = SOURCE_LABELS[s.source_type]?.label ?? s.source_type;
          lines.push(`## [${label}] ${s.title}`);
          if (s.metadata?.tag) lines.push(`- 標籤：#${s.metadata.tag}`);
          if (s.metadata?.language) lines.push(`- 語言：${s.metadata.language}`);
          if (s.file_name) lines.push(`- 檔案：${s.file_name}`);
          lines.push(`- 更新：${new Date(s.updated_at).toLocaleString("zh-TW")}`);
          lines.push("");
          lines.push(s.content);
          lines.push("");
          lines.push("---");
          lines.push("");
        }
        triggerDownload(lines.join("\n"), `${baseName}.md`, "text/markdown;charset=utf-8");
      }
      toast.success(`已匯出 ${data.length} 筆（${format.toUpperCase()}）`);
    } catch (e: any) {
      console.error(e);
      toast.error("匯出失敗：" + (e.message || "請稍後再試"));
    }
  };

  const filtered = useMemo(
    () => sources.filter((s) => {
      if (filter !== "all" && s.source_type !== filter) return false;
      if (tagFilter !== "all" && (s.metadata?.tag || "") !== tagFilter) return false;
      return true;
    }),
    [filter, tagFilter, sources],
  );

  const tagCounts = useMemo(() => {
    const base = filter === "all" ? sources : sources.filter((s) => s.source_type === filter);
    const map = new Map<string, number>();
    for (const s of base) {
      const t = s.metadata?.tag;
      if (t && t.trim()) map.set(t, (map.get(t) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [sources, filter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  const paginated = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage],
  );

  const handleFilterChange = (f: SourceType | "all") => {
    setFilter(f);
    setTagFilter("all");
    setCurrentPage(1);
  };

  const handleTagFilterChange = (t: string | "all") => {
    setTagFilter(t);
    setCurrentPage(1);
  };

  const getPageNumbers = (): (number | "ellipsis")[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | "ellipsis")[] = [1];
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    if (start > 2) pages.push("ellipsis");
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < totalPages - 1) pages.push("ellipsis");
    pages.push(totalPages);
    return pages;
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card shadow-sm border-b border-border"><div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"><div className="flex items-center justify-between h-16"><div className="flex items-center gap-4"><Link to="/admin/dashboard" className="text-muted-foreground hover:text-foreground"><ChevronLeft className="w-5 h-5" /></Link><h1 className="text-xl font-bold text-foreground">📧 客戶回覆及知識庫</h1></div><div className="flex items-center gap-3"><span className="text-sm text-muted-foreground hidden sm:inline">{user?.email}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rma-btn-secondary text-sm" title="匯出知識庫"><Download className="w-4 h-4" /> 匯出</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 bg-popover z-50">
            <DropdownMenuLabel>匯出全部（{sources.length} 筆）</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => handleExport("json", "all")}>JSON（完整 metadata，可重新匯入）</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport("csv", "all")}>CSV（Excel 可直接開啟）</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport("md", "all")}>Markdown（人類可讀）</DropdownMenuItem>
            {filtered.length !== sources.length && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>匯出篩選結果（{filtered.length} 筆）</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => handleExport("json", "filtered")}>JSON</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("csv", "filtered")}>CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("md", "filtered")}>Markdown</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <Link to="/" className="rma-btn-secondary text-sm"><Home className="w-4 h-4" /> 首頁</Link><button onClick={handleSignOut} className="rma-btn-secondary text-sm"><LogOut className="w-4 h-4" /> 登出</button></div></div></div></header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="w-full flex flex-wrap h-auto gap-1 bg-muted/50 p-1 rounded-lg mb-6">
            <TabsTrigger value="knowledge" className="flex items-center gap-2 px-4 py-2 data-[state=active]:bg-card data-[state=active]:shadow-sm">
              <BookOpen className="w-4 h-4" />
              <span className="hidden sm:inline">知識庫建立</span>
            </TabsTrigger>
            <TabsTrigger value="rma-reply" className="flex items-center gap-2 px-4 py-2 data-[state=active]:bg-card data-[state=active]:shadow-sm">
              <MessageSquareReply className="w-4 h-4" />
              <span className="hidden sm:inline">RMA 回覆</span>
            </TabsTrigger>
            <TabsTrigger value="email" className="flex items-center gap-2 px-4 py-2 data-[state=active]:bg-card data-[state=active]:shadow-sm">
              <Mail className="w-4 h-4" />
              <span className="hidden sm:inline">客戶來信</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="knowledge" className="mt-0 space-y-6">
        <div className="rma-card p-4 flex items-center justify-between bg-muted/30"><div className="flex items-center gap-3"><Mail className="w-5 h-5 text-muted-foreground" /><div><p className="font-medium text-foreground">Gmail 自動同步</p><p className="text-sm text-muted-foreground">即將推出 — 第二階段將支援 Gmail OAuth 自動抓取信件</p></div></div><button disabled className="rma-btn-secondary opacity-50 cursor-not-allowed">連接 Gmail（即將推出）</button></div>

        <KnowledgeFileUpload onUploaded={async () => { await fetchSources(); refreshEmbeddingMonitor(); recentUploadsRef.current?.scrollIntoView(); }} />

        <RecentKnowledgeUploads ref={recentUploadsRef} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><EmailEmbeddingManager autoStartSignal={embeddingRefreshSignal} /><EmailKnowledgeChat /></div>

        <DraftEmailReply />

        <div className="rma-card">
          <div className="flex items-center justify-between p-4 border-b border-border"><h2 className="text-lg font-semibold text-foreground">知識來源管理</h2>{!showForm && <button onClick={() => setShowForm(true)} className="rma-btn-primary text-sm"><Plus className="w-4 h-4" /> 新增知識</button>}</div>

          {showForm && <form onSubmit={handleSave} className="p-4 space-y-3 bg-muted/20 border-b border-border"><div className="grid grid-cols-1 md:grid-cols-3 gap-3"><div><label className="block text-sm font-medium text-foreground mb-1">類型</label><select value={formType} onChange={(e) => setFormType(e.target.value as SourceType)} className="rma-input w-full" disabled={isSaving}><option value="faq">FAQ</option><option value="template">客服回覆範本</option><option value="email">客戶 Email</option></select></div><div><label className="block text-sm font-medium text-foreground mb-1">語言</label><select value={formLanguage} onChange={(e) => setFormLanguage(e.target.value)} className="rma-input w-full" disabled={isSaving}><option value="zh-TW">繁體中文</option><option value="zh-CN">簡體中文</option><option value="en">English</option><option value="ja">日本語</option><option value="other">其他</option></select></div><div><label className="block text-sm font-medium text-foreground mb-1">標籤（選填）</label><input type="text" value={formTag} onChange={(e) => setFormTag(e.target.value)} placeholder="例如：保固、運費、退貨" className="rma-input w-full" disabled={isSaving} /></div></div><div><label className="block text-sm font-medium text-foreground mb-1">標題</label><input type="text" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="簡短描述此知識內容" className="rma-input w-full" disabled={isSaving} required /></div><div><label className="block text-sm font-medium text-foreground mb-1">內容</label><textarea value={formContent} onChange={(e) => setFormContent(e.target.value)} placeholder={formType === "faq" ? `Q: 客戶常見問題\nA: 標準回答...` : formType === "template" ? "客服回覆範本內容..." : "貼上完整 Email 內容（含寄件者、主旨、內文）"} className="rma-input w-full min-h-[200px] font-mono text-sm" disabled={isSaving} required /></div><div className="flex items-center justify-end gap-2"><button type="button" onClick={resetForm} className="rma-btn-secondary text-sm" disabled={isSaving}><X className="w-4 h-4" /> 取消</button><button type="submit" className="rma-btn-primary text-sm" disabled={isSaving}>{isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}{editingId ? "更新" : "新增"}</button></div></form>}

          <div className="px-4 pt-4 flex flex-wrap items-center gap-2"><span className="text-sm text-muted-foreground">篩選類型：</span>{(["all", "faq", "template", "email", "document"] as const).map((f) => <button key={f} onClick={() => handleFilterChange(f)} className={`text-xs px-3 py-1 rounded-full transition-colors ${filter === f ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80 text-foreground"}`}>{f === "all" ? `全部 (${sources.length})` : SOURCE_LABELS[f].label}</button>)}</div>

          {tagCounts.length > 0 && (
            <div className="px-4 pt-2 flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">篩選標籤：</span>
              <button
                onClick={() => handleTagFilterChange("all")}
                className={`text-xs px-3 py-1 rounded-full transition-colors ${tagFilter === "all" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80 text-foreground"}`}
              >
                全部標籤
              </button>
              {tagCounts.map(([tag, count]) => (
                <button
                  key={tag}
                  onClick={() => handleTagFilterChange(tag)}
                  className={`text-xs px-3 py-1 rounded-full transition-colors ${tagFilter === tag ? "bg-primary text-primary-foreground" : "bg-primary/10 hover:bg-primary/20 text-primary"}`}
                >
                  #{tag} ({count})
                </button>
              ))}
            </div>
          )}

          <div className="p-4">{isLoading ? <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></div> : filtered.length === 0 ? <div className="text-center py-12 text-muted-foreground"><FileText className="w-10 h-10 mx-auto mb-2 opacity-50" /><p className="text-sm">尚無知識來源，點擊「新增知識」開始建立</p></div> : <div className="space-y-3">{paginated.map((s) => { const meta = SOURCE_LABELS[s.source_type]; const Icon = meta.icon; return <div key={s.id} className="border border-border rounded-lg p-3 hover:bg-muted/30 transition-colors"><div className="flex items-start justify-between gap-3"><div className="flex-1 min-w-0"><div className="flex items-center gap-2 mb-1"><Icon className={`w-4 h-4 ${meta.color}`} /><span className={`text-xs font-medium ${meta.color}`}>{meta.label}</span>{s.metadata?.language && <span className="text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground">{s.metadata.language}</span>}{s.metadata?.tag && <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full">#{s.metadata.tag}</span>}{s.file_name && <span className="text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground truncate max-w-[200px]" title={s.file_name}>📎 {s.file_name}{typeof s.metadata?.total_chunks === "number" && s.metadata.total_chunks > 1 && ` · ${(s.metadata.chunk_index ?? 0) + 1}/${s.metadata.total_chunks}`}</span>}</div><p className="font-medium text-foreground truncate">{s.title}</p><p className="text-sm text-muted-foreground line-clamp-2 mt-1 whitespace-pre-wrap">{s.content}</p><p className="text-xs text-muted-foreground mt-2">更新於 {new Date(s.updated_at).toLocaleString("zh-TW")}</p></div><div className="flex items-center gap-1 shrink-0"><button onClick={() => handleEdit(s)} className="p-2 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground" title="編輯"><Edit2 className="w-4 h-4" /></button><button onClick={() => handleDelete(s.id)} disabled={deletingId === s.id} className="p-2 hover:bg-destructive/10 rounded-md text-muted-foreground hover:text-destructive disabled:opacity-50" title="刪除">{deletingId === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}</button></div></div></div>; })}</div>}</div>

          {!isLoading && filtered.length > PAGE_SIZE && (
            <div className="p-4 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                共 {filtered.length} 筆 · 第 {currentPage} / {totalPages} 頁
              </p>
              <Pagination className="mx-0 w-auto justify-end">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={(e) => {
                        e.preventDefault();
                        if (currentPage > 1) setCurrentPage(currentPage - 1);
                      }}
                      className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                  {getPageNumbers().map((p, idx) =>
                    p === "ellipsis" ? (
                      <PaginationItem key={`e-${idx}`}>
                        <PaginationEllipsis />
                      </PaginationItem>
                    ) : (
                      <PaginationItem key={p}>
                        <PaginationLink
                          isActive={p === currentPage}
                          onClick={(e) => {
                            e.preventDefault();
                            setCurrentPage(p);
                          }}
                          className="cursor-pointer"
                        >
                          {p}
                        </PaginationLink>
                      </PaginationItem>
                    ),
                  )}
                  <PaginationItem>
                    <PaginationNext
                      onClick={(e) => {
                        e.preventDefault();
                        if (currentPage < totalPages) setCurrentPage(currentPage + 1);
                      }}
                      className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </div>
          </TabsContent>

          <TabsContent value="rma-reply" className="mt-0">
            <RmaReplyTab />
          </TabsContent>

          <TabsContent value="email" className="mt-0">
            <CustomerEmailTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default AdminEmailKnowledge;
