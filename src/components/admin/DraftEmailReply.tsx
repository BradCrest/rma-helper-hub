import { useState } from "react";
import { PenLine, Loader2, Copy, Check, Sparkles, Save, BookmarkCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { kickoffEmailEmbeddingJob } from "@/lib/email-embedding-job";

const DraftEmailReply = () => {
  const { user } = useAuth();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sender, setSender] = useState("");
  const [rmaNumber, setRmaNumber] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [draft, setDraft] = useState("");
  const [usedModel, setUsedModel] = useState("");
  const [ragCount, setRagCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [isSavingKnowledge, setIsSavingKnowledge] = useState(false);
  const [savedKnowledge, setSavedKnowledge] = useState(false);

  const handleGenerate = async () => {
    if (!body.trim()) {
      toast.error("請填寫客戶來信內文");
      return;
    }
    setIsGenerating(true);
    setDraft("");
    setSavedKnowledge(false);
    try {
      const { data, error } = await supabase.functions.invoke("draft-email-reply", {
        body: {
          subject: subject.trim(),
          body: body.trim(),
          sender: sender.trim() || undefined,
          rmaNumber: rmaNumber.trim() || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setDraft(data.draft || "");
      setUsedModel(data.model || "");
      setRagCount(data.ragCount || 0);
      toast.success("草稿已產生");
    } catch (e: any) {
      console.error(e);
      toast.error("產生失敗：" + (e.message || "請稍後再試"));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      toast.success("已複製到剪貼簿");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("複製失敗");
    }
  };

  const handleSaveAsKnowledge = async () => {
    if (!body.trim() || !draft.trim()) {
      toast.error("需要客戶來信與草稿內容才能儲存");
      return;
    }
    setIsSavingKnowledge(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const titleSuffix = subject.trim() || sender.trim() || today;
      const title = `客戶Email - ${titleSuffix}`.slice(0, 200);

      const senderLine = sender.trim() ? `寄件人：${sender.trim()}\n` : "";
      const subjectLine = subject.trim() ? `主旨：${subject.trim()}\n` : "";
      const rmaLine = rmaNumber.trim() ? `RMA：${rmaNumber.trim()}\n` : "";
      const header = `${senderLine}${subjectLine}${rmaLine}`;

      const content = `【客戶來信】\n${header}\n${body.trim()}\n\n---\n\n【客服回覆（已人工修正）】\n${draft.trim()}`;

      const { error } = await supabase.from("email_knowledge_sources").insert({
        source_type: "email",
        title,
        content,
        metadata: {
          language: "zh-TW",
          tag: "客服回覆",
          sender: sender.trim() || undefined,
          subject: subject.trim() || undefined,
          rma_number: rmaNumber.trim() || undefined,
          model_used: usedModel || undefined,
          saved_from: "draft_email_reply",
        },
        created_by: user?.id,
      });

      if (error) throw error;

      setSavedKnowledge(true);
      toast.success("已加入知識庫，背景索引中…");

      try {
        await kickoffEmailEmbeddingJob("manual");
      } catch (err) {
        console.warn("kickoff embedding failed (background cron will catch up)", err);
      }
    } catch (e: any) {
      console.error(e);
      toast.error("儲存失敗：" + (e.message || "請稍後再試"));
    } finally {
      setIsSavingKnowledge(false);
    }
  };

  return (
    <div className="rma-card">
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <PenLine className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">✍️ 草擬回覆信件</h2>
        </div>
        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
          <Sparkles className="w-3 h-3" />
          貼上客戶來信，AI 會結合知識庫歷史回覆產生草稿（模型於「AI 模型設定」中切換）
        </p>
      </div>

      <div className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">寄件人 Email（選填）</label>
            <input
              type="email"
              value={sender}
              onChange={(e) => setSender(e.target.value)}
              placeholder="customer@example.com"
              className="rma-input w-full"
              disabled={isGenerating}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">RMA 編號（選填）</label>
            <input
              type="text"
              value={rmaNumber}
              onChange={(e) => setRmaNumber(e.target.value)}
              placeholder="RC7E9001234"
              className="rma-input w-full"
              disabled={isGenerating}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">主旨（選填）</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="客戶來信主旨"
            className="rma-input w-full"
            disabled={isGenerating}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">客戶來信內文 *</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="貼上客戶 Email 的完整內文..."
            className="rma-input w-full min-h-[160px] font-mono text-sm"
            disabled={isGenerating}
            required
          />
        </div>

        <div className="flex items-center justify-end">
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !body.trim()}
            className="rma-btn-primary text-sm disabled:opacity-50"
          >
            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {isGenerating ? "產生中..." : "產生草稿"}
          </button>
        </div>

        {draft && (
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border">
              <div className="text-xs text-muted-foreground">
                模型：<span className="font-medium text-foreground">{usedModel}</span>
                {" · "}
                檢索到 <span className="font-medium text-foreground">{ragCount}</span> 筆知識庫參考
              </div>
              <button
                onClick={handleCopy}
                className="text-xs px-2 py-1 rounded-md hover:bg-background transition-colors flex items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? "已複製" : "複製"}
              </button>
            </div>
            <textarea
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (savedKnowledge) setSavedKnowledge(false);
              }}
              className="w-full p-3 text-sm font-mono bg-background border-0 focus:outline-none min-h-[240px] resize-y"
            />
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-3 py-2 bg-muted/30 border-t border-border">
              <p className="text-xs text-muted-foreground">
                💡 修正後再儲存，AI 會學到你的用語
              </p>
              <button
                onClick={handleSaveAsKnowledge}
                disabled={isSavingKnowledge || savedKnowledge || !draft.trim() || !body.trim()}
                className="rma-btn-secondary text-sm disabled:opacity-50 self-end sm:self-auto"
              >
                {isSavingKnowledge ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : savedKnowledge ? (
                  <BookmarkCheck className="w-4 h-4 text-green-600" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {isSavingKnowledge ? "儲存中..." : savedKnowledge ? "✅ 已儲存" : "💾 儲存為知識來源"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DraftEmailReply;
