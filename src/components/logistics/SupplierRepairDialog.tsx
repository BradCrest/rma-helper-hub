import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Send, Save, Package, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  SUPPLIER_LABELS,
  SUPPLIER_BADGE_CLASSES,
  SUPPLIER_STATUS_LABELS,
  SUPPLIER_STATUS_BADGE,
  type SupplierKey,
} from "@/lib/supplierMapping";

export interface SupplierRepairRow {
  id: string;
  rma_request_id: string;
  supplier_name: string | null;
  supplier_status: string | null;
  repair_requirement: string | null;
  repair_count: number | null;
  factory_repair_cost_estimated: number | null;
  factory_repair_cost: number | null;
  invoice_reference: string | null;
  factory_analysis: string | null;
  factory_repair_method: string | null;
  supplier_warranty_date: string | null;
  production_batch: string | null;
  inspection_result: string | null;
  post_repair_action: string | null;
  sent_to_factory_date: string | null;
  sent_carrier: string | null;
  sent_tracking_number: string | null;
  factory_return_date: string | null;
  batch_id: string | null;
  created_at: string;
  rma?: {
    id: string;
    rma_number: string;
    customer_name: string;
    product_name: string;
    product_model: string | null;
    serial_number: string | null;
    status: string;
  };
}

interface Props {
  repair: SupplierRepairRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const SupplierRepairDialog = ({ repair, open, onOpenChange, onSaved }: Props) => {
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<SupplierRepairRow[]>([]);

  // Stage 1 (pending_send)
  const [supplierName, setSupplierName] = useState("");
  const [requirement, setRequirement] = useState("");
  const [estCost, setEstCost] = useState("");
  const [sentDate, setSentDate] = useState("");
  const [carrier, setCarrier] = useState("");
  const [trackingOut, setTrackingOut] = useState("");

  // Stage 2 (at_factory)
  const [factoryAnalysis, setFactoryAnalysis] = useState("");
  const [factoryMethod, setFactoryMethod] = useState("");
  const [actualCost, setActualCost] = useState("");
  const [invoice, setInvoice] = useState("");
  const [warrantyDate, setWarrantyDate] = useState("");
  const [batch, setBatch] = useState("");

  // Stage 3 (repaired -> verify)
  const [inspection, setInspection] = useState("");
  const [postAction, setPostAction] = useState<"add_to_refurb_stock" | "return_to_customer" | "scrap" | "">("");
  const [refurbGrade, setRefurbGrade] = useState<"A" | "B" | "C" | "">("");
  const [refurbSerial, setRefurbSerial] = useState("");
  const [scrapReason, setScrapReason] = useState("");

  useEffect(() => {
    if (!open || !repair) return;
    setSupplierName(repair.supplier_name || "");
    setRequirement(repair.repair_requirement || "");
    setEstCost(repair.factory_repair_cost_estimated?.toString() || "");
    setSentDate(repair.sent_to_factory_date || "");
    setCarrier(repair.sent_carrier || "");
    setTrackingOut(repair.sent_tracking_number || "");
    setFactoryAnalysis(repair.factory_analysis || "");
    setFactoryMethod(repair.factory_repair_method || "");
    setActualCost(repair.factory_repair_cost?.toString() || "");
    setInvoice(repair.invoice_reference || "");
    setWarrantyDate(repair.supplier_warranty_date || "");
    setBatch(repair.production_batch || "");
    setInspection(repair.inspection_result || "");
    setPostAction("");
    setRefurbGrade("");
    setRefurbSerial(repair.rma?.serial_number || "");
    setScrapReason("");

    // Load history (other repair_count entries for same RMA)
    if (repair.rma_request_id) {
      supabase
        .from("rma_supplier_repairs")
        .select("*")
        .eq("rma_request_id", repair.rma_request_id)
        .neq("id", repair.id)
        .order("repair_count", { ascending: true })
        .then(({ data }) => setHistory((data || []) as SupplierRepairRow[]));
    }
  }, [open, repair]);

  if (!repair) return null;

  const status = repair.supplier_status || "pending_send";

  // ── Stage 1: save ship-out
  const saveShipOut = async (markSent: boolean) => {
    setSaving(true);
    try {
      const updates: Record<string, unknown> = {
        supplier_name: supplierName || null,
        repair_requirement: requirement || null,
        factory_repair_cost_estimated: estCost ? Number(estCost) : null,
        sent_to_factory_date: sentDate || null,
        sent_carrier: carrier || null,
        sent_tracking_number: trackingOut || null,
      };
      if (markSent) {
        if (!supplierName) {
          toast.error("請選擇供應商");
          setSaving(false);
          return;
        }
        if (!sentDate) {
          toast.error("請填寫送出日期");
          setSaving(false);
          return;
        }
        updates.supplier_status = "at_factory";
      }
      const { error } = await supabase
        .from("rma_supplier_repairs")
        .update(updates)
        .eq("id", repair.id);
      if (error) throw error;
      toast.success(markSent ? "已標記為工廠維修中" : "已儲存");
      onSaved();
      if (markSent) onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  // ── Stage 2: save factory work
  const saveFactoryWork = async (markRepaired: boolean) => {
    setSaving(true);
    try {
      const updates: Record<string, unknown> = {
        factory_analysis: factoryAnalysis || null,
        factory_repair_method: factoryMethod || null,
        factory_repair_cost: actualCost ? Number(actualCost) : null,
        invoice_reference: invoice || null,
        supplier_warranty_date: warrantyDate || null,
        production_batch: batch || null,
      };
      if (markRepaired) updates.supplier_status = "repaired";
      const { error } = await supabase
        .from("rma_supplier_repairs")
        .update(updates)
        .eq("id", repair.id);
      if (error) throw error;
      toast.success(markRepaired ? "已標記為工廠完工" : "已儲存");
      onSaved();
      if (markRepaired) onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  // ── Stage 3: verify & dispose
  const finishVerification = async () => {
    if (!postAction) {
      toast.error("請選擇後續處置");
      return;
    }
    if (postAction === "add_to_refurb_stock" && !refurbGrade) {
      toast.error("請選擇整新品等級");
      return;
    }
    if (postAction === "scrap" && !scrapReason.trim()) {
      toast.error("請填寫報廢原因");
      return;
    }
    setSaving(true);
    try {
      const nextStatus =
        postAction === "scrap" ? "scrapped" : "returned";
      const { error: updErr } = await supabase
        .from("rma_supplier_repairs")
        .update({
          inspection_result: inspection || null,
          post_repair_action: postAction,
          factory_return_date:
            repair.factory_return_date || new Date().toISOString().slice(0, 10),
          supplier_status: nextStatus,
        })
        .eq("id", repair.id);
      if (updErr) throw updErr;

      if (postAction === "add_to_refurb_stock") {
        const cost =
          repair.factory_repair_cost ?? (actualCost ? Number(actualCost) : null);
        const { error: invErr } = await supabase
          .from("refurbished_inventory")
          .insert({
            product_model: repair.rma?.product_model || "—",
            serial_number: refurbSerial || null,
            grade: refurbGrade,
            source_rma_id: repair.rma_request_id,
            source_supplier_repair_id: repair.id,
            cost,
            status: "in_stock",
            notes: inspection || null,
          });
        if (invErr) throw invErr;
        toast.success("已驗收完成並加入整新品庫存");
      } else if (postAction === "return_to_customer") {
        // restore RMA to inspecting so admin can route via fault dialog again
        await supabase
          .from("rma_requests")
          .update({ status: "inspecting" })
          .eq("id", repair.rma_request_id);
        toast.success("已驗收，RMA 回到檢測中等待處置");
      } else {
        toast.success("已標記報廢");
      }

      onSaved();
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "操作失敗");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            供應商維修工單
            {repair.rma && (
              <Badge variant="outline" className="font-mono">
                {repair.rma.rma_number}
              </Badge>
            )}
            <Badge className={SUPPLIER_STATUS_BADGE[status] || ""}>
              {SUPPLIER_STATUS_LABELS[status] || status}
            </Badge>
            {repair.repair_count && repair.repair_count > 1 && (
              <Badge variant="secondary">第 {repair.repair_count} 次送修</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            管理寄出、工廠維修、回廠驗收三個階段
          </DialogDescription>
        </DialogHeader>

        {/* RMA 摘要 */}
        {repair.rma && (
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/40 rounded-lg text-sm">
            <div>
              <div className="text-xs text-muted-foreground">客戶</div>
              <div className="font-medium">{repair.rma.customer_name}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">產品 / 序號</div>
              <div className="font-medium">
                {repair.rma.product_name}
                {repair.rma.product_model ? ` (${repair.rma.product_model})` : ""}
              </div>
              <div className="text-xs font-mono text-muted-foreground">
                {repair.rma.serial_number || "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">RMA 狀態</div>
              <Badge variant="outline">{repair.rma.status}</Badge>
            </div>
          </section>
        )}

        {/* === 階段 1：寄出 === */}
        <section className="space-y-4 border-t pt-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">階段 1：寄出</h3>
            {status !== "pending_send" && (
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="w-3 h-3" /> 已完成
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="mb-1 block">供應商 *</Label>
              <Select value={supplierName} onValueChange={setSupplierName}>
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
              {supplierName && SUPPLIER_LABELS[supplierName as SupplierKey] && (
                <Badge
                  className={`mt-2 ${SUPPLIER_BADGE_CLASSES[supplierName as SupplierKey] || ""}`}
                >
                  {SUPPLIER_LABELS[supplierName as SupplierKey]}
                </Badge>
              )}
            </div>
            <div>
              <Label className="mb-1 block">預估維修費 (NT$)</Label>
              <Input
                type="number"
                inputMode="numeric"
                value={estCost}
                onChange={(e) => setEstCost(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          <div>
            <Label className="mb-1 block">維修需求</Label>
            <Textarea
              rows={3}
              value={requirement}
              onChange={(e) => setRequirement(e.target.value)}
              placeholder="工廠需執行的維修內容"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="mb-1 block">送出日期</Label>
              <Input type="date" value={sentDate} onChange={(e) => setSentDate(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block">快遞</Label>
              <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="黑貓 / 順豐..." />
            </div>
            <div>
              <Label className="mb-1 block">追蹤號</Label>
              <Input value={trackingOut} onChange={(e) => setTrackingOut(e.target.value)} />
            </div>
          </div>

          {status === "pending_send" && (
            <div className="flex justify-end gap-2">
              <Button variant="secondary" disabled={saving} onClick={() => saveShipOut(false)}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                儲存草稿
              </Button>
              <Button disabled={saving} onClick={() => saveShipOut(true)}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                標記已寄出
              </Button>
            </div>
          )}
        </section>

        {/* === 階段 2：工廠維修中 === */}
        {(status === "at_factory" || status === "repaired" || status === "returned" || status === "scrapped") && (
          <section className="space-y-4 border-t pt-4">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">階段 2：工廠維修</h3>
              {(status === "repaired" || status === "returned" || status === "scrapped") && (
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2 className="w-3 h-3" /> 已完成
                </Badge>
              )}
            </div>

            <div>
              <Label className="mb-1 block">工廠分析</Label>
              <Textarea rows={3} value={factoryAnalysis} onChange={(e) => setFactoryAnalysis(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block">維修方式</Label>
              <Textarea rows={3} value={factoryMethod} onChange={(e) => setFactoryMethod(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="mb-1 block">實際維修費 (NT$)</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={actualCost}
                  onChange={(e) => setActualCost(e.target.value)}
                />
              </div>
              <div>
                <Label className="mb-1 block">發票單號</Label>
                <Input value={invoice} onChange={(e) => setInvoice(e.target.value)} />
              </div>
              <div>
                <Label className="mb-1 block">工廠保固到期</Label>
                <Input type="date" value={warrantyDate} onChange={(e) => setWarrantyDate(e.target.value)} />
              </div>
              <div>
                <Label className="mb-1 block">生產批次</Label>
                <Input value={batch} onChange={(e) => setBatch(e.target.value)} />
              </div>
            </div>

            {status === "at_factory" && (
              <div className="flex justify-end gap-2">
                <Button variant="secondary" disabled={saving} onClick={() => saveFactoryWork(false)}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  儲存
                </Button>
                <Button disabled={saving} onClick={() => saveFactoryWork(true)}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  工廠完成維修
                </Button>
              </div>
            )}
          </section>
        )}

        {/* === 階段 3：回廠驗收 === */}
        {status === "repaired" && (
          <section className="space-y-4 border-t pt-4">
            <h3 className="text-sm font-semibold">階段 3：回廠驗收</h3>

            <div>
              <Label className="mb-1 block">檢驗結果</Label>
              <Textarea
                rows={3}
                value={inspection}
                onChange={(e) => setInspection(e.target.value)}
                placeholder="收回後的我方驗證結果"
              />
            </div>

            <div>
              <Label className="mb-2 block">後續處置 *</Label>
              <RadioGroup
                value={postAction}
                onValueChange={(v) => setPostAction(v as typeof postAction)}
                className="space-y-2"
              >
                {[
                  { v: "add_to_refurb_stock", label: "加入整新品庫存", icon: Package },
                  { v: "return_to_customer", label: "退回客戶（回到檢測中）", icon: CheckCircle2 },
                  { v: "scrap", label: "報廢", icon: XCircle },
                ].map((o) => (
                  <label
                    key={o.v}
                    htmlFor={`post-${o.v}`}
                    className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                      postAction === o.v ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <RadioGroupItem value={o.v} id={`post-${o.v}`} className="mt-0.5" />
                    <div className="flex items-center gap-2 text-sm">
                      <o.icon className="w-4 h-4" />
                      {o.label}
                    </div>
                  </label>
                ))}
              </RadioGroup>
            </div>

            {postAction === "add_to_refurb_stock" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-muted/40 rounded-lg">
                <div>
                  <Label className="mb-1 block">等級 *</Label>
                  <Select value={refurbGrade} onValueChange={(v) => setRefurbGrade(v as "A" | "B" | "C")}>
                    <SelectTrigger>
                      <SelectValue placeholder="請選擇" />
                    </SelectTrigger>
                    <SelectContent>
                      {(["A", "B", "C"] as const).map((g) => (
                        <SelectItem key={g} value={g}>
                          {g} 級
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-1 block">入庫序號</Label>
                  <Input
                    value={refurbSerial}
                    onChange={(e) => setRefurbSerial(e.target.value)}
                    placeholder="工廠回廠後的序號"
                  />
                </div>
              </div>
            )}

            {postAction === "scrap" && (
              <div>
                <Label className="mb-1 block">報廢原因 *</Label>
                <Textarea rows={2} value={scrapReason} onChange={(e) => setScrapReason(e.target.value)} />
              </div>
            )}

            <div className="flex justify-end">
              <Button disabled={saving || !postAction} onClick={finishVerification}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                完成驗收
              </Button>
            </div>
          </section>
        )}

        {/* === 歷史送修 === */}
        {history.length > 0 && (
          <section className="space-y-2 border-t pt-4">
            <h3 className="text-sm font-semibold">送修歷史</h3>
            <div className="space-y-2">
              {history.map((h) => (
                <div
                  key={h.id}
                  className="flex items-center justify-between p-2 text-xs rounded bg-muted/40"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">第 {h.repair_count} 次</Badge>
                    <span>
                      {h.sent_to_factory_date
                        ? format(new Date(h.sent_to_factory_date), "yyyy-MM-dd")
                        : "（未寄）"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {h.factory_repair_cost != null && (
                      <span>NT$ {Number(h.factory_repair_cost).toLocaleString()}</span>
                    )}
                    <Badge className={SUPPLIER_STATUS_BADGE[h.supplier_status || ""] || ""}>
                      {SUPPLIER_STATUS_LABELS[h.supplier_status || ""] || h.supplier_status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default SupplierRepairDialog;
