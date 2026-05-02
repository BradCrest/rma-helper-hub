import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Save, Send, ShieldCheck, ShieldAlert, Camera } from "lucide-react";
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
  getRefurbPrices,
  formatNT,
  type ActualMethod,
} from "@/lib/refurbishedPricing";
import { evaluateWarranty } from "@/lib/warrantyPolicy";
import WarrantyCalculator from "./WarrantyCalculator";

export type FaultDecision =
  | "internal_repair"
  | "supplier_repair"
  | "warranty_replace"
  | "purchase_a"
  | "purchase_b"
  | "purchase_c"
  | "return_no_repair"
  | "return_no_fault";

export const FAULT_DECISION_LABELS: Record<FaultDecision, string> = {
  internal_repair: "內部維修",
  supplier_repair: "送上游維修",
  warranty_replace: "保固換整新機",
  purchase_a: "購買 A 級整新機",
  purchase_b: "購買 B 級整新機",
  purchase_c: "購買 C 級整新機",
  return_no_repair: "不維修，原機退回",
  return_no_fault: "無故障，原機退回",
};

export const FAULT_DECISION_HINTS: Record<FaultDecision, string> = {
  internal_repair: "內部直接處理，狀態維持檢測中",
  supplier_repair: "送原廠/上游維修，需記錄維修單號",
  warranty_replace: "免費換整新機，進入待客戶確認",
  purchase_a: "客戶付費購買 A 級整新機",
  purchase_b: "客戶付費購買 B 級整新機",
  purchase_c: "客戶付費購買 C 級整新機",
  return_no_repair: "客戶決定不修，寄回原機",
  return_no_fault: "檢測無故障，寄回原機",
};

const DIAGNOSIS_CATEGORIES = [
  "螢幕",
  "電池",
  "進水",
  "外觀損壞",
  "無法開機",
  "感測器異常",
  "充電異常",
  "其他",
];

const WARRANTY_STATUSES = [
  { value: "in_warranty", label: "保固內" },
  { value: "out_of_warranty", label: "過保" },
  { value: "human_damage", label: "人損不保" },
  { value: "undetermined", label: "無法判定" },
];

const REPRODUCIBLE_OPTIONS = [
  { value: "yes", label: "是" },
  { value: "no", label: "否" },
  { value: "unknown", label: "不確定" },
];

interface RmaRequest {
  id: string;
  rma_number: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  product_name: string;
  product_model: string | null;
  serial_number: string | null;
  purchase_date: string | null;
  warranty_date: string | null;
  status: string;
  issue_type: string;
  issue_description: string;
  initial_diagnosis: string | null;
  diagnosis_category: string | null;
  warranty_status: string | null;
  repair_fee: number | null;
  photo_urls: string[] | null;
}

interface RepairDetail {
  id?: string;
  rma_request_id: string;
  planned_method: string | null;
  actual_method: string | null;
  internal_reference: string | null;
  estimated_cost: number | null;
}

interface Props {
  rma: RmaRequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const FaultRegistrationDialog = ({ rma, open, onOpenChange, onSaved }: Props) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [diagnosisCategory, setDiagnosisCategory] = useState("");
  const [reproducible, setReproducible] = useState<"yes" | "no" | "unknown" | "">("");
  const [diagnosisText, setDiagnosisText] = useState("");
  const [warrantyStatus, setWarrantyStatus] = useState("");
  const [decision, setDecision] = useState<FaultDecision | "">("");
  const [feeText, setFeeText] = useState("");
  const [supplierRef, setSupplierRef] = useState("");
  const [internalNotes, setInternalNotes] = useState("");

  const [repairDetail, setRepairDetail] = useState<RepairDetail | null>(null);

  // Parse stored initial_diagnosis into [REPRO][diagnosis][---內部備註---notes]
  const parseStoredDiagnosis = (raw: string | null) => {
    if (!raw) return { repro: "" as "yes" | "no" | "unknown" | "", body: "", notes: "" };
    let rest = raw;
    let repro: "yes" | "no" | "unknown" | "" = "";
    const m = rest.match(/^\[可復現:(是|否|不確定)\]\s*\n?/);
    if (m) {
      repro = m[1] === "是" ? "yes" : m[1] === "否" ? "no" : "unknown";
      rest = rest.slice(m[0].length);
    }
    let notes = "";
    const sep = rest.indexOf("---內部備註---");
    if (sep >= 0) {
      notes = rest.slice(sep + "---內部備註---".length).trim();
      rest = rest.slice(0, sep).trim();
    }
    return { repro, body: rest.trim(), notes };
  };

  // Load detail whenever dialog opens for a new RMA
  useEffect(() => {
    if (!open || !rma) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const { data: rd } = await supabase
          .from("rma_repair_details")
          .select("*")
          .eq("rma_request_id", rma.id)
          .maybeSingle();
        if (cancelled) return;
        setRepairDetail(rd as RepairDetail | null);
        setSupplierRef(rd?.internal_reference || "");
        setFeeText(
          rma.repair_fee != null
            ? String(rma.repair_fee)
            : rd?.estimated_cost != null
              ? String(rd.estimated_cost)
              : ""
        );
        const planned = (rd?.planned_method as FaultDecision | null) || "";
        setDecision(planned || "");
        setDiagnosisCategory(rma.diagnosis_category || "");
        setWarrantyStatus(rma.warranty_status || "");
        const parsed = parseStoredDiagnosis(rma.initial_diagnosis);
        setReproducible(parsed.repro);
        setDiagnosisText(parsed.body);
        setInternalNotes(parsed.notes);

        // Auto-promote received -> inspecting when admin opens for inspection
        if (rma.status === "received") {
          await supabase
            .from("rma_requests")
            .update({ status: "inspecting" })
            .eq("id", rma.id);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rma?.id]);

  const refurbPrices = useMemo(
    () => getRefurbPrices(rma?.product_model || ""),
    [rma?.product_model]
  );

  // Auto-fill fee when decision changes (only if user hasn't typed a custom value yet)
  useEffect(() => {
    if (!decision) return;
    const auto =
      decision === "purchase_a"
        ? refurbPrices.A
        : decision === "purchase_b"
          ? refurbPrices.B
          : decision === "purchase_c"
            ? refurbPrices.C
            : decision === "warranty_replace" ||
                decision === "return_no_repair" ||
                decision === "return_no_fault"
              ? 0
              : null;
    if (auto != null) setFeeText(String(auto));
    // For internal_repair / supplier_repair, leave fee untouched
  }, [decision, refurbPrices]);

  const warrantyEval = useMemo(() => {
    if (!rma) return null;
    return evaluateWarranty({
      serialNumber: rma.serial_number,
      productModel: rma.product_model,
      warrantyDate: rma.warranty_date,
    });
  }, [rma]);

  const composeDiagnosis = () => {
    const parts: string[] = [];
    if (reproducible) {
      const label =
        reproducible === "yes" ? "是" : reproducible === "no" ? "否" : "不確定";
      parts.push(`[可復現:${label}]`);
    }
    if (diagnosisText.trim()) parts.push(diagnosisText.trim());
    let combined = parts.join("\n");
    if (internalNotes.trim()) {
      combined = `${combined}\n---內部備註---\n${internalNotes.trim()}`;
    }
    return combined || null;
  };

  // Map decision -> next status / actual_method
  const decisionToTransition = (
    d: FaultDecision
  ): { nextStatus: string | null; actualMethod: ActualMethod | null } => {
    switch (d) {
      case "internal_repair":
        return { nextStatus: "inspecting", actualMethod: null };
      case "supplier_repair":
        return { nextStatus: "inspecting", actualMethod: null };
      case "warranty_replace":
        return { nextStatus: "contacting", actualMethod: "warranty_replace" };
      case "purchase_a":
        return { nextStatus: "contacting", actualMethod: "purchase_a" };
      case "purchase_b":
        return { nextStatus: "contacting", actualMethod: "purchase_b" };
      case "purchase_c":
        return { nextStatus: "contacting", actualMethod: "purchase_c" };
      case "return_no_repair":
        return { nextStatus: "no_repair", actualMethod: "return_original" };
      case "return_no_fault":
        return { nextStatus: "no_repair", actualMethod: "return_original" };
    }
  };

  const requiredOk =
    !!diagnosisCategory && !!diagnosisText.trim() && !!warrantyStatus && !!decision;

  const submitMissingHint = !requiredOk
    ? "請填寫故障類型、檢測結果、保固判斷與處置決策"
    : "";

  const persist = async (alsoTransition: boolean) => {
    if (!rma) return;
    if (alsoTransition && !requiredOk) {
      toast.error(submitMissingHint);
      return;
    }
    setSaving(true);
    try {
      const feeNumber = feeText.trim() === "" ? null : Number(feeText);
      if (feeText.trim() !== "" && (Number.isNaN(feeNumber) || (feeNumber as number) < 0)) {
        toast.error("報價金額格式錯誤");
        setSaving(false);
        return;
      }

      // 1) Upsert rma_repair_details
      const decisionVal = (decision || null) as FaultDecision | null;
      const transition = decisionVal ? decisionToTransition(decisionVal) : null;

      const repairPayload = {
        rma_request_id: rma.id,
        planned_method: decisionVal,
        actual_method: transition?.actualMethod ?? repairDetail?.actual_method ?? null,
        internal_reference: decisionVal === "supplier_repair" ? supplierRef.trim() || null : null,
        estimated_cost: feeNumber,
      };

      if (repairDetail?.id) {
        const { error: upErr } = await supabase
          .from("rma_repair_details")
          .update(repairPayload)
          .eq("id", repairDetail.id);
        if (upErr) throw upErr;
      } else {
        const { error: insErr } = await supabase
          .from("rma_repair_details")
          .insert(repairPayload);
        if (insErr) throw insErr;
      }

      // 2) Update rma_requests core fields (no status change here — drafts must not move status)
      const requestUpdate: Record<string, unknown> = {
        diagnosis_category: diagnosisCategory || null,
        initial_diagnosis: composeDiagnosis(),
        warranty_status: warrantyStatus || null,
        repair_fee: feeNumber,
      };
      const { error: rqErr } = await supabase
        .from("rma_requests")
        .update(requestUpdate)
        .eq("id", rma.id);
      if (rqErr) throw rqErr;

      // 3) Optional status transition via edge function (so rma_status_history logs the actor)
      if (alsoTransition && transition?.nextStatus && transition.nextStatus !== rma.status) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          toast.error("請重新登入");
          setSaving(false);
          return;
        }
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-rma-status`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              rma_id: rma.id,
              new_status: transition.nextStatus,
              notes: `故障登記送出：${FAULT_DECISION_LABELS[decisionVal!]}`,
            }),
          }
        );
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`狀態更新失敗：${txt.slice(0, 200)}`);
        }
      }

      toast.success(alsoTransition ? "處置決策已送出" : "草稿已儲存");
      onSaved();
      if (alsoTransition) onOpenChange(false);
    } catch (e) {
      console.error("FaultRegistrationDialog persist error:", e);
      toast.error(e instanceof Error ? e.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  if (!rma) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            故障登記與處置決策
            <Badge variant="outline" className="font-mono">
              {rma.rma_number}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            完成檢測判斷後送出處置決策，系統會自動更新狀態並進入下一個分頁
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* === 上半部：唯讀資訊 === */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/40 rounded-lg">
              <div>
                <div className="text-xs text-muted-foreground">客戶</div>
                <div className="font-medium">{rma.customer_name}</div>
                <div className="text-sm text-muted-foreground">{rma.customer_email}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">產品 / 序號</div>
                <div className="font-medium">
                  {rma.product_name}
                  {rma.product_model ? ` (${rma.product_model})` : ""}
                </div>
                <div className="text-sm font-mono text-muted-foreground">
                  {rma.serial_number || "—"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">購買日 / 保固到期</div>
                <div className="text-sm">
                  {rma.purchase_date
                    ? format(new Date(rma.purchase_date), "yyyy-MM-dd")
                    : "—"}
                  {" → "}
                  {rma.warranty_date
                    ? format(new Date(rma.warranty_date), "yyyy-MM-dd")
                    : "—"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">系統保固判斷</div>
                {warrantyEval?.withinWarranty ? (
                  <Badge className="gap-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                    <ShieldCheck className="w-3 h-3" /> 保固內
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1">
                    <ShieldAlert className="w-3 h-3" /> 過保 / 未認列
                  </Badge>
                )}
              </div>
            </section>

            <section className="space-y-2">
              <div className="text-sm font-medium">客戶原始描述</div>
              <div className="p-3 rounded-md bg-background border text-sm">
                <div className="text-muted-foreground">
                  問題類型：{rma.issue_type || "—"}
                </div>
                <div className="mt-1 whitespace-pre-wrap">
                  {rma.issue_description || "（無描述）"}
                </div>
              </div>
              {rma.photo_urls && rma.photo_urls.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {rma.photo_urls.map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="block aspect-square rounded-md overflow-hidden border hover:opacity-80"
                    >
                      <img
                        src={url}
                        alt="customer"
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </a>
                  ))}
                </div>
              )}
              {(!rma.photo_urls || rma.photo_urls.length === 0) && (
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Camera className="w-3 h-3" /> 客戶未上傳照片
                </div>
              )}
            </section>

            {/* Warranty calculator (serial-based) */}
            <WarrantyCalculator
              defaultSerial={rma.serial_number || ""}
              defaultModel={rma.product_model || ""}
            />

            {/* === 下半部：表單欄位 === */}
            <section className="space-y-4 border-t pt-4">
              <h3 className="text-sm font-semibold">檢測登記</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="mb-1 block">
                    故障類型 <span className="text-destructive">*</span>
                  </Label>
                  <Select value={diagnosisCategory} onValueChange={setDiagnosisCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="請選擇" />
                    </SelectTrigger>
                    <SelectContent>
                      {DIAGNOSIS_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="mb-1 block">
                    保固判斷 <span className="text-destructive">*</span>
                  </Label>
                  <Select value={warrantyStatus} onValueChange={setWarrantyStatus}>
                    <SelectTrigger>
                      <SelectValue placeholder="請選擇" />
                    </SelectTrigger>
                    <SelectContent>
                      {WARRANTY_STATUSES.map((w) => (
                        <SelectItem key={w.value} value={w.value}>
                          {w.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="mb-1 block">
                  檢測結果 <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  value={diagnosisText}
                  onChange={(e) => setDiagnosisText(e.target.value)}
                  placeholder="描述檢測過程、發現問題、可能原因..."
                  rows={4}
                />
              </div>

              <div>
                <Label className="mb-2 block">是否可復現</Label>
                <RadioGroup
                  value={reproducible}
                  onValueChange={(v) =>
                    setReproducible(v as "yes" | "no" | "unknown")
                  }
                  className="flex gap-6"
                >
                  {REPRODUCIBLE_OPTIONS.map((o) => (
                    <div key={o.value} className="flex items-center gap-2">
                      <RadioGroupItem value={o.value} id={`repro-${o.value}`} />
                      <Label
                        htmlFor={`repro-${o.value}`}
                        className="cursor-pointer font-normal"
                      >
                        {o.label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            </section>

            {/* === 處置決策 === */}
            <section className="space-y-4 border-t pt-4">
              <div>
                <h3 className="text-sm font-semibold">
                  處置決策 <span className="text-destructive">*</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  送出後系統會依此自動更新 RMA 狀態並進入對應分頁
                </p>
              </div>

              <RadioGroup
                value={decision}
                onValueChange={(v) => setDecision(v as FaultDecision)}
                className="grid grid-cols-1 md:grid-cols-2 gap-2"
              >
                {(Object.keys(FAULT_DECISION_LABELS) as FaultDecision[]).map((d) => (
                  <label
                    key={d}
                    htmlFor={`decision-${d}`}
                    className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                      decision === d
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <RadioGroupItem value={d} id={`decision-${d}`} className="mt-0.5" />
                    <div className="flex-1">
                      <div className="font-medium text-sm">
                        {FAULT_DECISION_LABELS[d]}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {FAULT_DECISION_HINTS[d]}
                      </div>
                    </div>
                  </label>
                ))}
              </RadioGroup>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="mb-1 block">報價金額 (NT$)</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={feeText}
                    onChange={(e) => setFeeText(e.target.value)}
                    placeholder="0"
                  />
                  {decision?.startsWith("purchase_") && (
                    <div className="text-xs text-muted-foreground mt-1">
                      建議 A/B/C 售價：{formatNT(refurbPrices.A)} /{" "}
                      {formatNT(refurbPrices.B)} / {formatNT(refurbPrices.C)}
                    </div>
                  )}
                </div>

                {decision === "supplier_repair" && (
                  <div>
                    <Label className="mb-1 block">上游維修單號</Label>
                    <Input
                      value={supplierRef}
                      onChange={(e) => setSupplierRef(e.target.value)}
                      placeholder="例如：SR-2025-0001"
                    />
                  </div>
                )}
              </div>

              <div>
                <Label className="mb-1 block">內部備註（不會寄給客戶）</Label>
                <Textarea
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  placeholder="僅內部可見的工程備註、料件需求、後續追蹤..."
                  rows={3}
                />
              </div>
            </section>

            {/* === Footer === */}
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                取消
              </Button>
              <Button
                variant="secondary"
                onClick={() => persist(false)}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                儲存草稿
              </Button>
              <Button
                onClick={() => persist(true)}
                disabled={saving || !requiredOk}
                title={submitMissingHint || undefined}
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                送出處置決策
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default FaultRegistrationDialog;
