import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Truck, Search, Package2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { ACTUAL_METHOD_LABELS, type ActualMethod } from "@/lib/refurbishedPricing";

interface RmaRequest {
  id: string;
  rma_number: string;
  customer_name: string;
  product_model: string | null;
  actual_method: string | null;
  status: string;
  updated_at: string;
}

type ShipType = "new" | "refurbished" | "original";

function inferShipType(actualMethod: string | null): ShipType {
  if (actualMethod === "warranty_replace") return "new";
  if (actualMethod === "purchase_a" || actualMethod === "purchase_b" || actualMethod === "purchase_c") return "refurbished";
  return "original";
}

const SHIP_TYPE_LABELS: Record<ShipType, string> = {
  new: "寄出新品",
  refurbished: "寄出整新機",
  original: "寄回原機",
};

const STATUS_LABELS: Record<string, string> = {
  paid: "已付款",
  no_repair: "不維修",
};

const methodLabel = (m: string | null) =>
  m ? (ACTUAL_METHOD_LABELS[m as ActualMethod] ?? m) : "—";

const OutboundShippingTab = () => {
  const [rmas, setRmas] = useState<RmaRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<RmaRequest | null>(null);
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [shipDate, setShipDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchRmas = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("rma_requests")
      .select("id, rma_number, customer_name, product_model, status, updated_at, rma_repair_details(actual_method)")
      .in("status", ["paid", "no_repair"])
      .order("updated_at", { ascending: true });
    if (error) {
      toast.error("載入資料失敗");
    } else {
      setRmas((data ?? []).map((r) => ({
        id: r.id,
        rma_number: r.rma_number,
        customer_name: r.customer_name,
        product_model: r.product_model,
        status: r.status,
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

  const handleSubmit = async () => {
    if (!selected) return;
    if (!carrier.trim()) { toast.error("請填寫物流名稱"); return; }
    if (!trackingNumber.trim()) { toast.error("請填寫物流單號"); return; }

    setIsSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("未登入");

      const shipType = inferShipType(selected.actual_method);
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-outbound-shipping`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            rma_request_id: selected.id,
            carrier: carrier.trim(),
            tracking_number: trackingNumber.trim(),
            ship_date: shipDate,
            ship_type: shipType,
            notes: notes.trim() || null,
          }),
        }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "出貨提交失敗");
      }
      toast.success(`出貨資訊已提交（${SHIP_TYPE_LABELS[shipType]}）`);
      setSelected(null);
      setCarrier("");
      setTrackingNumber("");
      setShipDate(format(new Date(), "yyyy-MM-dd"));
      setNotes("");
      fetchRmas();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "出貨提交失敗");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Truck className="w-5 h-5" />出貨處理
        </h2>
        <Badge variant="outline">{filtered.length} 筆待出貨</Badge>
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
          <Package2 className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">目前沒有待出貨的案件</p>
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
                <TableHead>出貨類型</TableHead>
                <TableHead>目前狀態</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((rma) => (
                <TableRow key={rma.id}>
                  <TableCell className="font-mono text-sm">{rma.rma_number}</TableCell>
                  <TableCell>{rma.customer_name}</TableCell>
                  <TableCell>{rma.product_model ?? "—"}</TableCell>
                  <TableCell>{methodLabel(rma.actual_method)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {SHIP_TYPE_LABELS[inferShipType(rma.actual_method)]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{STATUS_LABELS[rma.status] ?? rma.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => setSelected(rma)}>
                      填寫出貨
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>出貨資訊 — {selected?.rma_number}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm bg-muted/40 rounded-lg p-3">
                <div><span className="text-muted-foreground">客戶：</span>{selected.customer_name}</div>
                <div><span className="text-muted-foreground">型號：</span>{selected.product_model ?? "—"}</div>
                <div><span className="text-muted-foreground">處理方式：</span>{methodLabel(selected.actual_method)}</div>
                <div>
                  <span className="text-muted-foreground">出貨類型：</span>
                  <span className="font-semibold">{SHIP_TYPE_LABELS[inferShipType(selected.actual_method)]}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>物流名稱 *</Label>
                <Input
                  placeholder="例：順豐速運、黑貓宅急便"
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>物流單號 *</Label>
                <Input
                  placeholder="輸入追蹤號碼"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>寄出日期</Label>
                <Input
                  type="date"
                  value={shipDate}
                  onChange={(e) => setShipDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>備註（選填）</Label>
                <Textarea
                  placeholder="例：已通知客戶注意收件"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSelected(null)}>取消</Button>
                <Button onClick={handleSubmit} disabled={isSubmitting}>
                  <Truck className="w-4 h-4 mr-1" />
                  {isSubmitting ? "提交中…" : "確認出貨"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OutboundShippingTab;
