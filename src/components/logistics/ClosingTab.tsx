import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CheckSquare, Search, Clock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";
import type { Database } from "@/integrations/supabase/types";

type RmaStatus = Database["public"]["Enums"]["rma_status"];

interface RmaRequest {
  id: string;
  rma_number: string;
  customer_name: string;
  product_model: string | null;
  status: string;
  updated_at: string;
  follow_up_due_at: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  shipped_back: "已寄回（舊）",
  shipped_back_new: "已寄出新品",
  shipped_back_refurbished: "已寄出整新機",
  shipped_back_original: "已寄回原機",
  follow_up: "追蹤中",
};

const SHIPPED_BACK_STATUSES: RmaStatus[] = [
  "shipped_back",
  "shipped_back_new",
  "shipped_back_refurbished",
  "shipped_back_original",
];

const FOLLOW_UP_DAYS = 7;

const ClosingTab = () => {
  const [rmas, setRmas] = useState<RmaRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<RmaRequest | null>(null);
  const [action, setAction] = useState<"follow_up" | "closed" | null>(null);
  const [actionNotes, setActionNotes] = useState("");
  const [needsFollowUp, setNeedsFollowUp] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchRmas = async () => {
    setIsLoading(true);
    const statuses: RmaStatus[] = [...SHIPPED_BACK_STATUSES, "follow_up"];
    const { data, error } = await supabase
      .from("rma_requests")
      .select("id, rma_number, customer_name, product_model, status, updated_at, follow_up_due_at")
      .in("status", statuses)
      .order("updated_at", { ascending: true });
    if (error) toast.error("載入資料失敗");
    else setRmas((data ?? []) as RmaRequest[]);
    setIsLoading(false);
  };

  useEffect(() => { fetchRmas(); }, []);

  const filtered = rmas.filter((r) =>
    r.rma_number.toLowerCase().includes(search.toLowerCase()) ||
    r.customer_name.toLowerCase().includes(search.toLowerCase())
  );

  const openDialog = (rma: RmaRequest, act: "follow_up" | "closed") => {
    setSelected(rma);
    setAction(act);
    setActionNotes("");
    // Default: ticked when closing from shipped_back (force user decision); unticked when from follow_up
    setNeedsFollowUp(act === "closed" && rma.status !== "follow_up");
  };

  const handleUpdate = async () => {
    if (!selected || !action) return;
    setIsSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("未登入");

      // If action is "closed" but checkbox is ticked, route to follow_up instead
      const finalStatus = action === "closed" && needsFollowUp ? "follow_up" : action;
      const followUpDueAt =
        finalStatus === "follow_up"
          ? new Date(Date.now() + FOLLOW_UP_DAYS * 24 * 60 * 60 * 1000).toISOString()
          : null;

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-rma-status`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            rma_id: selected.id,
            new_status: finalStatus,
            notes: actionNotes.trim() || null,
            follow_up_due_at: followUpDueAt,
          }),
        }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "更新失敗");
      }
      toast.success(
        finalStatus === "follow_up"
          ? `已標記為追蹤中（${FOLLOW_UP_DAYS} 天後到期）`
          : "案件已結案"
      );
      setSelected(null);
      setAction(null);
      setActionNotes("");
      setNeedsFollowUp(false);
      fetchRmas();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "更新失敗");
    } finally {
      setIsSubmitting(false);
    }
  };

  const waitDays = (updatedAt: string) =>
    Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86400000);

  const followUpRemaining = (dueAt: string | null): number | null => {
    if (!dueAt) return null;
    return Math.ceil((new Date(dueAt).getTime() - Date.now()) / 86400000);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <CheckSquare className="w-5 h-5" />結案追蹤
        </h2>
        <Badge variant="outline">{filtered.length} 筆待確認</Badge>
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
          <CheckSquare className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">目前沒有待結案追蹤的案件</p>
        </div>
      ) : (
        <div className="rma-card p-0 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>RMA 編號</TableHead>
                <TableHead>客戶</TableHead>
                <TableHead>型號</TableHead>
                <TableHead>目前狀態</TableHead>
                <TableHead>更新天數 / 關懷倒數</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((rma) => {
                const days = waitDays(rma.updated_at);
                const isShippedBack = SHIPPED_BACK_STATUSES.includes(rma.status as RmaStatus);
                const isFollowUp = rma.status === "follow_up";
                const remaining = isFollowUp ? followUpRemaining(rma.follow_up_due_at) : null;
                return (
                  <TableRow key={rma.id}>
                    <TableCell className="font-mono text-sm">{rma.rma_number}</TableCell>
                    <TableCell>{rma.customer_name}</TableCell>
                    <TableCell>{rma.product_model ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={isFollowUp ? "default" : "secondary"}>
                        {STATUS_LABELS[rma.status] ?? rma.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {isFollowUp && remaining !== null ? (
                        remaining < 0 ? (
                          <span className="inline-flex items-center gap-1 text-destructive font-medium">
                            <AlertTriangle className="w-3 h-3" />
                            逾期 {-remaining} 天
                          </span>
                        ) : remaining === 0 ? (
                          <span className="text-amber-600 font-medium">今日到期</span>
                        ) : (
                          <span className="text-muted-foreground">{remaining} 天後關懷</span>
                        )
                      ) : (
                        <span className={days > 14 ? "text-destructive font-medium" : "text-muted-foreground"}>
                          {days} 天
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {isShippedBack && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openDialog(rma, "follow_up")}
                          >
                            <Clock className="w-3 h-3 mr-1" />追蹤中
                          </Button>
                        )}
                        {(isFollowUp || isShippedBack) && (
                          <Button
                            size="sm"
                            variant={isFollowUp ? "default" : "outline"}
                            onClick={() => openDialog(rma, "closed")}
                          >
                            結案
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

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action === "follow_up" ? "標記追蹤中" : "確認結案"} — {selected?.rma_number}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm bg-muted/40 rounded-lg p-3">
                <div><span className="text-muted-foreground">客戶：</span>{selected.customer_name}</div>
                <div><span className="text-muted-foreground">型號：</span>{selected.product_model ?? "—"}</div>
                <div>
                  <span className="text-muted-foreground">目前狀態：</span>
                  {STATUS_LABELS[selected.status] ?? selected.status}
                </div>
                <div>
                  <span className="text-muted-foreground">更新日期：</span>
                  {format(new Date(selected.updated_at), "yyyy-MM-dd")}
                </div>
              </div>

              {action === "closed" && (
                <div className="flex items-start gap-2 p-3 rounded-lg border border-border bg-muted/20">
                  <Checkbox
                    id="needs-follow-up"
                    checked={needsFollowUp}
                    onCheckedChange={(v) => setNeedsFollowUp(v === true)}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <Label htmlFor="needs-follow-up" className="cursor-pointer font-medium">
                      需要 {FOLLOW_UP_DAYS} 天後關懷客戶
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      勾選後，案件將進入「追蹤中」狀態，{FOLLOW_UP_DAYS} 天後到期會自動發 Slack 提醒。
                      未勾選則直接結案。
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>
                  {action === "follow_up"
                    ? "追蹤備註（選填）"
                    : needsFollowUp
                    ? "追蹤備註（選填）"
                    : "結案備註（選填）"}
                </Label>
                <Textarea
                  placeholder={
                    action === "follow_up" || needsFollowUp
                      ? "例：已通知客戶，等待確認收件"
                      : "例：客戶確認收到，滿意度良好"
                  }
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSelected(null)}>取消</Button>
                <Button onClick={handleUpdate} disabled={isSubmitting}>
                  {isSubmitting
                    ? "更新中…"
                    : action === "follow_up"
                    ? "確認追蹤中"
                    : needsFollowUp
                    ? `標記追蹤（${FOLLOW_UP_DAYS} 天）`
                    : "確認結案"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClosingTab;
