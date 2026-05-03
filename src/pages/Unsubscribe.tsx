import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type State =
  | { kind: "loading" }
  | { kind: "valid" }
  | { kind: "already" }
  | { kind: "invalid"; message: string }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string };

const Unsubscribe = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (!token) {
      setState({ kind: "invalid", message: "缺少退訂連結代碼。/ Missing unsubscribe token." });
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`,
          { headers: { apikey: SUPABASE_KEY } }
        );
        const data = await res.json();
        if (!res.ok) {
          setState({ kind: "invalid", message: data.error || "連結無效或已過期。/ Link is invalid or expired." });
          return;
        }
        if (data.valid === false && data.reason === "already_unsubscribed") {
          setState({ kind: "already" });
          return;
        }
        setState({ kind: "valid" });
      } catch (err) {
        setState({ kind: "invalid", message: "無法驗證連結，請稍後再試。/ Unable to verify link, please try again later." });
      }
    })();
  }, [token]);

  const handleConfirm = async () => {
    if (!token) return;
    setState({ kind: "submitting" });
    try {
      const { data, error } = await supabase.functions.invoke("handle-email-unsubscribe", {
        body: { token },
      });
      if (error) throw error;
      if (data?.success) {
        setState({ kind: "success" });
      } else if (data?.reason === "already_unsubscribed") {
        setState({ kind: "already" });
      } else {
        setState({ kind: "error", message: data?.error || "退訂失敗。/ Unsubscribe failed." });
      }
    } catch (err: any) {
      setState({ kind: "error", message: err?.message || "退訂失敗，請稍後再試。/ Unsubscribe failed, please try again." });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>取消訂閱通知 / Unsubscribe from Notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {state.kind === "loading" && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> 驗證中… / Verifying…
            </div>
          )}
          {state.kind === "valid" && (
            <>
              <p className="text-sm text-muted-foreground">
                點擊下方按鈕確認取消訂閱來自 CREST 保固服務的通知信件。<br />
                Click the button below to confirm unsubscribing from CREST service notifications.
              </p>
              <Button onClick={handleConfirm} className="w-full">
                確認取消訂閱 / Confirm Unsubscribe
              </Button>
            </>
          )}
          {state.kind === "submitting" && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> 處理中… / Processing…
            </div>
          )}
          {state.kind === "success" && (
            <div className="flex items-start gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5 mt-0.5" />
              <p className="text-sm">
                您已成功取消訂閱，未來將不再收到通知信件。<br />
                You have successfully unsubscribed and will no longer receive notification emails.
              </p>
            </div>
          )}
          {state.kind === "already" && (
            <div className="flex items-start gap-2 text-muted-foreground">
              <CheckCircle2 className="h-5 w-5 mt-0.5" />
              <p className="text-sm">
                您先前已經取消訂閱了。<br />
                You have already unsubscribed previously.
              </p>
            </div>
          )}
          {(state.kind === "invalid" || state.kind === "error") && (
            <div className="flex items-start gap-2 text-destructive">
              <AlertCircle className="h-5 w-5 mt-0.5" />
              <p className="text-sm">{state.message}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Unsubscribe;
