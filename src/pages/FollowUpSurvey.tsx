import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Star, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface SurveyInfo {
  submitted: boolean;
  submittedAt: string | null;
  sentAt: string | null;
  rma: {
    rma_number: string;
    customer_name: string;
    product_model: string | null;
  } | null;
}

const FollowUpSurvey = () => {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<SurveyInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [satisfaction, setSatisfaction] = useState<number>(4);
  const [comments, setComments] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoadError("無效的問卷連結");
      setIsLoading(false);
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke(
          `submit-follow-up-survey?token=${encodeURIComponent(token)}`,
          { method: "GET" as any },
        );
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        setInfo(data as SurveyInfo);
      } catch (e: any) {
        setLoadError(e?.message || "找不到問卷");
      } finally {
        setIsLoading(false);
      }
    })();
  }, [token]);

  const handleSubmit = async () => {
    if (!token) return;
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("submit-follow-up-survey", {
        body: { token, satisfaction, comments: comments.trim() || undefined },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setDone(true);
      toast.success("感謝您的回饋!");
    } catch (e: any) {
      toast.error(e?.message || "送出失敗");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError) {
    return (
      <Centered>
        <AlertCircle className="w-10 h-10 text-destructive mx-auto mb-3" />
        <h1 className="text-xl font-semibold mb-2">問卷無法開啟</h1>
        <p className="text-muted-foreground">{loadError}</p>
      </Centered>
    );
  }

  if (done || info?.submitted) {
    return (
      <Centered>
        <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
        <h1 className="text-xl font-semibold mb-2">感謝您的回饋!</h1>
        <p className="text-muted-foreground">
          您的意見已成功送出,我們會持續改進服務品質。
        </p>
      </Centered>
    );
  }

  const rma = info?.rma;

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900">CREST 保固服務</h1>
          <p className="text-sm text-muted-foreground mt-1">滿意度問卷</p>
        </header>

        <div className="bg-card border rounded-2xl shadow-sm p-6 sm:p-8 space-y-6">
          {rma && (
            <div className="bg-slate-50 rounded-lg p-4 text-sm space-y-1">
              <div><span className="text-muted-foreground">RMA 編號:</span> <span className="font-mono">{rma.rma_number}</span></div>
              <div><span className="text-muted-foreground">客戶:</span> {rma.customer_name}</div>
              {rma.product_model && (
                <div><span className="text-muted-foreground">產品:</span> {rma.product_model}</div>
              )}
            </div>
          )}

          <div>
            <p className="text-base font-medium mb-3">
              請為這次的保固服務評分(1–5 分)
            </p>
            <div className="flex items-center justify-center gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSatisfaction(n)}
                  className="p-2 transition-transform hover:scale-110"
                  aria-label={`${n} 顆星`}
                >
                  <Star
                    className={`w-9 h-9 ${
                      satisfaction >= n
                        ? "fill-amber-400 text-amber-400"
                        : "text-slate-300"
                    }`}
                  />
                </button>
              ))}
            </div>
            <p className="text-center text-sm text-muted-foreground mt-2">
              目前評分:{satisfaction} / 5
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              其他意見(選填)
            </label>
            <Textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="歡迎告訴我們任何想法,協助我們持續進步..."
              rows={5}
              maxLength={2000}
            />
            <p className="text-xs text-muted-foreground mt-1 text-right">
              {comments.length} / 2000
            </p>
          </div>

          <Button
            className="w-full"
            size="lg"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />送出中…</>
            ) : (
              "送出問卷"
            )}
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          © CREST 保固服務 — 感謝您的支持
        </p>
      </div>
    </div>
  );
};

const Centered = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
    <div className="bg-card border rounded-2xl shadow-sm p-8 max-w-md text-center">
      {children}
    </div>
  </div>
);

export default FollowUpSurvey;
