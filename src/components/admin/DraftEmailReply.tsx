import { useState } from "react";
import { PenLine, Loader2, Copy, Check, Sparkles, Save, BookmarkCheck, Dice5, ArrowRight, RefreshCw, Edit3 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { kickoffEmailEmbeddingJob } from "@/lib/email-embedding-job";

type Mode = "manual" | "learning";
type LearningStage = "idle" | "generating_q" | "editing_q" | "answering" | "answered";

const DraftEmailReply = () => {
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>("manual");

  // ===== Manual mode state =====
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

  // ===== Learning mode state =====
  const [stage, setStage] = useState<LearningStage>("idle");
  const [practiceSubject, setPracticeSubject] = useState("");
  const [practiceBody, setPracticeBody] = useState("");
  const [practiceSender, setPracticeSender] = useState("");
  const [practiceRma, setPracticeRma] = useState("");
  const [practiceDraft, setPracticeDraft] = useState("");
  const [practiceModel, setPracticeModel] = useState("");
  const [practiceRagCount, setPracticeRagCount] = useState(0);
  const [practiceCopied, setPracticeCopied] = useState(false);
  const [isSavingPractice, setIsSavingPractice] = useState(false);
  const [practiceSaved, setPracticeSaved] = useState(false);

  // ===== Manual mode handlers (unchanged behaviour) =====
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

  // ===== Learning mode handlers =====
  const handleGeneratePracticeEmail = async () => {
    setStage("generating_q");
    setPracticeDraft("");
    setPracticeSaved(false);
    try {
      const { data, error } = await supabase.functions.invoke("generate-practice-email");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPracticeSubject(data.subject || "");
      setPracticeBody(data.body || "");
      setPracticeSender(data.sender || "");
      setPracticeRma(data.rmaNumber || "");
      setStage("editing_q");
      toast.success("模擬客戶來信已產生，可編輯後產生回覆");
    } catch (e: any) {
      console.error(e);
      toast.error("產生失敗：" + (e.message || "請稍後再試"));
      setStage("idle");
    }
  };

  const handleConfirmAndAnswer = async () => {
    if (!practiceBody.trim()) {
      toast.error("內文不可為空");
      return;
    }
    setStage("answering");
    setPracticeDraft("");
    setPracticeSaved(false);
    try {
      const { data, error } = await supabase.functions.invoke("draft-email-reply", {
        body: {
          subject: practiceSubject.trim(),
          body: practiceBody.trim(),
          sender: practiceSender.trim() || undefined,
          rmaNumber: practiceRma.trim() || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPracticeDraft(data.draft || "");
      setPracticeModel(data.model || "");
      setPracticeRagCount(data.ragCount || 0);
      setStage("answered");
      toast.success("回覆草稿已產生");
    } catch (e: any) {
      console.error(e);
      toast.error("產生回覆失敗：" + (e.message || "請稍後再試"));
      setStage("editing_q");
    }
  };

  const handleCopyPractice = async () => {
    try {
      await navigator.clipboard.writeText(practiceDraft);
      setPracticeCopied(true);
      toast.success("已複製到剪貼簿");
      setTimeout(() => setPracticeCopied(false), 2000);
    } catch {
      toast.error("複製失敗");
    }
  };

  const handleSavePracticeAsKnowledge = async () => {
    if (!practiceBody.trim() || !practiceDraft.trim()) {
      toast.error("需要來信與回覆內容才能儲存");
      return;
    }
    setIsSavingPractice(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const titleSuffix = practiceSubject.trim().slice(0, 60) || practiceSender.trim() || today;
      const title = `AI 主動學習回覆 - ${titleSuffix}`.slice(0, 200);

      const senderLine = practiceSender.trim() ? `寄件人：${practiceSender.trim()}\n` : "";
      const subjectLine = practiceSubject.trim() ? `主旨：${practiceSubject.trim()}\n` : "";
      const rmaLine = practiceRma.trim() ? `RMA：${practiceRma.trim()}\n` : "";
      const header = `${senderLine}${subjectLine}${rmaLine}`;

      const content = `【客戶來信】\n${header}\n${practiceBody.trim()}\n\n---\n\n【客服回覆（已人工修正）】\n${practiceDraft.trim()}`;

      const { error } = await supabase.from("email_knowledge_sources").insert({
        source_type: "email",
        title,
        content,
        metadata: {
          language: "zh-TW",
          tag: "AI 主動學習回覆",
          sender: practiceSender.trim() || undefined,
          subject: practiceSubject.trim() || undefined,
          rma_number: practiceRma.trim() || undefined,
          model_used: practiceModel || undefined,
          saved_from: "draft_email_reply_learning",
          auto_generated_question: true,
        },
        created_by: user?.id,
      });

      if (error) throw error;

      setPracticeSaved(true);
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
      setIsSavingPractice(false);
    }
  };

  const handleNextPractice = () => {
    setPracticeSubject("");
    setPracticeBody("");
    setPracticeSender("");
    setPracticeRma("");
    setPracticeDraft("");
    setPracticeModel("");
    setPracticeRagCount(0);
    setPracticeSaved(false);
    setStage("idle");
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

        {/* Mode switch */}
        <div className="mt-3 inline-flex rounded-md border border-border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setMode("manual")}
            className={`text-xs px-3 py-1.5 rounded transition-colors ${
              mode === "manual"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            💬 手動模式
          </button>
          <button
            type="button"
            onClick={() => setMode("learning")}
            className={`text-xs px-3 py-1.5 rounded transition-colors ${
              mode === "learning"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            ✨ 主動學習模式
          </button>
        </div>
      </div>

      {mode === "manual" ? (
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
      ) : (
        // ===== Learning mode =====
        <div className="p-4 space-y-3">
          {stage === "idle" && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <p className="text-sm text-muted-foreground text-center max-w-md">
                按下按鈕，AI 會根據知識庫產生一封擬真的客戶來信，讓你練習回覆並把修正後的版本存回知識庫。
              </p>
              <button
                onClick={handleGeneratePracticeEmail}
                className="rma-btn-primary text-sm"
              >
                <Dice5 className="w-4 h-4" />
                🎲 由 AI 產生模擬客戶來信
              </button>
            </div>
          )}

          {stage === "generating_q" && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">AI 正在產生模擬來信…</p>
            </div>
          )}

          {(stage === "editing_q" || stage === "answering" || stage === "answered") && (
            <>
              <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/20">
                <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Edit3 className="w-3 h-3" /> AI 產生的客戶來信（可編輯）
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">寄件人 Email</label>
                    <input
                      type="email"
                      value={practiceSender}
                      onChange={(e) => setPracticeSender(e.target.value)}
                      className="rma-input w-full text-sm"
                      disabled={stage === "answering"}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">RMA 編號（選填）</label>
                    <input
                      type="text"
                      value={practiceRma}
                      onChange={(e) => setPracticeRma(e.target.value)}
                      className="rma-input w-full text-sm"
                      disabled={stage === "answering"}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">主旨</label>
                  <input
                    type="text"
                    value={practiceSubject}
                    onChange={(e) => setPracticeSubject(e.target.value)}
                    className="rma-input w-full text-sm"
                    disabled={stage === "answering"}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">內文</label>
                  <textarea
                    value={practiceBody}
                    onChange={(e) => setPracticeBody(e.target.value)}
                    className="rma-input w-full min-h-[120px] font-mono text-sm"
                    disabled={stage === "answering"}
                  />
                </div>
                <div className="flex flex-wrap gap-2 justify-end">
                  <button
                    onClick={handleGeneratePracticeEmail}
                    disabled={stage === "answering"}
                    className="rma-btn-secondary text-xs disabled:opacity-50"
                  >
                    <RefreshCw className="w-3 h-3" />
                    🔄 重新出題
                  </button>
                  <button
                    onClick={handleConfirmAndAnswer}
                    disabled={stage === "answering" || !practiceBody.trim()}
                    className="rma-btn-primary text-xs disabled:opacity-50"
                  >
                    {stage === "answering" ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <ArrowRight className="w-3 h-3" />
                    )}
                    {stage === "answering" ? "AI 產生中..." : "✅ 確認，產生回覆草稿"}
                  </button>
                </div>
              </div>

              {stage === "answered" && practiceDraft && (
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border">
                    <div className="text-xs text-muted-foreground">
                      模型：<span className="font-medium text-foreground">{practiceModel}</span>
                      {" · "}
                      檢索到 <span className="font-medium text-foreground">{practiceRagCount}</span> 筆知識庫參考
                    </div>
                    <button
                      onClick={handleCopyPractice}
                      className="text-xs px-2 py-1 rounded-md hover:bg-background transition-colors flex items-center gap-1 text-muted-foreground hover:text-foreground"
                    >
                      {practiceCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {practiceCopied ? "已複製" : "複製"}
                    </button>
                  </div>
                  <textarea
                    value={practiceDraft}
                    onChange={(e) => {
                      setPracticeDraft(e.target.value);
                      if (practiceSaved) setPracticeSaved(false);
                    }}
                    className="w-full p-3 text-sm font-mono bg-background border-0 focus:outline-none min-h-[240px] resize-y"
                  />
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-3 py-2 bg-muted/30 border-t border-border">
                    <p className="text-xs text-muted-foreground">
                      💡 修正後再儲存，AI 會學到你的用語
                    </p>
                    <div className="flex flex-wrap gap-2 self-end sm:self-auto">
                      <button
                        onClick={handleSavePracticeAsKnowledge}
                        disabled={isSavingPractice || practiceSaved || !practiceDraft.trim() || !practiceBody.trim()}
                        className="rma-btn-secondary text-sm disabled:opacity-50"
                      >
                        {isSavingPractice ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : practiceSaved ? (
                          <BookmarkCheck className="w-4 h-4 text-green-600" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                        {isSavingPractice ? "儲存中..." : practiceSaved ? "✅ 已儲存" : "💾 存為知識"}
                      </button>
                      {practiceSaved && (
                        <button
                          onClick={handleNextPractice}
                          className="rma-btn-primary text-sm"
                        >
                          <ArrowRight className="w-4 h-4" />
                          ➡️ 下一題
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default DraftEmailReply;
