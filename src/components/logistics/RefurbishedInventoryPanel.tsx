import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ShoppingCart, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  REFURB_INVENTORY_STATUS_LABELS,
  REFURB_INVENTORY_STATUS_BADGE,
} from "@/lib/supplierMapping";

interface InventoryItem {
  id: string;
  product_model: string;
  serial_number: string | null;
  grade: "A" | "B" | "C";
  source_rma_id: string | null;
  source_rma_number?: string | null;
  cost: number | null;
  status: string;
  used_for_rma_id: string | null;
  notes: string | null;
  received_date: string;
  released_date: string | null;
}

const GRADE_BADGE: Record<string, string> = {
  A: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  B: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  C: "bg-orange-100 text-orange-800 hover:bg-orange-100",
};

const TRACKED_MODELS = ["CR-4", "CR-1", "CR-5", "CR-5L"];

const RefurbishedInventoryPanel = () => {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<InventoryItem[]>([]);

  // action dialogs
  const [allocItem, setAllocItem] = useState<InventoryItem | null>(null);
  const [allocRma, setAllocRma] = useState("");

  const [sellItem, setSellItem] = useState<InventoryItem | null>(null);
  const [sellPrice, setSellPrice] = useState("");
  const [sellDate, setSellDate] = useState("");

  const [scrapItem, setScrapItem] = useState<InventoryItem | null>(null);
  const [scrapReason, setScrapReason] = useState("");

  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("refurbished_inventory")
      .select(
        "id, product_model, serial_number, grade, source_rma_id, cost, status, used_for_rma_id, notes, received_date, released_date, source_rma:rma_requests!refurbished_inventory_source_rma_id_fkey(rma_number)"
      )
      .order("received_date", { ascending: false });
    const rows = (data || []).map((r) => ({
      ...r,
      source_rma_number: (r as { source_rma?: { rma_number?: string } }).source_rma?.rma_number ?? null,
    })) as InventoryItem[];
    setItems(rows);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // summary by model & grade
  const summary = useMemo(() => {
    const m: Record<string, { A: number; B: number; C: number }> = {};
    for (const model of TRACKED_MODELS) m[model] = { A: 0, B: 0, C: 0 };
    for (const it of items) {
      if (it.status !== "in_stock") continue;
      if (!m[it.product_model]) m[it.product_model] = { A: 0, B: 0, C: 0 };
      m[it.product_model][it.grade] += 1;
    }
    return m;
  }, [items]);

  const allocate = async () => {
    if (!allocItem) return;
    if (!allocRma.trim()) {
      toast.error("請輸入 RMA 編號");
      return;
    }
    setBusy(true);
    try {
      const { data: rma, error: rErr } = await supabase
        .from("rma_requests")
        .select("id")
        .eq("rma_number", allocRma.trim().toUpperCase())
        .maybeSingle();
      if (rErr) throw rErr;
      if (!rma) {
        toast.error("找不到該 RMA 編號");
        setBusy(false);
        return;
      }
      const { error } = await supabase
        .from("refurbished_inventory")
        .update({
          status: "used_warranty",
          used_for_rma_id: rma.id,
          released_date: new Date().toISOString().slice(0, 10),
        })
        .eq("id", allocItem.id);
      if (error) throw error;
      toast.success("已撥用為保固替代品");
      setAllocItem(null);
      setAllocRma("");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "撥用失敗");
    } finally {
      setBusy(false);
    }
  };

  const markSold = async () => {
    if (!sellItem) return;
    setBusy(true);
    try {
      const note = sellPrice ? `售價 NT$ ${sellPrice}` : "已售出";
      const { error } = await supabase
        .from("refurbished_inventory")
        .update({
          status: "sold",
          released_date: sellDate || new Date().toISOString().slice(0, 10),
          notes: sellItem.notes ? `${sellItem.notes}\n${note}` : note,
        })
        .eq("id", sellItem.id);
      if (error) throw error;
      toast.success("已標記售出");
      setSellItem(null);
      setSellPrice("");
      setSellDate("");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "標記失敗");
    } finally {
      setBusy(false);
    }
  };

  const scrap = async () => {
    if (!scrapItem || !scrapReason.trim()) {
      toast.error("請填寫報廢原因");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase
        .from("refurbished_inventory")
        .update({
          status: "scrapped",
          released_date: new Date().toISOString().slice(0, 10),
          notes: scrapItem.notes
            ? `${scrapItem.notes}\n報廢原因：${scrapReason}`
            : `報廢原因：${scrapReason}`,
        })
        .eq("id", scrapItem.id);
      if (error) throw error;
      toast.success("已報廢");
      setScrapItem(null);
      setScrapReason("");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "報廢失敗");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {TRACKED_MODELS.map((m) => (
          <div key={m} className="rma-card">
            <div className="text-xs text-muted-foreground">{m}</div>
            <div className="flex gap-3 mt-1 text-sm">
              <span>
                A：<strong>{summary[m]?.A ?? 0}</strong>
              </span>
              <span>
                B：<strong>{summary[m]?.B ?? 0}</strong>
              </span>
              <span>
                C：<strong>{summary[m]?.C ?? 0}</strong>
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rma-card">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">目前沒有整新品庫存</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>型號</TableHead>
                <TableHead>序號</TableHead>
                <TableHead>等級</TableHead>
                <TableHead>來源 RMA</TableHead>
                <TableHead>成本</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead>入庫日</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell className="font-medium">{it.product_model}</TableCell>
                  <TableCell className="font-mono text-xs">{it.serial_number || "—"}</TableCell>
                  <TableCell>
                    <Badge className={GRADE_BADGE[it.grade]}>{it.grade}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {it.source_rma_number || "—"}
                  </TableCell>
                  <TableCell>
                    {it.cost != null ? `NT$ ${Number(it.cost).toLocaleString()}` : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge className={REFURB_INVENTORY_STATUS_BADGE[it.status] || ""}>
                      {REFURB_INVENTORY_STATUS_LABELS[it.status] || it.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {format(new Date(it.received_date), "yyyy-MM-dd")}
                  </TableCell>
                  <TableCell className="text-right">
                    {it.status === "in_stock" && (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => setAllocItem(it)}>
                          <ShieldCheck className="w-3 h-3 mr-1" />
                          撥用
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setSellItem(it)}>
                          <ShoppingCart className="w-3 h-3 mr-1" />
                          售出
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setScrapItem(it)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* 撥用 Dialog */}
      <Dialog open={!!allocItem} onOpenChange={(o) => !o && setAllocItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>撥用為保固替代品</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {allocItem?.product_model} · {allocItem?.grade} 級 · 序號 {allocItem?.serial_number || "—"}
            </p>
            <div>
              <Label className="mb-1 block">目標 RMA 編號 *</Label>
              <Input
                value={allocRma}
                onChange={(e) => setAllocRma(e.target.value)}
                placeholder="例如：RC7E9001023"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAllocItem(null)}>
              取消
            </Button>
            <Button onClick={allocate} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              撥用
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 售出 Dialog */}
      <Dialog open={!!sellItem} onOpenChange={(o) => !o && setSellItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>標記為售出</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="mb-1 block">售價 (NT$)</Label>
              <Input
                type="number"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1 block">售出日期</Label>
              <Input type="date" value={sellDate} onChange={(e) => setSellDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSellItem(null)}>
              取消
            </Button>
            <Button onClick={markSold} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
              確認
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 報廢 Dialog */}
      <Dialog open={!!scrapItem} onOpenChange={(o) => !o && setScrapItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>報廢</DialogTitle>
          </DialogHeader>
          <div>
            <Label className="mb-1 block">原因 *</Label>
            <Textarea rows={3} value={scrapReason} onChange={(e) => setScrapReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScrapItem(null)}>
              取消
            </Button>
            <Button onClick={scrap} disabled={busy} variant="destructive">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              報廢
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RefurbishedInventoryPanel;
