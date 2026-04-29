import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Package, Search, Eye, CheckCircle, AlertCircle, Mail, Paperclip, X, Loader2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  buildDiagnosisNotificationBody,
  isWithinWarranty,
  getRefurbPrices,
  formatNT,
} from "@/lib/refurbishedPricing";

type RmaStatus = "closed" | "contacting" | "follow_up" | "inspecting" | "no_repair" | "paid" | "quote_confirmed" | "received" | "registered" | "repairing" | "shipped" | "shipped_back" | "shipped_back_new" | "shipped_back_original" | "shipped_back_refurbished" | "unknown";

interface RmaRequest {
  id: string;
  rma_number: string;
  customer_name: string;
  customer_email: string | null;
  product_name: string;
  product_model: string | null;
  serial_number: string | null;
  status: RmaStatus;
  received_date: string | null;
  issue_type: string;
  issue_description: string;
  initial_diagnosis: string | null;
  diagnosis_category: string | null;
  warranty_date: string | null;
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

// Attachment config — must match send-rma-reply backend validation (rma-replies/{rmaId}/ prefix required)
const ATTACHMENT_BUCKET = "rma-attachments";
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024; // 25 MB
const ALLOWED_EXTENSIONS = [
  "jpg", "jpeg", "png", "heic", "webp",
  "pdf", "doc", "docx", "xls", "xlsx", "zip",
];

interface UploadedAttachment {
  name: string;
  path: string;
  size: number;
  contentType?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getExtension(name: string): string {
  const idx = name.lastIndexOf(".");
  if (idx < 0) return "";
  return name.slice(idx + 1).toLowerCase();
}

function sanitizeForKey(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  const safeBase =
    base.replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "file";
  const safeExt = ext.replace(/[^\w.]+/g, "");
  return `${safeBase}${safeExt}`.slice(0, 120);
}

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

  // Notify customer dialog state
  const [notifyDialogOpen, setNotifyDialogOpen] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [notifyAttachments, setNotifyAttachments] = useState<UploadedAttachment[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);
  const notifyFileInputRef = useRef<HTMLInputElement | null>(null);
  // null = 跟隨系統判斷; true/false = admin 手動覆寫
  const [warrantyOverride, setWarrantyOverride] = useState<boolean | null>(null);
  const [notifyBody, setNotifyBody] = useState("");
  const [notifySubject, setNotifySubject] = useState("");

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

    // Fetch initial diagnosis + diagnosis_category from rma_requests
    const { data: rmaData } = await supabase
      .from("rma_requests")
      .select("initial_diagnosis, diagnosis_category")
      .eq("id", rma.id)
      .single();

    if (repairData) {
      setRepairDetail(repairData);
      setPlannedMethod(repairData.planned_method || "");
      setInternalReference(repairData.internal_reference || "");
      setEstimatedCost(repairData.estimated_cost?.toString() || "");
      setActualMethod(repairData.actual_method || "");
      setReplacementModel(repairData.replacement_model || "");
      setReplacementSerial(repairData.replacement_serial || "");
    } else {
      setRepairDetail(null);
      setPlannedMethod("");
      setInternalReference("");
      setEstimatedCost("");
      setActualMethod("");
      setReplacementModel("");
      setReplacementSerial("");
    }

    setInitialDiagnosis(rmaData?.initial_diagnosis || "");
    setDiagnosisCategory(rmaData?.diagnosis_category || "");
    setDialogOpen(true);
  };

  const handleSaveRepairDetail = async () => {
    if (!selectedRma) return;
    setSaving(true);

    try {
      // Update initial diagnosis + diagnosis_category in rma_requests
      await supabase
        .from("rma_requests")
        .update({
          initial_diagnosis: initialDiagnosis,
          diagnosis_category: diagnosisCategory || null,
        })
        .eq("id", selectedRma.id);

      // Upsert repair details
      const repairData = {
        rma_request_id: selectedRma.id,
        planned_method: plannedMethod || null,
        internal_reference: internalReference || null,
        estimated_cost: estimatedCost ? parseFloat(estimatedCost) : null,
        actual_method: actualMethod || null,
        replacement_model: actualMethod === "換新" ? (replacementModel || null) : null,
        replacement_serial: actualMethod === "換新" ? (replacementSerial || null) : null,
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

  // 系統依 warranty_date 判斷是否在保固內
  const systemWithinWarranty = selectedRma
    ? isWithinWarranty(selectedRma.warranty_date)
    : false;

  // 實際生效的保固判斷（含 admin 覆寫）
  const effectiveWithinWarranty =
    warrantyOverride === null ? systemWithinWarranty : warrantyOverride;

  // 依保固狀態 + 已儲存的診斷產生預設 email 主旨/內容
  const buildDefaultDiagnosisEmail = (within: boolean) => {
    if (!selectedRma) return { subject: "", body: "" };
    const subject = `[${selectedRma.rma_number}] 產品檢測結果與處理方式確認`;
    const body = buildDiagnosisNotificationBody({
      productModel: selectedRma.product_model || selectedRma.product_name,
      serialNumber: selectedRma.serial_number,
      withinWarranty: within,
      diagnosis: selectedRma.initial_diagnosis,
    });
    return { subject, body };
  };

  // 開啟通知 dialog 時初始化文字（保留 admin 後續手動編輯）
  const initializeNotifyContent = (within: boolean) => {
    const { subject, body } = buildDefaultDiagnosisEmail(within);
    setNotifySubject(subject);
    setNotifyBody(body);
  };

  // 切換保固覆寫時自動重產文字（若 admin 尚未編輯過 / 文字仍為某模板的預設值）
  const handleWarrantyToggle = (treatAsWarranty: boolean) => {
    setWarrantyOverride(treatAsWarranty);
    initializeNotifyContent(treatAsWarranty);
  };


  const handleAddNotifyAttachments = async (files: FileList | null) => {
    if (!files || files.length === 0 || !selectedRma) return;
    const fileArr = Array.from(files);

    if (notifyAttachments.length + fileArr.length > MAX_ATTACHMENTS) {
      toast.error(`最多只能附加 ${MAX_ATTACHMENTS} 個檔案`);
      return;
    }

    setUploadingFiles(true);
    const uploaded: UploadedAttachment[] = [];
    try {
      for (const file of fileArr) {
        const ext = getExtension(file.name);
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
          toast.error(`不支援的檔案類型：${file.name}`);
          continue;
        }
        if (file.size > MAX_ATTACHMENT_SIZE) {
          toast.error(`檔案超過 25 MB：${file.name}`);
          continue;
        }
        const safeName = sanitizeForKey(file.name);
        const path = `rma-replies/${selectedRma.id}/${crypto.randomUUID()}-${safeName}`;
        const { error: upErr } = await supabase.storage
          .from(ATTACHMENT_BUCKET)
          .upload(path, file, {
            contentType: file.type || undefined,
            upsert: false,
          });
        if (upErr) {
          toast.error(`上傳失敗：${file.name} - ${upErr.message}`);
          continue;
        }
        uploaded.push({
          name: file.name,
          path,
          size: file.size,
          contentType: file.type || undefined,
        });
      }
      if (uploaded.length > 0) {
        setNotifyAttachments((prev) => [...prev, ...uploaded]);
        toast.success(`已上傳 ${uploaded.length} 個附件`);
      }
    } finally {
      setUploadingFiles(false);
      if (notifyFileInputRef.current) notifyFileInputRef.current.value = "";
    }
  };

  const handleRemoveNotifyAttachment = async (idx: number) => {
    const att = notifyAttachments[idx];
    if (!att) return;
    await supabase.storage.from(ATTACHMENT_BUCKET).remove([att.path]).catch(() => {});
    setNotifyAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  // Batch-remove all uploaded notify attachments. Supabase storage.remove accepts
  // an array of paths — single awaited RPC that deletes all paths together.
  const clearNotifyAttachments = async () => {
    const paths = notifyAttachments.map((a) => a.path);
    if (paths.length === 0) return;
    await supabase.storage.from(ATTACHMENT_BUCKET).remove(paths).catch(() => {});
    setNotifyAttachments([]);
  };

  const handleNotifyDialogChange = async (open: boolean) => {
    if (open) {
      setNotifyDialogOpen(true);
      return;
    }
    // Block close while sending, uploading, or cleaning up
    if (notifying || cleaningUp || uploadingFiles) return;
    if (notifyAttachments.length > 0) {
      setCleaningUp(true);
      try {
        await clearNotifyAttachments();
      } finally {
        setCleaningUp(false);
      }
    }
    setNotifyDialogOpen(false);
  };

  const handleSendDiagnosisNotification = async () => {
    if (!selectedRma) return;
    setNotifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-rma-reply", {
        body: {
          rmaRequestId: selectedRma.id,
          subject: notifySubject,
          body: notifyBody,
          attachments: notifyAttachments,
        },
      });
      if (error) throw error;
      const result = data as { error?: string } | null;
      if (result?.error) throw new Error(result.error);
      toast.success(`已寄出診斷通知給 ${selectedRma.customer_email}`);

      // Auto-update status to contacting
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-rma-status`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                rma_id: selectedRma.id,
                new_status: "contacting",
              }),
            }
          );
        }
      } catch (statusErr) {
        console.error("Status update failed:", statusErr);
      }

      // Email sent — clear local state but DO NOT delete files (cleanup cron will handle)
      setNotifyAttachments([]);
      setNotifyDialogOpen(false);
      setDialogOpen(false);
      fetchRmaList();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      toast.error("寄送失敗：" + msg);
    } finally {
      setNotifying(false);
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
                      <Label htmlFor="diagnosisCategory">診斷分類</Label>
                      <Select value={diagnosisCategory} onValueChange={setDiagnosisCategory}>
                        <SelectTrigger id="diagnosisCategory">
                          <SelectValue placeholder="選擇診斷分類" />
                        </SelectTrigger>
                        <SelectContent>
                          {DIAGNOSIS_CATEGORIES.map((c) => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

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
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="actualMethod">實際處理方式</Label>
                      <Select value={actualMethod} onValueChange={setActualMethod}>
                        <SelectTrigger id="actualMethod">
                          <SelectValue placeholder="選擇實際處理方式" />
                        </SelectTrigger>
                        <SelectContent>
                          {ACTUAL_METHODS.map((m) => (
                            <SelectItem key={m} value={m}>{m}</SelectItem>
                          ))}
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

                  {actualMethod === "換新" && (
                    <div className="grid grid-cols-2 gap-4 p-4 border border-border rounded-lg bg-muted/30">
                      <div>
                        <Label htmlFor="replacementModel">替換型號</Label>
                        <Input
                          id="replacementModel"
                          placeholder="輸入替換產品型號..."
                          value={replacementModel}
                          onChange={(e) => setReplacementModel(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="replacementSerial">替換序號</Label>
                        <Input
                          id="replacementSerial"
                          placeholder="輸入替換產品序號..."
                          value={replacementSerial}
                          onChange={(e) => setReplacementSerial(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

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


                <div className="flex flex-wrap justify-end gap-3 pt-4">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    取消
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setNotifyDialogOpen(true)}
                    disabled={
                      !selectedRma?.customer_email ||
                      !selectedRma?.initial_diagnosis?.trim()
                    }
                    title={
                      !selectedRma?.customer_email
                        ? "此 RMA 沒有客戶 Email"
                        : !selectedRma?.initial_diagnosis?.trim()
                        ? "請先填寫並儲存初步診斷"
                        : "寄送診斷結果給客戶"
                    }
                    className="gap-1"
                  >
                    <Mail className="w-4 h-4" />
                    通知客戶診斷結果
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

      {/* Notify Customer Diagnosis Dialog */}
      <AlertDialog open={notifyDialogOpen} onOpenChange={handleNotifyDialogChange}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              寄送診斷通知給客戶
            </AlertDialogTitle>
            <AlertDialogDescription>
              以下內容讀取自<strong>已儲存</strong>的資料。如有修改未儲存，請先取消並按「儲存記錄」。
            </AlertDialogDescription>
          </AlertDialogHeader>

          {selectedRma && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-[80px_1fr] gap-2 p-3 bg-muted/50 rounded-lg">
                <span className="text-muted-foreground">收件人</span>
                <span className="font-mono">{selectedRma.customer_email}</span>
                <span className="text-muted-foreground">主旨</span>
                <span className="font-medium">{buildDiagnosisEmail().subject}</span>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">信件內容預覽</p>
                <pre className="whitespace-pre-wrap text-xs p-3 bg-muted/30 rounded-lg border border-border max-h-64 overflow-y-auto font-sans">
{buildDiagnosisEmail().body}
                </pre>
              </div>
              {/* Attachments */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5" />
                    附件 {notifyAttachments.length > 0 && `(${notifyAttachments.length}/${MAX_ATTACHMENTS})`}
                  </Label>
                  <input
                    ref={notifyFileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    accept={ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",")}
                    onChange={(e) => handleAddNotifyAttachments(e.target.files)}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    onClick={() => notifyFileInputRef.current?.click()}
                    disabled={uploadingFiles || notifying || cleaningUp || notifyAttachments.length >= MAX_ATTACHMENTS}
                  >
                    {uploadingFiles ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                    ) : (
                      <Paperclip className="w-3.5 h-3.5 mr-1" />
                    )}
                    選擇檔案
                  </Button>
                </div>
                {notifyAttachments.length > 0 && (
                  <ul className="space-y-1 border rounded p-2 bg-muted/20">
                    {notifyAttachments.map((a, idx) => (
                      <li key={a.path} className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <FileText className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
                          <span className="truncate">{a.name}</span>
                          <span className="text-[10px] text-muted-foreground flex-shrink-0">
                            ({formatBytes(a.size)})
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          onClick={() => handleRemoveNotifyAttachment(idx)}
                          disabled={notifying || cleaningUp}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-[10px] text-muted-foreground">
                  最多 {MAX_ATTACHMENTS} 個檔案，單檔上限 25 MB。Email 內以下載連結呈現，30 天內有效。
                </p>
              </div>

              <p className="text-xs text-muted-foreground">
                寄出後 RMA 狀態將自動切換為「聯繫客戶中」。
              </p>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={notifying || cleaningUp || uploadingFiles}
              onClick={(e) => {
                e.preventDefault();
                handleNotifyDialogChange(false);
              }}
            >
              {cleaningUp ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />清理中...</>
              ) : (
                "取消"
              )}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleSendDiagnosisNotification();
              }}
              disabled={notifying || uploadingFiles || cleaningUp}
            >
              {notifying ? "寄送中..." : "確認寄出"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ReceivingTab;
