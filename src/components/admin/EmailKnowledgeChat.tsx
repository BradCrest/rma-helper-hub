import { useState, useRef, useEffect } from "react";
import {
  Bot,
  Send,
  Loader2,
  Sparkles,
  Pencil,
  Save,
  Check,
  X,
  CheckCircle2,
  Dices,
  RefreshCw,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { kickoffEmailEmbeddingJob } from "@/lib/email-embedding-job";

interface Message {
  role: "user" | "assistant";
  content: string;
  isEditing?: boolean;
  editedContent?: string;
  savedAsKnowledge?: boolean;
  wasEdited?: boolean;
  saving?: boolean;
}

type Mode = "chat" | "learning";
type LearningStage = "idle" | "generating_q" | "editing_q" | "answering" | "answered";

const EXAMPLE_PROMPTS = [
  "客戶詢問退貨流程，我們通常怎麼回覆？",
  "保固期外的維修報價怎麼說明？",
  "海外客戶寄修運費誰負擔？",
];

const EmailKnowledgeChat = () => {
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>("chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Learning mode state
  const [stage, setStage] = useState<LearningStage>("idle");
  const [questionDraft, setQuestionDraft] = useState("");
  const [confirmedQuestion, setConfirmedQuestion] = useState("");
  const [learningAnswer, setLearningAnswer] = useState("");
  const [isEditingAnswer, setIsEditingAnswer] = useState(false);
  const [answerDraft, setAnswerDraft] = useState("");
  const [savedToKnowledge, setSavedToKnowledge] = useState(false);
  const [savingLearning, setSavingLearning] = useState(false);
  const [answerWasEdited, setAnswerWasEdited] = useState(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (prompt?: string) => {
    const text = prompt || input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    let assistantContent = "";

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        toast.error("請先登入");
        setIsLoading(false);
        return;
      }

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/email-knowledge-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionData.session.access_token}`,
          },
          body: JSON.stringify({ messages: newMessages.map(({ role, content }) => ({ role, content })) }),
        }
      );

      if (resp.status === 429) {
        toast.error("請求過於頻繁，請稍後再試");
        setIsLoading(false);
        return;
      }
      if (resp.status === 402) {
        toast.error("AI 額度不足");
        setIsLoading(false);
        return;
      }
      if (!resp.ok || !resp.body) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "請求失敗");
      }

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") {
            streamDone = true;
            break;
          }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantContent += content;
              setMessages((prev) => {
                const next = [...prev];
                const last = next.length - 1;
                if (last >= 0 && next[last].role === "assistant") {
                  next[last] = { ...next[last], content: assistantContent };
                }
                return next;
              });
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "對話失敗");
      setMessages((prev) => {
        if (prev.length > 0 && prev[prev.length - 1].role === "assistant" && !prev[prev.length - 1].content) {
          return prev.slice(0, -1);
        }
        return prev;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const startEdit = (index: number) => {
    setMessages((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], isEditing: true, editedContent: next[index].content };
      return next;
    });
  };

  const cancelEdit = (index: number) => {
    setMessages((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], isEditing: false, editedContent: undefined };
      return next;
    });
  };

  const updateEditContent = (index: number, value: string) => {
    setMessages((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], editedContent: value };
      return next;
    });
  };

  const finishEdit = (index: number) => {
    setMessages((prev) => {
      const next = [...prev];
      const newContent = next[index].editedContent ?? next[index].content;
      const changed = newContent !== next[index].content;
      next[index] = {
        ...next[index],
        content: newContent,
        isEditing: false,
        editedContent: undefined,
        wasEdited: next[index].wasEdited || changed,
        savedAsKnowledge: changed ? false : next[index].savedAsKnowledge,
      };
      return next;
    });
  };

  const handleSaveAsKnowledge = async (index: number) => {
    const assistantMsg = messages[index];
    if (!assistantMsg || assistantMsg.role !== "assistant" || !assistantMsg.content.trim()) return;

    let questionContent = "";
    for (let i = index - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        questionContent = messages[i].content;
        break;
      }
    }
    if (!questionContent) {
      toast.error("找不到對應的使用者問題");
      return;
    }

    setMessages((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], saving: true };
      return next;
    });

    try {
      const trimmedQuestion = questionContent.replace(/\s+/g, " ").trim();
      const titleSuffix = trimmedQuestion.length > 60 ? trimmedQuestion.slice(0, 60) + "…" : trimmedQuestion;
      const title = `AI 對話修正 - ${titleSuffix}`;
      const content = `【使用者問題】\n${questionContent}\n\n---\n\n【AI 回答（已人工修正）】\n${assistantMsg.content}`;

      const { error } = await supabase.from("email_knowledge_sources").insert({
        source_type: "email",
        title,
        content,
        created_by: user?.id ?? null,
        metadata: {
          language: "zh-TW",
          tag: "AI 對話修正",
          question: questionContent,
          saved_from: "email_knowledge_chat",
          was_edited: !!assistantMsg.wasEdited,
        },
      });

      if (error) throw error;

      setMessages((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], saving: false, savedAsKnowledge: true };
        return next;
      });

      toast.success("已加入知識庫，背景索引中…");

      kickoffEmailEmbeddingJob("manual").catch((err) => {
        console.error("kickoff embedding failed", err);
      });
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "存入知識庫失敗");
      setMessages((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], saving: false };
        return next;
      });
    }
  };

  // ===== Learning mode =====

  const resetLearning = () => {
    setStage("idle");
    setQuestionDraft("");
    setConfirmedQuestion("");
    setLearningAnswer("");
    setIsEditingAnswer(false);
    setAnswerDraft("");
    setSavedToKnowledge(false);
    setAnswerWasEdited(false);
  };

  const handleGenerateQuestion = async () => {
    setStage("generating_q");
    setQuestionDraft("");
    try {
      const { data, error } = await supabase.functions.invoke("generate-knowledge-question");
      if (error) {
        const ctx: any = (error as any).context;
        if (ctx?.status === 429) toast.error("請求過於頻繁，請稍後再試");
        else if (ctx?.status === 402) toast.error("AI 額度不足");
        else toast.error(error.message || "產生題目失敗");
        setStage("idle");
        return;
      }
      const q = (data as any)?.question?.trim();
      if (!q) {
        toast.error("AI 未產生有效題目，請重試");
        setStage("idle");
        return;
      }
      setQuestionDraft(q);
      setStage("editing_q");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "產生題目失敗");
      setStage("idle");
    }
  };

  const handleConfirmQuestion = async () => {
    const q = questionDraft.trim();
    if (!q) {
      toast.error("題目不可為空");
      return;
    }
    setConfirmedQuestion(q);
    setLearningAnswer("");
    setSavedToKnowledge(false);
    setAnswerWasEdited(false);
    setStage("answering");

    let assistantContent = "";

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        toast.error("請先登入");
        setStage("editing_q");
        return;
      }

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/email-knowledge-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionData.session.access_token}`,
          },
          body: JSON.stringify({ messages: [{ role: "user", content: q }] }),
        }
      );

      if (resp.status === 429) {
        toast.error("請求過於頻繁，請稍後再試");
        setStage("editing_q");
        return;
      }
      if (resp.status === 402) {
        toast.error("AI 額度不足");
        setStage("editing_q");
        return;
      }
      if (!resp.ok || !resp.body) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "請求失敗");
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") {
            streamDone = true;
            break;
          }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantContent += content;
              setLearningAnswer(assistantContent);
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      setStage("answered");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "產生回答失敗");
      setStage("editing_q");
    }
  };

  const startEditAnswer = () => {
    setAnswerDraft(learningAnswer);
    setIsEditingAnswer(true);
  };

  const cancelEditAnswer = () => {
    setIsEditingAnswer(false);
    setAnswerDraft("");
  };

  const finishEditAnswer = () => {
    const changed = answerDraft !== learningAnswer;
    setLearningAnswer(answerDraft);
    setIsEditingAnswer(false);
    if (changed) {
      setAnswerWasEdited(true);
      setSavedToKnowledge(false);
    }
  };

  const handleSaveLearningToKnowledge = async () => {
    if (!confirmedQuestion.trim() || !learningAnswer.trim()) return;
    setSavingLearning(true);
    try {
      const trimmedQ = confirmedQuestion.replace(/\s+/g, " ").trim();
      const titleSuffix = trimmedQ.length > 60 ? trimmedQ.slice(0, 60) + "…" : trimmedQ;
      const title = `AI 主動學習 - ${titleSuffix}`;
      const content = `【練習題目】\n${confirmedQuestion}\n\n---\n\n【知識庫回答（已人工修正）】\n${learningAnswer}`;

      const { error } = await supabase.from("email_knowledge_sources").insert({
        source_type: "email",
        title,
        content,
        created_by: user?.id ?? null,
        metadata: {
          language: "zh-TW",
          tag: "AI 主動學習",
          question: confirmedQuestion,
          saved_from: "email_knowledge_chat_learning",
          auto_generated_question: true,
          was_edited: answerWasEdited,
        },
      });
      if (error) throw error;

      setSavedToKnowledge(true);
      toast.success("已加入知識庫，背景索引中…");
      kickoffEmailEmbeddingJob("manual").catch((err) => {
        console.error("kickoff embedding failed", err);
      });
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "存入知識庫失敗");
    } finally {
      setSavingLearning(false);
    }
  };

  return (
    <div className="rma-card">
      <div className="flex items-center gap-3 p-4 border-b border-border">
        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
          <Bot className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">知識庫 AI 對話</h3>
          <p className="text-sm text-muted-foreground">
            用自然語言查詢知識庫；可編輯回答並存回知識庫修正錯誤
          </p>
        </div>
      </div>

      {/* Mode switch */}
      <div className="px-4 pt-4">
        <div className="inline-flex rounded-lg bg-muted p-1 gap-1">
          <button
            onClick={() => setMode("chat")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
              mode === "chat"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" /> 直接提問
          </button>
          <button
            onClick={() => setMode("learning")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
              mode === "learning"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" /> 主動學習
          </button>
        </div>
      </div>

      {mode === "chat" && (
        <>
          {messages.length === 0 && (
            <div className="p-4 space-y-3">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> 試試這些問題：
              </p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_PROMPTS.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => handleSubmit(p)}
                    disabled={isLoading}
                    className="text-sm px-3 py-1.5 bg-muted hover:bg-muted/80 rounded-full text-foreground transition-colors disabled:opacity-50"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.length > 0 && (
            <div className="max-h-[32rem] overflow-y-auto p-4 space-y-4">
              {messages.map((msg, i) => {
                const isAssistant = msg.role === "assistant";
                const isLastAssistant = isAssistant && i === messages.length - 1;
                const streamingThis = isLastAssistant && isLoading;
                const showActions = isAssistant && !!msg.content.trim() && !streamingThis;

                return (
                  <div
                    key={i}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] flex flex-col gap-2 ${
                        msg.role === "user" ? "items-end" : "items-start"
                      }`}
                    >
                      <div
                        className={`rounded-lg px-4 py-2 whitespace-pre-wrap text-sm w-full ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground"
                        }`}
                      >
                        {msg.isEditing ? (
                          <Textarea
                            value={msg.editedContent ?? ""}
                            onChange={(e) => updateEditContent(i, e.target.value)}
                            className="min-h-[120px] w-full text-sm bg-background"
                          />
                        ) : (
                          msg.content ||
                          (streamingThis ? <Loader2 className="w-4 h-4 animate-spin" /> : null)
                        )}
                      </div>

                      {showActions && (
                        <div className="flex flex-wrap items-center gap-2">
                          {msg.isEditing ? (
                            <>
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => finishEdit(i)}
                                className="h-7 text-xs"
                              >
                                <Check className="w-3 h-3" /> 完成編輯
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => cancelEdit(i)}
                                className="h-7 text-xs"
                              >
                                <X className="w-3 h-3" /> 取消
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => startEdit(i)}
                                className="h-7 text-xs"
                                disabled={msg.saving}
                              >
                                <Pencil className="w-3 h-3" /> 編輯
                              </Button>
                              {msg.savedAsKnowledge ? (
                                <span className="inline-flex items-center gap-1 text-xs text-primary">
                                  <CheckCircle2 className="w-3 h-3" /> 已存入知識庫
                                </span>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleSaveAsKnowledge(i)}
                                  className="h-7 text-xs"
                                  disabled={msg.saving}
                                >
                                  {msg.saving ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Save className="w-3 h-3" />
                                  )}
                                  存為知識
                                </Button>
                              )}
                              {msg.wasEdited && !msg.savedAsKnowledge && (
                                <span className="text-xs text-muted-foreground">已修正未儲存</span>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}

          <div className="p-4 border-t border-border">
            <div className="flex gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="輸入問題，例如：客戶問保固期間維修費用是否免費，我們怎麼回？"
                className="min-h-[44px] max-h-32 resize-none"
                disabled={isLoading}
              />
              <Button
                onClick={() => handleSubmit()}
                disabled={!input.trim() || isLoading}
                size="icon"
                className="shrink-0"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </>
      )}

      {mode === "learning" && (
        <div className="p-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            由 AI 從知識庫挖出練習題 → 你審題 → AI 回答 → 你修正 → 一鍵存回知識庫，逐步訓練模型。
          </p>

          {/* Step 1: generate question */}
          {stage === "idle" && (
            <Button
              onClick={handleGenerateQuestion}
              variant="default"
              className="gap-2"
            >
              <Dices className="w-4 h-4" /> 由 AI 產生練習題
            </Button>
          )}

          {stage === "generating_q" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> 正在從知識庫挖題目…
            </div>
          )}

          {/* Step 2: review question */}
          {(stage === "editing_q" || stage === "answering" || stage === "answered") && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" /> 練習題目（可編輯）
              </div>
              <Textarea
                value={questionDraft}
                onChange={(e) => setQuestionDraft(e.target.value)}
                className="min-h-[80px] w-full text-sm"
                disabled={stage === "answering"}
              />
              {stage === "editing_q" && (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleConfirmQuestion} size="sm" className="gap-1.5">
                    <Check className="w-3.5 h-3.5" /> 確認此題目，產生回答
                  </Button>
                  <Button
                    onClick={handleGenerateQuestion}
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> 重新出題
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Step 3 + 4: answer */}
          {(stage === "answering" || stage === "answered") && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground flex items-center gap-2">
                <Bot className="w-4 h-4 text-primary" /> 知識庫回答
              </div>
              <div className="rounded-lg bg-muted px-4 py-3 text-sm whitespace-pre-wrap min-h-[80px]">
                {isEditingAnswer ? (
                  <Textarea
                    value={answerDraft}
                    onChange={(e) => setAnswerDraft(e.target.value)}
                    className="min-h-[160px] w-full text-sm bg-background"
                  />
                ) : learningAnswer ? (
                  learningAnswer
                ) : (
                  <span className="inline-flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" /> AI 思考中…
                  </span>
                )}
              </div>

              {stage === "answered" && (
                <div className="flex flex-wrap items-center gap-2">
                  {isEditingAnswer ? (
                    <>
                      <Button
                        size="sm"
                        onClick={finishEditAnswer}
                        className="h-7 text-xs gap-1"
                      >
                        <Check className="w-3 h-3" /> 完成編輯
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={cancelEditAnswer}
                        className="h-7 text-xs gap-1"
                      >
                        <X className="w-3 h-3" /> 取消
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={startEditAnswer}
                        disabled={savingLearning}
                        className="h-7 text-xs gap-1"
                      >
                        <Pencil className="w-3 h-3" /> 編輯
                      </Button>
                      {savedToKnowledge ? (
                        <span className="inline-flex items-center gap-1 text-xs text-primary">
                          <CheckCircle2 className="w-3 h-3" /> 已存入知識庫
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleSaveLearningToKnowledge}
                          disabled={savingLearning}
                          className="h-7 text-xs gap-1"
                        >
                          {savingLearning ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Save className="w-3 h-3" />
                          )}
                          存為知識
                        </Button>
                      )}
                      {answerWasEdited && !savedToKnowledge && (
                        <span className="text-xs text-muted-foreground">已修正未儲存</span>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={resetLearning}
                        className="h-7 text-xs gap-1 ml-auto"
                      >
                        <Dices className="w-3 h-3" /> 下一題
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default EmailKnowledgeChat;
