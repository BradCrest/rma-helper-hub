import { useState, useRef, useEffect } from "react";
import { Bot, Send, Loader2, Sparkles, Pencil, Save, Check, X, CheckCircle2 } from "lucide-react";
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

const EXAMPLE_PROMPTS = [
  "客戶詢問退貨流程，我們通常怎麼回覆？",
  "保固期外的維修報價怎麼說明？",
  "海外客戶寄修運費誰負擔？",
];

const EmailKnowledgeChat = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

    // Find latest user message before this assistant message
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

      // Trigger embedding job, non-blocking
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

  return (
    <div className="rma-card">
      <div className="flex items-center gap-3 p-4 border-b border-border">
        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
          <Bot className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">知識庫 AI 對話</h3>
          <p className="text-sm text-muted-foreground">用自然語言查詢知識庫；可編輯回答並存回知識庫修正錯誤</p>
        </div>
      </div>

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
            const showActions =
              isAssistant && !!msg.content.trim() && !streamingThis;

            return (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] flex flex-col gap-2 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                  <div
                    className={`rounded-lg px-4 py-2 whitespace-pre-wrap text-sm w-full ${
                      msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                    }`}
                  >
                    {msg.isEditing ? (
                      <Textarea
                        value={msg.editedContent ?? ""}
                        onChange={(e) => updateEditContent(i, e.target.value)}
                        className="min-h-[120px] w-full text-sm bg-background"
                      />
                    ) : (
                      msg.content || (streamingThis ? <Loader2 className="w-4 h-4 animate-spin" /> : null)
                    )}
                  </div>

                  {showActions && (
                    <div className="flex flex-wrap items-center gap-2">
                      {msg.isEditing ? (
                        <>
                          <Button size="sm" variant="default" onClick={() => finishEdit(i)} className="h-7 text-xs">
                            <Check className="w-3 h-3" /> 完成編輯
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => cancelEdit(i)} className="h-7 text-xs">
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
          <Button onClick={() => handleSubmit()} disabled={!input.trim() || isLoading} size="icon" className="shrink-0">
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default EmailKnowledgeChat;
