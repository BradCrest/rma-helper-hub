import { useState, useEffect } from "react";
import { Bot, Loader2, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const SLACK_MODEL_OPTIONS = [
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro（推薦・平衡）" },
  { value: "openai/gpt-5", label: "GPT-5（最高品質・成本較高）" },
  { value: "openai/gpt-5.2", label: "GPT-5.2（最新・推理最強）" },
];

const ADMIN_CHAT_MODEL_OPTIONS = [
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash（推薦・快速便宜）" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro（更精準）" },
  { value: "openai/gpt-5-mini", label: "GPT-5 Mini（中階）" },
];

const AiModelSettings = () => {
  const [slackModel, setSlackModel] = useState("google/gemini-2.5-pro");
  const [adminChatModel, setAdminChatModel] = useState("google/gemini-2.5-flash");
  const [originalSlack, setOriginalSlack] = useState("");
  const [originalAdmin, setOriginalAdmin] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingSlack, setIsSavingSlack] = useState(false);
  const [isSavingAdmin, setIsSavingAdmin] = useState(false);

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.from("ai_settings").select("setting_key, setting_value");
      if (error) throw error;
      for (const row of data || []) {
        const value = typeof row.setting_value === "string" ? row.setting_value : JSON.parse(JSON.stringify(row.setting_value));
        if (row.setting_key === "slack_reply_model") {
          setSlackModel(value);
          setOriginalSlack(value);
        }
        if (row.setting_key === "admin_chat_model") {
          setAdminChatModel(value);
          setOriginalAdmin(value);
        }
      }
    } catch (e: any) {
      console.error(e);
      toast.error("載入 AI 設定失敗");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const saveSetting = async (key: string, value: string, setSaving: (b: boolean) => void) => {
    setSaving(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        toast.error("請先登入");
        return;
      }
      const { data, error } = await supabase.functions.invoke("update-ai-settings", {
        body: { setting_key: key, setting_value: value },
        headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("已儲存設定");
      if (key === "slack_reply_model") setOriginalSlack(value);
      if (key === "admin_chat_model") setOriginalAdmin(value);
    } catch (e: any) {
      console.error(e);
      toast.error("儲存失敗：" + (e.message || "請稍後再試"));
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="rma-card mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Bot className="w-5 h-5" />
          <h2 className="text-lg font-semibold text-foreground">AI 模型設定</h2>
        </div>
        <div className="text-center py-6">
          <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="rma-card mb-6">
      <div className="flex items-center gap-2 mb-1">
        <Bot className="w-5 h-5" />
        <h2 className="text-lg font-semibold text-foreground">AI 模型設定</h2>
        <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full ml-2">
          僅超級管理員
        </span>
      </div>
      <p className="text-sm text-muted-foreground mb-4 flex items-center gap-1">
        <Sparkles className="w-3 h-3" />
        切換不同 AI 模型以平衡品質與成本
      </p>

      <div className="space-y-4">
        {/* Slack reply model */}
        <div className="p-3 border border-border rounded-lg">
          <label className="block text-sm font-medium text-foreground mb-1">
            Slack 客服回覆模型
          </label>
          <p className="text-xs text-muted-foreground mb-2">
            用於從 Slack 私訊接收客戶 Email 並產生回覆草稿
          </p>
          <div className="flex gap-2">
            <select
              value={slackModel}
              onChange={(e) => setSlackModel(e.target.value)}
              className="rma-input flex-1"
              disabled={isSavingSlack}
            >
              {SLACK_MODEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => saveSetting("slack_reply_model", slackModel, setIsSavingSlack)}
              disabled={isSavingSlack || slackModel === originalSlack}
              className="rma-btn-primary text-sm disabled:opacity-50"
            >
              {isSavingSlack ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              儲存
            </button>
          </div>
        </div>

        {/* Admin chat model */}
        <div className="p-3 border border-border rounded-lg">
          <label className="block text-sm font-medium text-foreground mb-1">
            後台 AI 對話框模型
          </label>
          <p className="text-xs text-muted-foreground mb-2">
            用於 Email 知識庫查詢與 RMA 分析對話
          </p>
          <div className="flex gap-2">
            <select
              value={adminChatModel}
              onChange={(e) => setAdminChatModel(e.target.value)}
              className="rma-input flex-1"
              disabled={isSavingAdmin}
            >
              {ADMIN_CHAT_MODEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => saveSetting("admin_chat_model", adminChatModel, setIsSavingAdmin)}
              disabled={isSavingAdmin || adminChatModel === originalAdmin}
              className="rma-btn-primary text-sm disabled:opacity-50"
            >
              {isSavingAdmin ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              儲存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AiModelSettings;
