import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format, differenceInDays } from "date-fns";
import {
  SUPPLIER_LABELS,
  SUPPLIER_BADGE_CLASSES,
  SUPPLIER_STATUS_LABELS,
  SUPPLIER_STATUS_BADGE,
  type SupplierKey,
} from "@/lib/supplierMapping";
import SupplierBatchPanel from "./SupplierBatchPanel";
import RefurbishedInventoryPanel from "./RefurbishedInventoryPanel";
import SupplierRepairDialog, {
  type SupplierRepairRow,
} from "./SupplierRepairDialog";

const SupplierRepairTab = () => {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SupplierRepairRow[]>([]);
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [active, setActive] = useState<SupplierRepairRow | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("rma_supplier_repairs")
      .select(
        "*, rma:rma_requests(id, rma_number, customer_name, product_name, product_model, serial_number, status)"
      )
      .order("created_at", { ascending: false });
    setRows((data || []) as unknown as SupplierRepairRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (supplierFilter !== "all" && r.supplier_name !== supplierFilter) return false;
      if (statusFilter !== "all" && r.supplier_status !== statusFilter) return false;
      if (overdueOnly) {
        if (!r.sent_to_factory_date || (r.supplier_status !== "at_factory" && r.supplier_status !== "repaired"))
          return false;
        const days = differenceInDays(new Date(), new Date(r.sent_to_factory_date));
        if (days <= 30) return false;
      }
      if (q) {
        const hay = `${r.rma?.rma_number || ""} ${r.rma?.customer_name || ""} ${r.rma?.serial_number || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, supplierFilter, statusFilter, overdueOnly]);

  return (
    <Tabs defaultValue="repairs" className="w-full">
      <TabsList>
        <TabsTrigger value="repairs">送修追蹤</TabsTrigger>
        <TabsTrigger value="inventory">整新品庫存</TabsTrigger>
      </TabsList>

      <TabsContent value="repairs" className="space-y-4 mt-4">
        <SupplierBatchPanel onChanged={load} />

        <div className="rma-card space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="RMA / 客戶 / 序號"
                className="pl-9"
              />
            </div>
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部供應商</SelectItem>
                {(Object.keys(SUPPLIER_LABELS) as SupplierKey[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {SUPPLIER_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部狀態</SelectItem>
                {Object.entries(SUPPLIER_STATUS_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant={overdueOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setOverdueOnly(!overdueOnly)}
            >
              逾期未回（&gt;30天）
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">沒有符合的工單</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>RMA</TableHead>
                  <TableHead>客戶</TableHead>
                  <TableHead>型號 / 序號</TableHead>
                  <TableHead>供應商</TableHead>
                  <TableHead>狀態</TableHead>
                  <TableHead>送出日 / 在外</TableHead>
                  <TableHead>預估 / 實際</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const sk = r.supplier_name as SupplierKey;
                  const sentDays =
                    r.sent_to_factory_date &&
                    (r.supplier_status === "at_factory" || r.supplier_status === "repaired")
                      ? differenceInDays(new Date(), new Date(r.sent_to_factory_date))
                      : null;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.rma?.rma_number || "—"}</TableCell>
                      <TableCell className="text-sm">{r.rma?.customer_name || "—"}</TableCell>
                      <TableCell className="text-sm">
                        <div>{r.rma?.product_model || "—"}</div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {r.rma?.serial_number || "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        {r.supplier_name ? (
                          <Badge className={SUPPLIER_BADGE_CLASSES[sk] || ""}>
                            {SUPPLIER_LABELS[sk] || r.supplier_name}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">未指定</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={SUPPLIER_STATUS_BADGE[r.supplier_status || ""] || ""}>
                          {SUPPLIER_STATUS_LABELS[r.supplier_status || ""] || r.supplier_status || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.sent_to_factory_date
                          ? format(new Date(r.sent_to_factory_date), "yyyy-MM-dd")
                          : "—"}
                        {sentDays != null && (
                          <div className={sentDays > 30 ? "text-red-600 font-semibold" : "text-muted-foreground"}>
                            {sentDays} 天
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.factory_repair_cost_estimated != null
                          ? `預 NT$ ${Number(r.factory_repair_cost_estimated).toLocaleString()}`
                          : "—"}
                        <div>
                          {r.factory_repair_cost != null
                            ? `實 NT$ ${Number(r.factory_repair_cost).toLocaleString()}`
                            : ""}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => setActive(r)}>
                          檢視 / 更新
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </TabsContent>

      <TabsContent value="inventory" className="mt-4">
        <RefurbishedInventoryPanel />
      </TabsContent>

      <SupplierRepairDialog
        repair={active}
        open={!!active}
        onOpenChange={(o) => !o && setActive(null)}
        onSaved={() => {
          load();
          // refresh active so dialog reflects new status
          if (active) {
            supabase
              .from("rma_supplier_repairs")
              .select(
                "*, rma:rma_requests(id, rma_number, customer_name, product_name, product_model, serial_number, status)"
              )
              .eq("id", active.id)
              .maybeSingle()
              .then(({ data }) => data && setActive(data as unknown as SupplierRepairRow));
          }
        }}
      />
    </Tabs>
  );
};

export default SupplierRepairTab;
