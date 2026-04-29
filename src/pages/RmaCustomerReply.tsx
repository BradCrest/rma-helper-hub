import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle2, AlertTriangle, Send } from "lucide-react";
import { toast } from "sonner";

interface ThreadInfo {
  status: "ok" | "expired" | "used" | "not_found";
  rmaNumber?: string;
  customerName?: string;
  productName?: string;
  productModel?: string;
  originalIssue?: string;
  adminSubject?: string;
  adminReply?: string;
  sentAt?: string;
}

const RmaCustomerReply = () => {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<ThreadInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("lookup-rma-reply-thread", {
          body: { token },
        });
        if (error) throw error;
        setInfo(data as ThreadInfo);
      } catch (e: any) {
        toast.error("讀取失敗：" + (e?.message || ""));
        setInfo({ status: "not_found" });
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const handleSubmit = async () => {
    if (!token || !reply.trim()) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("submit-customer-reply", {
        body: { token, body: reply.trim() },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setDone(true);
    } catch (e: any) {
      toast.error("送出失敗：" + (e?.message || ""));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="rma-card max-w-lg w-full text-center py-12">
          <CheckCircle2 className="w-16 h-16 mx-auto text-emerald-500 mb-4" />
          <h1 className="text-2xl font-bold mb-2">已成功送出</h1>
          <p className="text-muted-foreground">
            感謝您的回覆，CREST 客服團隊將會在 1–2 個工作天內與您聯繫。
          </p>
        </div>
      </div>
    );
  }

  if (info?.status === "not_found") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="rma-card max-w-lg w-full text-center py-12">
          <AlertTriangle className="w-16 h-16 mx-auto text-amber-500 mb-4" />
          <h1 className="text-2xl font-bold mb-2">連結無效</h1>
          <p className="text-muted-foreground">查無此回覆連結，請確認網址是否正確。</p>
        </div>
      </div>
    );
  }

  if (info?.status === "expired") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="rma-card max-w-lg w-full text-center py-12">
          <AlertTriangle className="w-16 h-16 mx-auto text-amber-500 mb-4" />
          <h1 className="text-2xl font-bold mb-2">連結已過期</h1>
          <p className="text-muted-foreground">
            此回覆連結已超過有效期限，請直接來信或致電 CREST 客服。
          </p>
        </div>
      </div>
    );
  }

  if (info?.status === "used") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="rma-card max-w-lg w-full text-center py-12">
          <CheckCircle2 className="w-16 h-16 mx-auto text-emerald-500 mb-4" />
          <h1 className="text-2xl font-bold mb-2">您已透過此連結回覆過了</h1>
          <p className="text-muted-foreground">
            若您還有其他問題，請直接來信或致電 CREST 客服，我們會儘快與您聯繫。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="rma-card">
          <h1 className="text-xl font-bold mb-1">回覆 CREST 客服</h1>
          <p className="text-sm text-muted-foreground">
            維修申請編號 <span className="font-mono font-semibold text-foreground">{info?.rmaNumber}</span>
            {info?.productName ? ` · ${info.productName} ${info.productModel || ""}` : ""}
          </p>
        </div>

        <div className="rma-card space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">您原本的問題</h2>
          <div className="bg-muted/30 border-l-2 border-l-muted-foreground/30 p-3 rounded-r text-sm whitespace-pre-wrap">
            {info?.originalIssue || "—"}
          </div>

          <h2 className="text-sm font-semibold text-muted-foreground pt-2">客服的回覆</h2>
          {info?.adminSubject && (
            <div className="text-sm font-medium">{info.adminSubject}</div>
          )}
          <div className="bg-primary/5 border-l-2 border-l-primary p-3 rounded-r text-sm whitespace-pre-wrap">
            {info?.adminReply || "—"}
          </div>
        </div>

        <div className="rma-card space-y-3">
          <h2 className="text-sm font-semibold">您的回覆</h2>
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="請輸入您針對上述回覆的進一步說明、追問或意見…"
            rows={8}
          />
          <p className="text-xs text-muted-foreground">
            送出後此連結將失效；如需再次回覆，請等待客服的下一封 Email。
          </p>
          <div className="flex justify-end">
            <Button onClick={handleSubmit} disabled={submitting || !reply.trim()}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              送出回覆
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RmaCustomerReply;
