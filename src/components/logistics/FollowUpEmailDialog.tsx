import { useState } from "react";
import { Loader2, Sparkles, Send, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rma: {
    id: string;
    rma_number: string;
    customer_name: string;
    customer_email: string;
    product_model: string | null;
  } | null;
  onSent?: () => void;
}

const DEFAULT_TEMPLATE = (rma: Props["rma"]) =>
  `${rma?.customer_name ?? "您好"}，您好：

距離我們完成您的 ${rma?.product_model ?? "產品"}（RMA ${rma?.rma_number ?? ""}）保固服務已過了一段時間，想關心一下您的使用狀況是否一切順利？

若使用上有任何疑問，或產品狀況需要進一步協助，歡迎隨時與我們聯繫，我們將儘速為您處理。

也懇請您撥冗填寫下方的滿意度問卷，您的回饋是我們持續改進的動力，謝謝您！`;

const FollowUpEmailDialog = ({ open, onOpenChange, rma, onSent }: Props) => {
  const [subject, setSubject] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [includeSurvey, setIncludeSurvey] = useState(true);
  const [isDrafting, setIsDrafting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [aiModel, setAiModel] = useState("");

  // Reset whenever opened/RMA changes
  const handleOpenChange = (next: boolean) => {
    if (next && rma) {
      setSubject(`CREST 保固服務 — 關於您 RMA ${rma.rma_number} 的後續關懷`);
      setMessageBody(DEFAULT_TEMPLATE(rma));
      setIncludeSurvey(true);
      setAiModel("");
    }
    onOpenChange(next);
  };

  const handleAIDraft = async () => {
    if (!rma) return;
    setIsDrafting(true);
    try {
      const { data, error } = await supabase.functions.invoke("draft-follow-up-email", {
        body: { rmaId: rma.id },
      });
      if (error) throw error;
      if (data?.draft) {
        setMessageBody(data.draft);
        setAiModel(data.model || "");
        toast.success("AI 草稿已產生");
      } else {
        toast.error(data?.error || "AI 草稿產生失敗");
      }
    } catch (e: any) {
      toast.error(e?.message || "AI 草稿產生失敗");
    } finally {
      setIsDrafting(false);
    }
  };

  const handleSend = async () => {
    if (!rma) return;
    if (!messageBody.trim()) {
      toast.error("請輸入信件內容");
      return;
    }
    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-follow-up-email", {
        body: {
          rmaId: rma.id,
          messageBody: messageBody.trim(),
          subject: subject.trim() || undefined,
          includeSurvey,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("關懷信已寄出");
      onOpenChange(false);
      onSent?.();
    } catch (e: any) {
      toast.error(e?.message || "寄送失敗");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>寄送關懷信 — {rma?.rma_number}</DialogTitle>
          <DialogDescription>
            收件人：{rma?.customer_name}（{rma?.customer_email}）
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>主旨</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="信件主旨"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>信件內容</Label>
              <Button
                size="sm"
                variant="outline"
                onClick={handleAIDraft}
                disabled={isDrafting}
              >
                {isDrafting ? (
                  <><Loader2 className="w-3 h-3 mr-1 animate-spin" />產生中…</>
                ) : (
                  <><Sparkles className="w-3 h-3 mr-1" />AI 個人化草稿</>
                )}
              </Button>
            </div>
            <Textarea
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              rows={12}
              placeholder="關懷信內文（管理員可自由編輯）"
              className="font-mono text-sm"
            />
            {aiModel && (
              <p className="text-xs text-muted-foreground">由 {aiModel} 產生，請審閱後再寄出</p>
            )}
          </div>

          <div className="flex items-start gap-2 p-3 rounded-lg border border-border bg-muted/20">
            <Checkbox
              id="include-survey"
              checked={includeSurvey}
              onCheckedChange={(v) => setIncludeSurvey(v === true)}
              className="mt-0.5"
            />
            <div className="flex-1">
              <Label htmlFor="include-survey" className="cursor-pointer font-medium">
                附上滿意度問卷連結
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                客戶將收到 5 題評分問卷（1–5 分），可選填意見後送出。
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={() => rma && setMessageBody(DEFAULT_TEMPLATE(rma))}
            >
              <RefreshCw className="w-3 h-3 mr-1" />重設範本
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button onClick={handleSend} disabled={isSending}>
              {isSending ? (
                <><Loader2 className="w-3 h-3 mr-1 animate-spin" />寄送中…</>
              ) : (
                <><Send className="w-3 h-3 mr-1" />寄送關懷信</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FollowUpEmailDialog;
