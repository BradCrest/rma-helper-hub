import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Package, Search, Eye, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";

type RmaStatus = "closed" | "contacting" | "follow_up" | "inspecting" | "no_repair" | "paid" | "quote_confirmed" | "received" | "registered" | "repairing" | "shipped" | "shipped_back" | "shipped_back_new" | "shipped_back_original" | "shipped_back_refurbished" | "unknown";

interface RmaRequest {
  id: string;
  rma_number: string;
  customer_name: string;
  product_name: string;
  product_model: string | null;
  serial_number: string | null;
  status: RmaStatus;
  received_date: string | null;
  issue_type: string;
  issue_description: string;
  created_at: string;
}

interface RepairDetail {
  id?: string;
  rma_request_id: string;
  planned_method: string | null;
  actual_method: string | null;
  internal_reference: string | null;
  estimated_cost: number | null;
  actual_cost: number | null;
  replacement_model: string | null;
  replacement_serial: string | null;
}

const DIAGNOSIS_CATEGORIES = ["外觀損壞", "功能異常", "保固問題", "使用者疏失"];
const ACTUAL_METHODS = ["維修", "換新", "退款", "不在保固內"];

const ReceivingTab = () => {
  const [rmaList, setRmaList] = useState<RmaRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedRma, setSelectedRma] = useState<RmaRequest | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [repairDetail, setRepairDetail] = useState<RepairDetail | null>(null);
  const [saving, setSaving] = useState(false);

  // Form states for repair details
  const [plannedMethod, setPlannedMethod] = useState("");
  const [internalReference, setInternalReference] = useState("");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [initialDiagnosis, setInitialDiagnosis] = useState("");
  const [diagnosisCategory, setDiagnosisCategory] = useState("");
  const [actualMethod, setActualMethod] = useState("");
  const [replacementModel, setReplacementModel] = useState("");
  const [replacementSerial, setReplacementSerial] = useState("");

  useEffect(() => {
    fetchRmaList();
  }, [statusFilter]);

  const fetchRmaList = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("rma_requests")
        .select("*")
        .order("created_at", { ascending: false });

      // Filter by statuses relevant to receiving process
      if (statusFilter === "all") {
        query = query.in("status", ["shipped", "received", "inspecting"]);
      } else {
        query = query.eq("status", statusFilter as RmaStatus);
      }

      const { data, error } = await query;

      if (error) throw error;
      setRmaList(data || []);
    } catch (error) {
      console.error("Error fetching RMA list:", error);
      toast.error("載入資料失敗");
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetail = async (rma: RmaRequest) => {
    setSelectedRma(rma);
    
    // Fetch existing repair details
    const { data: repairData } = await supabase
      .from("rma_repair_details")
      .select("*")
      .eq("rma_request_id", rma.id)
      .single();

    // Fetch initial diagnosis from rma_requests
    const { data: rmaData } = await supabase
      .from("rma_requests")
      .select("initial_diagnosis")
      .eq("id", rma.id)
      .single();

    if (repairData) {
      setRepairDetail(repairData);
      setPlannedMethod(repairData.planned_method || "");
      setInternalReference(repairData.internal_reference || "");
      setEstimatedCost(repairData.estimated_cost?.toString() || "");
    } else {
      setRepairDetail(null);
      setPlannedMethod("");
      setInternalReference("");
      setEstimatedCost("");
    }

    setInitialDiagnosis(rmaData?.initial_diagnosis || "");
    setDialogOpen(true);
  };

  const handleSaveRepairDetail = async () => {
    if (!selectedRma) return;
    setSaving(true);

    try {
      // Update initial diagnosis in rma_requests
      await supabase
        .from("rma_requests")
        .update({ initial_diagnosis: initialDiagnosis })
        .eq("id", selectedRma.id);

      // Upsert repair details
      const repairData = {
        rma_request_id: selectedRma.id,
        planned_method: plannedMethod || null,
        internal_reference: internalReference || null,
        estimated_cost: estimatedCost ? parseFloat(estimatedCost) : null,
      };

      if (repairDetail?.id) {
        await supabase
          .from("rma_repair_details")
          .update(repairData)
          .eq("id", repairDetail.id);
      } else {
        await supabase.from("rma_repair_details").insert(repairData);
      }

      toast.success("已儲存檢查記錄");
      setDialogOpen(false);
      fetchRmaList();
    } catch (error) {
      console.error("Error saving repair detail:", error);
      toast.error("儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (rmaId: string, newStatus: RmaStatus) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("請先登入");
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-rma-status`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            rma_id: rmaId,
            new_status: newStatus,
          }),
        }
      );

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || "更新失敗");
      }

      toast.success(`狀態已更新為：${getStatusLabel(newStatus)}`);
      fetchRmaList();
      setDialogOpen(false);
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("更新狀態失敗");
    }
  };

  const getStatusLabel = (status: string) => {
    const statusMap: Record<string, string> = {
      shipped: "已寄出",
      received: "已收件",
      inspecting: "檢測中",
      contacting: "聯繫客戶中",
    };
    return statusMap[status] || status;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      shipped: "outline",
      received: "secondary",
      inspecting: "default",
    };
    return (
      <Badge variant={variants[status] || "default"}>
        {getStatusLabel(status)}
      </Badge>
    );
  };

  const filteredList = rmaList.filter((rma) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      rma.rma_number.toLowerCase().includes(query) ||
      rma.customer_name.toLowerCase().includes(query) ||
      rma.product_name.toLowerCase().includes(query) ||
      (rma.serial_number && rma.serial_number.toLowerCase().includes(query))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header with filters */}
      <div className="rma-card">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">收件處理</h2>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="搜尋 RMA 編號、客戶、產品..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="狀態篩選" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部待處理</SelectItem>
                <SelectItem value="shipped">已寄出</SelectItem>
                <SelectItem value="received">已收件</SelectItem>
                <SelectItem value="inspecting">檢測中</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* RMA List Table */}
      <div className="rma-card p-0 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">載入中...</div>
        ) : filteredList.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>目前沒有待處理的收件</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>RMA 編號</TableHead>
                <TableHead>客戶姓名</TableHead>
                <TableHead>產品名稱</TableHead>
                <TableHead>序號</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead>收件日期</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredList.map((rma) => (
                <TableRow key={rma.id}>
                  <TableCell className="font-mono font-medium">{rma.rma_number}</TableCell>
                  <TableCell>{rma.customer_name}</TableCell>
                  <TableCell>{rma.product_name}</TableCell>
                  <TableCell className="font-mono text-sm">{rma.serial_number || "-"}</TableCell>
                  <TableCell>{getStatusBadge(rma.status)}</TableCell>
                  <TableCell>
                    {rma.received_date
                      ? format(new Date(rma.received_date), "yyyy/MM/dd")
                      : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewDetail(rma)}
                      className="gap-1"
                    >
                      <Eye className="w-4 h-4" />
                      檢視
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Detail Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              收件處理 - {selectedRma?.rma_number}
            </DialogTitle>
          </DialogHeader>

          {selectedRma && (
            <div className="space-y-6">
              {/* RMA Info */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">客戶姓名</p>
                  <p className="font-medium">{selectedRma.customer_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">產品名稱</p>
                  <p className="font-medium">{selectedRma.product_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">產品型號</p>
                  <p className="font-medium">{selectedRma.product_model || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">產品序號</p>
                  <p className="font-mono">{selectedRma.serial_number || "-"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-muted-foreground">客戶描述問題</p>
                  <p className="font-medium">{selectedRma.issue_description}</p>
                </div>
              </div>

              {/* Status Update */}
              <div className="flex items-center gap-3 p-4 border border-border rounded-lg">
                <span className="text-sm font-medium">目前狀態：</span>
                {getStatusBadge(selectedRma.status)}
                <div className="flex-1" />
                {selectedRma.status === "shipped" && (
                  <Button
                    size="sm"
                    onClick={() => handleUpdateStatus(selectedRma.id, "received")}
                    className="gap-1"
                  >
                    <CheckCircle className="w-4 h-4" />
                    確認收件
                  </Button>
                )}
                {selectedRma.status === "received" && (
                  <Button
                    size="sm"
                    onClick={() => handleUpdateStatus(selectedRma.id, "inspecting")}
                    className="gap-1"
                  >
                    <AlertCircle className="w-4 h-4" />
                    開始檢測
                  </Button>
                )}
                {selectedRma.status === "inspecting" && (
                  <Button
                    size="sm"
                    onClick={() => handleUpdateStatus(selectedRma.id, "contacting")}
                    className="gap-1"
                  >
                    進入客戶聯繫
                  </Button>
                )}
              </div>

              {/* Inspection Form */}
              <div className="space-y-4">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  初步檢測記錄
                </h3>

                <div className="grid gap-4">
                  <div>
                    <Label htmlFor="initialDiagnosis">初步診斷</Label>
                    <Textarea
                      id="initialDiagnosis"
                      placeholder="描述初步檢測結果..."
                      value={initialDiagnosis}
                      onChange={(e) => setInitialDiagnosis(e.target.value)}
                      rows={3}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="plannedMethod">預計處理方式</Label>
                      <Select value={plannedMethod} onValueChange={setPlannedMethod}>
                        <SelectTrigger id="plannedMethod">
                          <SelectValue placeholder="選擇處理方式" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="repair">維修</SelectItem>
                          <SelectItem value="replace">換貨</SelectItem>
                          <SelectItem value="refund">退款</SelectItem>
                          <SelectItem value="return_supplier">送回供應商</SelectItem>
                          <SelectItem value="no_issue">無問題退回</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="estimatedCost">預估費用 (NT$)</Label>
                      <Input
                        id="estimatedCost"
                        type="number"
                        placeholder="0"
                        value={estimatedCost}
                        onChange={(e) => setEstimatedCost(e.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="internalReference">內部參考編號</Label>
                    <Input
                      id="internalReference"
                      placeholder="輸入內部參考編號..."
                      value={internalReference}
                      onChange={(e) => setInternalReference(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    取消
                  </Button>
                  <Button onClick={handleSaveRepairDetail} disabled={saving}>
                    {saving ? "儲存中..." : "儲存記錄"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ReceivingTab;
