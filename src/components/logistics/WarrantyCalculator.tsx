import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calculator, AlertTriangle, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import {
  evaluateWarranty,
  type ProductionBatch,
  POLICY_ANNOUNCEMENT_URL,
  BATCH_LABELS,
  type WarrantyDecision,
} from "@/lib/warrantyPolicy";

interface Props {
  serialNumber: string | null | undefined;
  productModel: string | null | undefined;
  warrantyDate: string | null | undefined;
  /** 通知 parent admin 修改了批次或要套用哪個 expiry */
  onApply?: (decision: WarrantyDecision) => void;
}

const BATCH_OPTIONS: { value: ProductionBatch; label: string }[] = [
  { value: "legacy_2018_2022", label: BATCH_LABELS.legacy_2018_2022 },
  { value: "v2_2022_2025", label: BATCH_LABELS.v2_2022_2025 },
  { value: "v3_2025_onwards", label: BATCH_LABELS.v3_2025_onwards },
];

const WarrantyCalculator = ({
  serialNumber,
  productModel,
  warrantyDate,
  onApply,
}: Props) => {
  const [batchOverride, setBatchOverride] = useState<ProductionBatch | null>(
    null
  );

  const decision = useMemo(
    () =>
      evaluateWarranty({
        serialNumber,
        productModel,
        warrantyDate,
        manualBatchOverride: batchOverride,
      }),
    [serialNumber, productModel, warrantyDate, batchOverride]
  );

  const sourceLabel: Record<WarrantyDecision["source"], string> = {
    serial: "從序號自動解析",
    manual_batch: "管理員指定批次",
    warranty_date_field: "保固日期欄位",
    none: "無資料",
  };

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Calculator className="h-4 w-4 text-primary" />
        保固判定
        <Badge variant="outline" className="ml-auto text-xs">
          {sourceLabel[decision.source]}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">批次</div>
          <Badge
            variant={
              decision.isLegacyBatch
                ? "destructive"
                : decision.batch === "unknown"
                ? "outline"
                : "secondary"
            }
          >
            {BATCH_LABELS[decision.batch]}
          </Badge>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">保固期限</div>
          <div className="font-medium">
            {decision.warrantyYears
              ? `${decision.warrantyYears} 年`
              : decision.isLegacyBatch
              ? "無（已過保）"
              : "—"}
          </div>
        </div>
        {decision.productionDate && (
          <div>
            <div className="text-xs text-muted-foreground">推估生產日</div>
            <div className="font-medium">
              {format(decision.productionDate, "yyyy/MM/dd")}
              {decision.parsed && (
                <span className="text-xs text-muted-foreground ml-1">
                  （第 {decision.parsed.week} 週）
                </span>
              )}
            </div>
          </div>
        )}
        {decision.expiry && (
          <div>
            <div className="text-xs text-muted-foreground">推估到期日</div>
            <div className="font-medium">
              {format(decision.expiry, "yyyy/MM/dd")}
            </div>
          </div>
        )}
      </div>

      {decision.isLegacyBatch && (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>{decision.policyNote}</div>
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-xs">手動指定批次（覆寫）</Label>
        <Select
          value={batchOverride ?? "auto"}
          onValueChange={(v) =>
            setBatchOverride(v === "auto" ? null : (v as ProductionBatch))
          }
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">自動判斷</SelectItem>
            {BATCH_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between gap-2">
        <a
          href={POLICY_ANNOUNCEMENT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
        >
          <ExternalLink className="h-3 w-3" /> 查看官方政策
        </a>
        {onApply && decision.expiry && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onApply(decision)}
          >
            套用到此 RMA
          </Button>
        )}
      </div>
    </div>
  );
};

export default WarrantyCalculator;
