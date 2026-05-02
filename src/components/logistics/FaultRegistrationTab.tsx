import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ClipboardCheck,
  Search,
  Eye,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { zhTW } from "date-fns/locale";
import { evaluateWarranty } from "@/lib/warrantyPolicy";
import FaultRegistrationDialog, {
  FAULT_DECISION_LABELS,
  type FaultDecision,
} from "./FaultRegistrationDialog";

interface RmaRow {
  id: string;
  rma_number: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  product_name: string;
  product_model: string | null;
  serial_number: string | null;
  status: string;
  warranty_date: string | null;
  warranty_status: string | null;
  diagnosis_category: string | null;
  initial_diagnosis: string | null;
  repair_fee: number | null;
  purchase_date: string | null;
  issue_type: string;
  issue_description: string;
  photo_urls: string[] | null;
  received_date: string | null;
  updated_at: string;
  // Joined from rma_repair_details
  planned_method?: string | null;
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  received: { label: "已收件", className: "bg-slate-100 text-slate-700 hover:bg-slate-100" },
  inspecting: { label: "檢測中", className: "bg-blue-100 text-blue-700 hover:bg-blue-100" },
};

const FaultRegistrationTab = () => {
  const [rows, setRows] = useState<RmaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [onlyPending, setOnlyPending] = useState(false);

  const [selected, setSelected] = useState<RmaRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchList = async () => {
    setLoading(true);
    try {
      const { data: rmaData, error } = await supabase
        .from("rma_requests")
        .select(
          `id, rma_number, customer_name, customer_email, customer_phone,
           product_name, product_model, serial_number, status, warranty_date,
           warranty_status, diagnosis_category, initial_diagnosis, repair_fee,
           purchase_date, issue_type, issue_description, photo_urls,
           received_date, updated_at`
        )
        .in("status", ["received", "inspecting"])
        .order("received_date", { ascending: false, nullsFirst: false })
        .order("updated_at", { ascending: false });
      if (error) throw error;

      const rmas = (rmaData || []) as RmaRow[];
      const ids = rmas.map((r) => r.id);
      let plannedMap = new Map<string, string | null>();
      if (ids.length > 0) {
        const { data: details } = await supabase
          .from("rma_repair_details")
          .select("rma_request_id, planned_method")
          .in("rma_request_id", ids);
        for (const d of details || []) {
          plannedMap.set(d.rma_request_id, d.planned_method);
        }
      }
      setRows(
        rmas.map((r) => ({ ...r, planned_method: plannedMap.get(r.id) ?? null }))
      );
    } catch (e) {
      console.error("fetch fault list error:", e);
      toast.error("載入故障登記列表失敗");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyPending && r.planned_method) return false;
      if (!q) return true;
      return (
        r.rma_number.toLowerCase().includes(q) ||
        r.customer_name.toLowerCase().includes(q) ||
        (r.serial_number || "").toLowerCase().includes(q) ||
        (r.product_model || "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, onlyPending]);

  const renderWarrantyBadge = (r: RmaRow) => {
    // Manual warranty_status takes priority for display
    if (r.warranty_status === "in_warranty") {
      return (
        <Badge className="gap-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
          <ShieldCheck className="w-3 h-3" /> 保固內
        </Badge>
      );
    }
    if (r.warranty_status === "out_of_warranty") {
      return (
        <Badge className="gap-1 bg-orange-100 text-orange-700 hover:bg-orange-100">
          <ShieldAlert className="w-3 h-3" /> 過保
        </Badge>
      );
    }
    if (r.warranty_status === "human_damage") {
      return (
        <Badge variant="destructive" className="gap-1">
          <ShieldAlert className="w-3 h-3" /> 人損不保
        </Badge>
      );
    }
    if (r.warranty_status === "undetermined") {
      return <Badge variant="outline">未判定</Badge>;
    }
    // fallback to evaluateWarranty
    const ev = evaluateWarranty({
      serialNumber: r.serial_number,
      productModel: r.product_model,
      warrantyDate: r.warranty_date,
    });
    return ev?.withinWarranty ? (
      <Badge className="gap-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        <ShieldCheck className="w-3 h-3" /> 保固內
      </Badge>
    ) : (
      <Badge variant="secondary" className="gap-1">
        <ShieldAlert className="w-3 h-3" /> 過保
      </Badge>
    );
  };

  const renderDecisionBadge = (r: RmaRow) => {
    if (!r.planned_method) {
      return (
        <Badge variant="outline" className="text-muted-foreground">
          待決策
        </Badge>
      );
    }
    const label =
      FAULT_DECISION_LABELS[r.planned_method as FaultDecision] || r.planned_method;
    return (
      <Badge className="gap-1 bg-primary/10 text-primary hover:bg-primary/10">
        <CheckCircle2 className="w-3 h-3" />
        {label}
      </Badge>
    );
  };

  const renderStatusBadge = (status: string) => {
    const def = STATUS_LABEL[status];
    return def ? (
      <Badge className={def.className}>{def.label}</Badge>
    ) : (
      <Badge variant="outline">{status}</Badge>
    );
  };

  const handleOpen = (r: RmaRow) => {
    setSelected(r);
    setDialogOpen(true);
  };

  const pendingCount = rows.filter((r) => !r.planned_method).length;

  return (
    <div className="space-y-4">
      <div className="rma-card p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <ClipboardCheck className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">故障登記與處置決策</h2>
              <p className="text-sm text-muted-foreground">
                收件後的檢測決策中心。共 {rows.length} 筆，
                <span className="text-primary font-medium"> {pendingCount} 筆待決策</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Switch
                id="only-pending"
                checked={onlyPending}
                onCheckedChange={setOnlyPending}
              />
              <Label
                htmlFor="only-pending"
                className="text-sm font-normal cursor-pointer"
              >
                只顯示未決策
              </Label>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="RMA 編號 / 客戶 / 序號 / 型號"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 w-72"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="rma-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> 載入中...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <ClipboardCheck className="w-10 h-10 mx-auto mb-2 opacity-40" />
            目前沒有需要登記的 RMA
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>RMA 編號</TableHead>
                <TableHead>客戶</TableHead>
                <TableHead>產品 / 序號</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead>故障類型</TableHead>
                <TableHead>保固判斷</TableHead>
                <TableHead>處置決策</TableHead>
                <TableHead>更新時間</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id} className="hover:bg-muted/50">
                  <TableCell className="font-mono font-medium">{r.rma_number}</TableCell>
                  <TableCell>
                    <div className="font-medium">{r.customer_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.customer_phone || r.customer_email || "—"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {r.product_model || r.product_name}
                    </div>
                    <div className="text-xs font-mono text-muted-foreground">
                      {r.serial_number || "—"}
                    </div>
                  </TableCell>
                  <TableCell>{renderStatusBadge(r.status)}</TableCell>
                  <TableCell>
                    {r.diagnosis_category ? (
                      <Badge variant="outline">{r.diagnosis_category}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell>{renderWarrantyBadge(r)}</TableCell>
                  <TableCell>{renderDecisionBadge(r)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(r.updated_at), {
                      addSuffix: true,
                      locale: zhTW,
                    })}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpen(r)}
                    >
                      <Eye className="w-4 h-4" />
                      檢視 / 登記
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <FaultRegistrationDialog
        rma={selected}
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setSelected(null);
        }}
        onSaved={() => {
          fetchList();
        }}
      />
    </div>
  );
};

export default FaultRegistrationTab;
