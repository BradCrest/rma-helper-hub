import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Plus, Truck, PackageCheck, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  SUPPLIER_LABELS,
  SUPPLIER_BADGE_CLASSES,
  BATCH_STATUS_LABELS,
  BATCH_STATUS_BADGE,
  type SupplierKey,
} from "@/lib/supplierMapping";

interface Batch {
  id: string;
  supplier_name: string;
  status: string;
  shipped_at: string | null;
  tracking_number_out: string | null;
  expected_return_at: string | null;
  received_at: string | null;
  tracking_number_in: string | null;
  notes: string | null;
}

interface PendingRepair {
  id: string;
  supplier_name: string | null;
  rma: { rma_number: string; customer_name: string; product_model: string | null } | null;
}

interface Props {
  onChanged: () => void;
}

const SupplierBatchPanel = ({ onChanged }: Props) => {
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [batches, setBatches] = useState<Batch[]>([]);

  // create-batch dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createSupplier, setCreateSupplier] = useState<SupplierKey | "">("");
  const [pending, setPending] = useState<PendingRepair[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  // mark-shipped / mark-received dialogs
  const [shipBatch, setShipBatch] = useState<Batch | null>(null);
  const [shipDate, setShipDate] = useState("");
  const [shipTracking, setShipTracking] = useState("");

  const [recvBatch, setRecvBatch] = useState<Batch | null>(null);
  const [recvDate, setRecvDate] = useState("");
  const [recvTracking, setRecvTracking] = useState("");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("supplier_repair_batches")
      .select("*")
      .in("status", ["draft", "shipped"])
      .order("created_at", { ascending: false });
    setBatches((data || []) as Batch[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = async () => {
    setCreateSupplier("");
    setPicked(new Set());
    setCreateOpen(true);
  };

  useEffect(() => {
    if (!createOpen || !createSupplier) {
      setPending([]);
      return;
    }
    supabase
      .from("rma_supplier_repairs")
      .select("id, supplier_name, rma_request_id, rma:rma_requests(rma_number, customer_name, product_model)")
      .eq("supplier_status", "pending_send")
      .eq("supplier_name", createSupplier)
      .is("batch_id", null)
      .then(({ data }) => setPending((data || []) as unknown as PendingRepair[]));
  }, [createOpen, createSupplier]);

  const togglePick = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  const createBatch = async () => {
    if (!createSupplier) {
      toast.error("請選擇供應商");
      return;
    }
    if (picked.size === 0) {
      toast.error("請勾選至少一台工單");
      return;
    }
    setBusy(true);
    try {
      const { data: batch, error } = await supabase
        .from("supplier_repair_batches")
        .insert({ supplier_name: createSupplier, status: "draft" })
        .select()
        .single();
      if (error) throw error;
      const { error: updErr } = await supabase
        .from("rma_supplier_repairs")
        .update({ batch_id: batch.id })
        .in("id", Array.from(picked));
      if (updErr) throw updErr;
      toast.success(`批次已建立，含 ${picked.size} 台`);
      setCreateOpen(false);
      load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "建立失敗");
    } finally {
      setBusy(false);
    }
  };

  const markShipped = async () => {
    if (!shipBatch) return;
    if (!shipDate) {
      toast.error("請填出貨日");
      return;
    }
    setBusy(true);
    try {
      const { error: bErr } = await supabase
        .from("supplier_repair_batches")
        .update({
          status: "shipped",
          shipped_at: shipDate,
          tracking_number_out: shipTracking || null,
        })
        .eq("id", shipBatch.id);
      if (bErr) throw bErr;
      const { error: rErr } = await supabase
        .from("rma_supplier_repairs")
        .update({
          supplier_status: "at_factory",
          sent_to_factory_date: shipDate,
          sent_tracking_number: shipTracking || null,
        })
        .eq("batch_id", shipBatch.id);
      if (rErr) throw rErr;
      toast.success("批次已標記出貨");
      setShipBatch(null);
      load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失敗");
    } finally {
      setBusy(false);
    }
  };

  const markReceived = async () => {
    if (!recvBatch) return;
    if (!recvDate) {
      toast.error("請填收回日");
      return;
    }
    setBusy(true);
    try {
      const { error: bErr } = await supabase
        .from("supplier_repair_batches")
        .update({
          status: "received",
          received_at: recvDate,
          tracking_number_in: recvTracking || null,
        })
        .eq("id", recvBatch.id);
      if (bErr) throw bErr;
      const { error: rErr } = await supabase
        .from("rma_supplier_repairs")
        .update({
          supplier_status: "repaired",
          factory_return_date: recvDate,
        })
        .eq("batch_id", recvBatch.id);
      if (rErr) throw rErr;
      toast.success("批次已標記收回");
      setRecvBatch(null);
      load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失敗");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rma-card">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 font-semibold text-sm"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          批次管理
          <Badge variant="secondary">{batches.length}</Badge>
        </button>
        <Button size="sm" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1" />
          建立新批次
        </Button>
      </div>

      {!collapsed && (
        <div className="mt-4">
          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : batches.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">目前沒有進行中的批次</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {batches.map((b) => {
                const sk = b.supplier_name as SupplierKey;
                return (
                  <div key={b.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge className={SUPPLIER_BADGE_CLASSES[sk] || ""}>
                        {SUPPLIER_LABELS[sk] || b.supplier_name}
                      </Badge>
                      <Badge className={BATCH_STATUS_BADGE[b.status] || ""}>
                        {BATCH_STATUS_LABELS[b.status] || b.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      {b.shipped_at && <div>出貨：{format(new Date(b.shipped_at), "yyyy-MM-dd")}</div>}
                      {b.tracking_number_out && <div>追蹤：{b.tracking_number_out}</div>}
                    </div>
                    <div className="flex gap-2 pt-1">
                      {b.status === "draft" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setShipBatch(b);
                            setShipDate(new Date().toISOString().slice(0, 10));
                            setShipTracking("");
                          }}
                        >
                          <Truck className="w-3 h-3 mr-1" />
                          標記已出貨
                        </Button>
                      )}
                      {b.status === "shipped" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setRecvBatch(b);
                            setRecvDate(new Date().toISOString().slice(0, 10));
                            setRecvTracking("");
                          }}
                        >
                          <PackageCheck className="w-3 h-3 mr-1" />
                          標記已收回
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 建立批次 Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>建立新批次</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="mb-1 block">供應商</Label>
              <Select value={createSupplier} onValueChange={(v) => setCreateSupplier(v as SupplierKey)}>
                <SelectTrigger>
                  <SelectValue placeholder="請選擇" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SUPPLIER_LABELS) as SupplierKey[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {SUPPLIER_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {createSupplier && (
              <div>
                <Label className="mb-2 block">勾選要加入的待寄工單</Label>
                {pending.length === 0 ? (
                  <p className="text-sm text-muted-foreground">該供應商目前無待寄工單</p>
                ) : (
                  <div className="border rounded-md max-h-72 overflow-y-auto divide-y">
                    {pending.map((p) => (
                      <label
                        key={p.id}
                        className="flex items-center gap-3 p-2 hover:bg-muted/40 cursor-pointer"
                      >
                        <Checkbox
                          checked={picked.has(p.id)}
                          onCheckedChange={() => togglePick(p.id)}
                        />
                        <div className="text-sm flex-1">
                          <span className="font-mono">{p.rma?.rma_number}</span>
                          <span className="text-muted-foreground ml-2">
                            {p.rma?.customer_name} · {p.rma?.product_model || "—"}
                          </span>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button onClick={createBatch} disabled={busy || picked.size === 0}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              建立（{picked.size} 台）
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 標記出貨 Dialog */}
      <Dialog open={!!shipBatch} onOpenChange={(o) => !o && setShipBatch(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>標記批次已出貨</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="mb-1 block">出貨日期 *</Label>
              <Input type="date" value={shipDate} onChange={(e) => setShipDate(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block">追蹤號</Label>
              <Input value={shipTracking} onChange={(e) => setShipTracking(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShipBatch(null)}>
              取消
            </Button>
            <Button onClick={markShipped} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
              確認出貨
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 標記收回 Dialog */}
      <Dialog open={!!recvBatch} onOpenChange={(o) => !o && setRecvBatch(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>標記批次已收回</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="mb-1 block">收回日期 *</Label>
              <Input type="date" value={recvDate} onChange={(e) => setRecvDate(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block">回程追蹤號</Label>
              <Input value={recvTracking} onChange={(e) => setRecvTracking(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecvBatch(null)}>
              取消
            </Button>
            <Button onClick={markReceived} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageCheck className="w-4 h-4" />}
              確認收回
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SupplierBatchPanel;
