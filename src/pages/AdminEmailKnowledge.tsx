import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft, Home, LogOut, Plus, Trash2, Edit2, Loader2, Mail, FileText, MessageSquare, Save, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import EmailEmbeddingManager from "@/components/admin/EmailEmbeddingManager";
import EmailKnowledgeChat from "@/components/admin/EmailKnowledgeChat";
import KnowledgeFileUpload from "@/components/admin/KnowledgeFileUpload";

type SourceType = "faq" | "template" | "email";

interface KnowledgeSource {
  id: string;
  source_type: SourceType;
  title: string;
  content: string;
  metadata: { language?: string; tag?: string; sender?: string };
  created_at: string;
  updated_at: string;
}

const SOURCE_LABELS: Record<SourceType, { label: string; icon: any; color: string }> = {
  faq: { label: "FAQ", icon: FileText, color: "text-blue-600" },
  template: { label: "客服範本", icon: MessageSquare, color: "text-purple-600" },
  email: { label: "客戶 Email", icon: Mail, color: "text-orange-600" },
};

const AdminEmailKnowledge = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<SourceType | "all">("all");

  // form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<SourceType>("faq");
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formLanguage, setFormLanguage] = useState("zh-TW");
  const [formTag, setFormTag] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchSources = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("email_knowledge_sources")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setSources((data as any) || []);
    } catch (e: any) {
      console.error(e);
      toast.error("載入知識來源失敗");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSources();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setShowForm(false);
    setFormType("faq");
    setFormTitle("");
    setFormContent("");
    setFormLanguage("zh-TW");
    setFormTag("");
  };

  const handleEdit = (s: KnowledgeSource) => {
    setEditingId(s.id);
    setShowForm(true);
    setFormType(s.source_type);
    setFormTitle(s.title);
    setFormContent(s.content);
    setFormLanguage(s.metadata?.language || "zh-TW");
    setFormTag(s.metadata?.tag || "");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formContent.trim()) {
      toast.error("標題與內容為必填");
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        source_type: formType,
        title: formTitle.trim(),
        content: formContent.trim(),
        metadata: { language: formLanguage, tag: formTag.trim() || undefined },
        created_by: user?.id,
      };
      if (editingId) {
        const { error } = await supabase
          .from("email_knowledge_sources")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
        toast.success("已更新知識來源");
      } else {
        const { error } = await supabase.from("email_knowledge_sources").insert(payload);
        if (error) throw error;
        toast.success("已新增知識來源");
      }
      resetForm();
      fetchSources();
    } catch (e: any) {
      console.error(e);
      toast.error("儲存失敗：" + (e.message || "請稍後再試"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("確定要刪除此知識來源？嵌入向量也會一併刪除。")) return;
    setDeletingId(id);
    try {
      const { error } = await supabase.from("email_knowledge_sources").delete().eq("id", id);
      if (error) throw error;
      toast.success("已刪除");
      fetchSources();
    } catch (e: any) {
      console.error(e);
      toast.error("刪除失敗");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/admin");
  };

  const filtered = filter === "all" ? sources : sources.filter((s) => s.source_type === filter);

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card shadow-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link to="/admin/dashboard" className="text-muted-foreground hover:text-foreground">
                <ChevronLeft className="w-5 h-5" />
              </Link>
              <h1 className="text-xl font-bold text-foreground">📧 客戶 Email 知識庫</h1>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">{user?.email}</span>
              <Link to="/" className="rma-btn-secondary text-sm">
                <Home className="w-4 h-4" /> 首頁
              </Link>
              <button onClick={handleSignOut} className="rma-btn-secondary text-sm">
                <LogOut className="w-4 h-4" /> 登出
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Gmail integration placeholder */}
        <div className="rma-card p-4 flex items-center justify-between bg-muted/30">
          <div className="flex items-center gap-3">
            <Mail className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="font-medium text-foreground">Gmail 自動同步</p>
              <p className="text-sm text-muted-foreground">即將推出 — 第二階段將支援 Gmail OAuth 自動抓取信件</p>
            </div>
          </div>
          <button disabled className="rma-btn-secondary opacity-50 cursor-not-allowed">
            連接 Gmail（即將推出）
          </button>
        </div>

        {/* File upload to knowledge base */}
        <KnowledgeFileUpload onUploaded={fetchSources} />

        {/* Embedding & Chat */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <EmailEmbeddingManager />
          <EmailKnowledgeChat />
        </div>

        {/* Add / Edit Form */}
        <div className="rma-card">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">知識來源管理</h2>
            {!showForm && (
              <button onClick={() => setShowForm(true)} className="rma-btn-primary text-sm">
                <Plus className="w-4 h-4" /> 新增知識
              </button>
            )}
          </div>

          {showForm && (
            <form onSubmit={handleSave} className="p-4 space-y-3 bg-muted/20 border-b border-border">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">類型</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as SourceType)}
                    className="rma-input w-full"
                    disabled={isSaving}
                  >
                    <option value="faq">FAQ</option>
                    <option value="template">客服回覆範本</option>
                    <option value="email">客戶 Email</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">語言</label>
                  <select
                    value={formLanguage}
                    onChange={(e) => setFormLanguage(e.target.value)}
                    className="rma-input w-full"
                    disabled={isSaving}
                  >
                    <option value="zh-TW">繁體中文</option>
                    <option value="zh-CN">簡體中文</option>
                    <option value="en">English</option>
                    <option value="ja">日本語</option>
                    <option value="other">其他</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">標籤（選填）</label>
                  <input
                    type="text"
                    value={formTag}
                    onChange={(e) => setFormTag(e.target.value)}
                    placeholder="例如：保固、運費、退貨"
                    className="rma-input w-full"
                    disabled={isSaving}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">標題</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="簡短描述此知識內容"
                  className="rma-input w-full"
                  disabled={isSaving}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">內容</label>
                <textarea
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  placeholder={
                    formType === "faq"
                      ? "Q: 客戶常見問題\nA: 標準回答..."
                      : formType === "template"
                      ? "客服回覆範本內容..."
                      : "貼上完整 Email 內容（含寄件者、主旨、內文）"
                  }
                  className="rma-input w-full min-h-[200px] font-mono text-sm"
                  disabled={isSaving}
                  required
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={resetForm} className="rma-btn-secondary text-sm" disabled={isSaving}>
                  <X className="w-4 h-4" /> 取消
                </button>
                <button type="submit" className="rma-btn-primary text-sm" disabled={isSaving}>
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {editingId ? "更新" : "新增"}
                </button>
              </div>
            </form>
          )}

          {/* Filter */}
          <div className="px-4 pt-4 flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">篩選：</span>
            {(["all", "faq", "template", "email"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-xs px-3 py-1 rounded-full transition-colors ${
                  filter === f ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80 text-foreground"
                }`}
              >
                {f === "all" ? `全部 (${sources.length})` : SOURCE_LABELS[f].label}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="p-4">
            {isLoading ? (
              <div className="text-center py-8">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">尚無知識來源，點擊「新增知識」開始建立</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((s) => {
                  const meta = SOURCE_LABELS[s.source_type];
                  const Icon = meta.icon;
                  return (
                    <div key={s.id} className="border border-border rounded-lg p-3 hover:bg-muted/30 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Icon className={`w-4 h-4 ${meta.color}`} />
                            <span className={`text-xs font-medium ${meta.color}`}>{meta.label}</span>
                            {s.metadata?.language && (
                              <span className="text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground">
                                {s.metadata.language}
                              </span>
                            )}
                            {s.metadata?.tag && (
                              <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full">
                                #{s.metadata.tag}
                              </span>
                            )}
                          </div>
                          <p className="font-medium text-foreground truncate">{s.title}</p>
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-1 whitespace-pre-wrap">
                            {s.content}
                          </p>
                          <p className="text-xs text-muted-foreground mt-2">
                            更新於 {new Date(s.updated_at).toLocaleString("zh-TW")}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleEdit(s)}
                            className="p-2 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground"
                            title="編輯"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(s.id)}
                            disabled={deletingId === s.id}
                            className="p-2 hover:bg-destructive/10 rounded-md text-muted-foreground hover:text-destructive disabled:opacity-50"
                            title="刪除"
                          >
                            {deletingId === s.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminEmailKnowledge;
