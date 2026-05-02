import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CreditCard, Search, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatNT, ACTUAL_METHOD_LABELS, type ActualMethod } from "@/lib/refurbishedPricing";

interface RmaRequest {
  id: string;
  rma_number: string;
  customer_name: string;
  product_model: string | null;
  actual_method: string | null;
  repair_fee: number | null;
  updated_at: string;
}

const isFree = (fee: number | null) => fee === 0;
const feeDisplay = (fee: number | null) => {
  if (fee === null) return "未設定";
  return isFree(fee) ? "免費" : formatNT(fee);
};
const methodLabel = (m: string | null) =>
  m ? (ACTUAL_METHOD_LABELS[m as ActualMethod] ?? m) : "—";

const PaymentConfirmationTab = () => {
  const [rmas, setRmas] = useState<RmaRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<RmaRequest | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchRmas = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("rma_requests")
      .select("id, rma_number, customer_name, product_model, repair_fee, updated_at, rma_repair_details(actual_method)")
      .eq("status", "quote_confirmed")
      .order("updated_at", { ascending: true });
    if (error) {
      toast.error("載入資料失敗");
    } else {
      setRmas((data ?? []).map((r) => ({
        id: r.id,
        rma_number: r.rma_number,
        customer_name: r.customer_name,
        product_model: r.product_model,
        repair_fee: r.repair_fee,
        updated_at: r.updated_at,
        actual_method: Array.isArray(r.rma_repair_details)
          ? (r.rma_repair_details[0]?.actual_method ?? null)
          : null,
      })));
    }
    setIsLoading(false);
  };

  useEffect(() => { fetchRmas(); }, []);

  const filtered = rmas.filter((r) =>
    r.rma_number.toLowerCase().includes(search.toLowerCase()) ||
    r.customer_name.toLowerCase().includes(search.toLowerCase())
  );

  const handleConfirm = async () => {
    if (!selected) return;
    if (!paymentMethod) { toast.error("請選擇付款方式"); return; }
    setIsSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("未登入");
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
            new_status: "paid",
            notes: [
              `付款確認：${paymentMethod}`,
              paymentNotes.trim() ? `備註：${paymentNotes.trim()}` : null,
            ].filter(Boolean).join("\n"),
          }),
        }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "更新失敗");
      }
      toast.success("已確認收款，案件推進至「已付款」");
      setSelected(null);
      setPaymentMethod("");
      setPaymentNotes("");
      fetchRmas();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "確認失敗");
    } finally {
      setIsSubmitting(false);
    }
  };

  const waitDays = (updatedAt: string) =>
    Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86400000);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <CreditCard className="w-5 h-5" />付款確認
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
          <CheckCircle2 className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">目前沒有待付款確認的案件</p>
        </div>
      ) : (
        <div className="rma-card p-0 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>RMA 編號</TableHead>
                <TableHead>客戶</TableHead>
                <TableHead>型號</TableHead>
                <TableHead>處理方式</TableHead>
                <TableHead>應收金額</TableHead>
                <TableHead>等待天數</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((rma) => {
                const days = waitDays(rma.updated_at);
                return (
                  <TableRow key={rma.id}>
                    <TableCell className="font-mono text-sm">{rma.rma_number}</TableCell>
                    <TableCell>{rma.customer_name}</TableCell>
                    <TableCell>{rma.product_model ?? "—"}</TableCell>
                    <TableCell>{methodLabel(rma.actual_method)}</TableCell>
                    <TableCell>
                      <Badge variant={isFree(rma.repair_fee) ? "secondary" : "default"}>
                        {feeDisplay(rma.repair_fee)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className={days > 7 ? "text-destructive font-medium" : "text-muted-foreground"}>
                        {days} 天
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => setSelected(rma)}>
                        確認收款
                      </Button>
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
            <DialogTitle>確認收款 — {selected?.rma_number}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm bg-muted/40 rounded-lg p-3">
                <div><span className="text-muted-foreground">客戶：</span>{selected.customer_name}</div>
                <div><span className="text-muted-foreground">型號：</span>{selected.product_model ?? "—"}</div>
                <div><span className="text-muted-foreground">處理方式：</span>{methodLabel(selected.actual_method)}</div>
                <div>
                  <span className="text-muted-foreground">應收金額：</span>
                  <span className="font-semibold">{feeDisplay(selected.repair_fee)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>付款方式 *</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue placeholder="選擇付款方式" />
                  </SelectTrigger>
                  <SelectContent>
                    {isFree(selected.repair_fee) && (
                      <SelectItem value="免費（無需付款）">免費（無需付款）</SelectItem>
                    )}
                    <SelectItem value="匯款">匯款</SelectItem>
                    <SelectItem value="信用卡">信用卡</SelectItem>
                    <SelectItem value="現場付款">現場付款</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>備註（選填）</Label>
                <Textarea
                  placeholder="例：匯款末五碼 12345"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSelected(null)}>取消</Button>
                <Button onClick={handleConfirm} disabled={isSubmitting}>
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  {isSubmitting ? "確認中…" : "確認收款"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PaymentConfirmationTab;
