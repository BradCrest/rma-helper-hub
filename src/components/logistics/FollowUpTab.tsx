import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Heart, Search, AlertTriangle, Mail, Star, MessageSquareQuote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import FollowUpEmailDialog from "./FollowUpEmailDialog";

interface Rma {
  id: string;
  rma_number: string;
  customer_name: string;
  customer_email: string;
  product_model: string | null;
  follow_up_due_at: string | null;
  updated_at: string;
}

interface Survey {
  id: string;
  rma_id: string;
  satisfaction: number | null;
  comments: string | null;
  sent_at: string;
  submitted_at: string | null;
}

const FollowUpTab = () => {
  const [rmas, setRmas] = useState<Rma[]>([]);
  const [surveysByRma, setSurveysByRma] = useState<Record<string, Survey[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [emailRma, setEmailRma] = useState<Rma | null>(null);
  const [viewSurveysFor, setViewSurveysFor] = useState<Rma | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    const { data: rmaData, error: rmaErr } = await supabase
      .from("rma_requests")
      .select("id, rma_number, customer_name, customer_email, product_model, follow_up_due_at, updated_at")
      .eq("status", "follow_up")
      .order("follow_up_due_at", { ascending: true, nullsFirst: false });
    if (rmaErr) {
      toast.error("載入資料失敗");
      setIsLoading(false);
      return;
    }
    const list = (rmaData ?? []) as Rma[];
    setRmas(list);

    if (list.length > 0) {
      const ids = list.map((r) => r.id);
      const { data: surveyData } = await supabase
        .from("rma_followup_surveys")
        .select("id, rma_id, satisfaction, comments, sent_at, submitted_at")
        .in("rma_id", ids)
        .order("sent_at", { ascending: false });
      const grouped: Record<string, Survey[]> = {};
      (surveyData ?? []).forEach((s: any) => {
        (grouped[s.rma_id] ||= []).push(s as Survey);
      });
      setSurveysByRma(grouped);
    } else {
      setSurveysByRma({});
    }
    setIsLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = rmas.filter((r) =>
    r.rma_number.toLowerCase().includes(search.toLowerCase()) ||
    r.customer_name.toLowerCase().includes(search.toLowerCase())
  );

  const getSurveyStatus = (rmaId: string) => {
    const surveys = surveysByRma[rmaId] ?? [];
    if (surveys.length === 0) return { label: "未寄送", variant: "outline" as const };
    const submitted = surveys.find((s) => s.submitted_at);
    if (submitted) {
      return {
        label: `已回覆 (${submitted.satisfaction}★)`,
        variant: "default" as const,
        survey: submitted,
      };
    }
    return { label: "已寄送・待回覆", variant: "secondary" as const };
  };

  const dueClass = (dueAt: string | null) => {
    if (!dueAt) return null;
    const remaining = Math.ceil((new Date(dueAt).getTime() - Date.now()) / 86400000);
    if (remaining < 0) {
      return (
        <span className="inline-flex items-center gap-1 text-destructive font-medium">
          <AlertTriangle className="w-3 h-3" />
          逾期 {-remaining} 天
        </span>
      );
    }
    if (remaining === 0) return <span className="text-amber-600 font-medium">今日到期</span>;
    return <span className="text-muted-foreground">{remaining} 天後到期</span>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Heart className="w-5 h-5" />客戶關懷
        </h2>
        <Badge variant="outline">{filtered.length} 筆需要關懷</Badge>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="搜尋 RMA 編號或客戶姓名"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">載入中…</div>
      ) : filtered.length === 0 ? (
        <div className="rma-card text-center py-12">
          <Heart className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">目前沒有需要關懷的案件</p>
        </div>
      ) : (
        <div className="rma-card p-0 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>RMA 編號</TableHead>
                <TableHead>客戶</TableHead>
                <TableHead>型號</TableHead>
                <TableHead>到期狀態</TableHead>
                <TableHead>問卷狀態</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((rma) => {
                const surveyStatus = getSurveyStatus(rma.id);
                return (
                  <TableRow key={rma.id}>
                    <TableCell className="font-mono text-sm">{rma.rma_number}</TableCell>
                    <TableCell>
                      <div>{rma.customer_name}</div>
                      <div className="text-xs text-muted-foreground">{rma.customer_email}</div>
                    </TableCell>
                    <TableCell>{rma.product_model ?? "—"}</TableCell>
                    <TableCell>{dueClass(rma.follow_up_due_at) ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={surveyStatus.variant}>{surveyStatus.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => setEmailRma(rma)}
                        >
                          <Mail className="w-3 h-3 mr-1" />寄關懷信
                        </Button>
                        {(surveysByRma[rma.id]?.length ?? 0) > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setViewSurveysFor(rma)}
                          >
                            <MessageSquareQuote className="w-3 h-3 mr-1" />回覆紀錄
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <FollowUpEmailDialog
        open={!!emailRma}
        onOpenChange={(o) => !o && setEmailRma(null)}
        rma={emailRma}
        onSent={fetchData}
      />

      <Dialog open={!!viewSurveysFor} onOpenChange={(o) => !o && setViewSurveysFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>問卷紀錄 — {viewSurveysFor?.rma_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {(viewSurveysFor && surveysByRma[viewSurveysFor.id])?.map((s) => (
              <div key={s.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    寄出：{format(new Date(s.sent_at), "yyyy-MM-dd HH:mm")}
                  </span>
                  {s.submitted_at ? (
                    <Badge variant="default">已回覆</Badge>
                  ) : (
                    <Badge variant="secondary">待回覆</Badge>
                  )}
                </div>
                {s.submitted_at && (
                  <>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star
                          key={n}
                          className={`w-4 h-4 ${
                            (s.satisfaction ?? 0) >= n
                              ? "fill-amber-400 text-amber-400"
                              : "text-muted-foreground"
                          }`}
                        />
                      ))}
                      <span className="text-sm ml-2">{s.satisfaction} / 5</span>
                    </div>
                    {s.comments && (
                      <div className="bg-muted/40 rounded p-2 text-sm whitespace-pre-wrap">
                        {s.comments}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      回覆時間：{format(new Date(s.submitted_at), "yyyy-MM-dd HH:mm")}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FollowUpTab;
