import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { 
  Search, 
  Filter, 
  ChevronLeft, 
  ChevronRight,
  Eye,
  RefreshCw,
  Home,
  LogOut,
  Package,
  Truck,
  Download,
  CalendarIcon,
  X,
  Clock,
  History,
  PackageCheck,
  Send
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import type { Database } from "@/integrations/supabase/types";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type RmaStatus = Database["public"]["Enums"]["rma_status"];
type RmaRequest = Database["public"]["Tables"]["rma_requests"]["Row"];
type RmaShipping = Database["public"]["Tables"]["rma_shipping"]["Row"];
type RmaStatusHistory = Database["public"]["Tables"]["rma_status_history"]["Row"];

const statusLabels: Record<RmaStatus, string> = {
  pending: "待處理",
  processing: "處理中",
  shipped: "已寄出",
  received: "已收件",
  repairing: "維修中",
  completed: "已完成",
  cancelled: "已取消",
};

const statusColors: Record<RmaStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  processing: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  shipped: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400",
  received: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  repairing: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  cancelled: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
};

const allStatuses: RmaStatus[] = ["pending", "processing", "shipped", "received", "repairing", "completed", "cancelled"];

const AdminRmaList = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [rmaList, setRmaList] = useState<RmaRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<RmaStatus | "all">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedRma, setSelectedRma] = useState<RmaRequest | null>(null);
  const [selectedRmaShipping, setSelectedRmaShipping] = useState<RmaShipping | null>(null);
  const [outboundShipping, setOutboundShipping] = useState<RmaShipping | null>(null);
  const [statusHistory, setStatusHistory] = useState<RmaStatusHistory[]>([]);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isConfirmingReceive, setIsConfirmingReceive] = useState(false);
  const [isSubmittingOutbound, setIsSubmittingOutbound] = useState(false);
  const [outboundForm, setOutboundForm] = useState({ carrier: "", tracking_number: "", notes: "" });
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const pageSize = 10;

  const fetchRmaList = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from("rma_requests")
        .select("*", { count: "exact" });

      // Apply status filter
      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      // Apply search filter
      if (searchTerm.trim()) {
        query = query.or(
          `rma_number.ilike.%${searchTerm}%,customer_name.ilike.%${searchTerm}%,customer_email.ilike.%${searchTerm}%,customer_phone.ilike.%${searchTerm}%`
        );
      }

      // Apply date range filter
      if (startDate) {
        query = query.gte("created_at", startDate.toISOString());
      }
      if (endDate) {
        // Set end of day for end date
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        query = query.lte("created_at", endOfDay.toISOString());
      }

      // Pagination
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;
      
      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;

      setRmaList(data || []);
      setTotalCount(count || 0);
    } catch (error) {
      console.error("Error fetching RMA list:", error);
      toast.error("載入 RMA 列表失敗");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRmaList();
  }, [currentPage, statusFilter, searchTerm, startDate, endDate]);

  const handleStatusUpdate = async (rmaId: string, newStatus: RmaStatus) => {
    setIsUpdatingStatus(true);
    try {
      const { error } = await supabase
        .from("rma_requests")
        .update({ status: newStatus })
        .eq("id", rmaId);

      if (error) throw error;

      toast.success(`狀態已更新為「${statusLabels[newStatus]}」`);
      fetchRmaList();
      setSelectedRma(null);
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("更新狀態失敗");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleViewRma = async (rma: RmaRequest) => {
    setSelectedRma(rma);
    setOutboundForm({ carrier: "", tracking_number: "", notes: "" });
    // Fetch shipping info (inbound & outbound) and status history for this RMA
    try {
      const [inboundResult, outboundResult, historyResult] = await Promise.all([
        supabase
          .from("rma_shipping")
          .select("*")
          .eq("rma_request_id", rma.id)
          .eq("direction", "inbound")
          .maybeSingle(),
        supabase
          .from("rma_shipping")
          .select("*")
          .eq("rma_request_id", rma.id)
          .eq("direction", "outbound")
          .maybeSingle(),
        supabase
          .from("rma_status_history")
          .select("*")
          .eq("rma_request_id", rma.id)
          .order("created_at", { ascending: false })
      ]);
      
      setSelectedRmaShipping(inboundResult.data);
      setOutboundShipping(outboundResult.data);
      setStatusHistory(historyResult.data || []);
    } catch (error) {
      console.error("Error fetching RMA details:", error);
      setSelectedRmaShipping(null);
      setOutboundShipping(null);
      setStatusHistory([]);
    }
  };

  const handleConfirmReceive = async () => {
    if (!selectedRma || !selectedRmaShipping) return;
    
    setIsConfirmingReceive(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Update delivery_date in rma_shipping
      const { error: shippingError } = await supabase
        .from("rma_shipping")
        .update({ delivery_date: today })
        .eq("id", selectedRmaShipping.id);

      if (shippingError) throw shippingError;

      // Update RMA status to received
      const { error: rmaError } = await supabase
        .from("rma_requests")
        .update({ status: "received" })
        .eq("id", selectedRma.id);

      if (rmaError) throw rmaError;

      toast.success("已確認收件");
      
      // Refresh data
      setSelectedRmaShipping({ ...selectedRmaShipping, delivery_date: today });
      setSelectedRma({ ...selectedRma, status: "received" });
      fetchRmaList();
    } catch (error) {
      console.error("Error confirming receive:", error);
      toast.error("確認收件失敗");
    } finally {
      setIsConfirmingReceive(false);
    }
  };

  const handleSubmitOutbound = async () => {
    if (!selectedRma) return;
    
    if (!outboundForm.carrier.trim()) {
      toast.error("請填寫物流名稱");
      return;
    }
    if (!outboundForm.tracking_number.trim()) {
      toast.error("請填寫物流單號");
      return;
    }

    setIsSubmittingOutbound(true);
    try {
      const { data, error } = await supabase.functions.invoke("submit-outbound-shipping", {
        body: {
          rma_request_id: selectedRma.id,
          carrier: outboundForm.carrier,
          tracking_number: outboundForm.tracking_number,
          notes: outboundForm.notes || null,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("回寄資訊已成功提交");
      
      // Refresh data
      setOutboundShipping(data.shipping);
      setSelectedRma({ ...selectedRma, status: "completed" });
      setOutboundForm({ carrier: "", tracking_number: "", notes: "" });
      fetchRmaList();
    } catch (error: any) {
      console.error("Error submitting outbound shipping:", error);
      toast.error(error.message || "提交回寄資訊失敗");
    } finally {
      setIsSubmittingOutbound(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/admin");
  };

  const handleExportCsv = () => {
    if (rmaList.length === 0) {
      toast.error("沒有資料可下載");
      return;
    }

    // CSV headers
    const headers = [
      "RMA編號",
      "客戶名稱",
      "電話",
      "Email",
      "地址",
      "產品名稱",
      "產品型號",
      "序號",
      "購買日期",
      "問題類型",
      "問題描述",
      "狀態",
      "建立日期"
    ];

    // CSV rows
    const rows = rmaList.map(rma => [
      rma.rma_number,
      rma.customer_name,
      rma.customer_phone,
      rma.customer_email,
      rma.customer_address || "",
      rma.product_name,
      rma.product_model || "",
      rma.serial_number || "",
      rma.purchase_date || "",
      rma.issue_type,
      rma.issue_description.replace(/"/g, '""'), // Escape quotes
      statusLabels[rma.status],
      new Date(rma.created_at).toLocaleString("zh-TW")
    ]);

    // Build CSV content with BOM for Excel compatibility
    const BOM = "\uFEFF";
    const csvContent = BOM + [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");

    // Download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `RMA_列表_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success("CSV 檔案已下載");
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card shadow-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link to="/admin/dashboard" className="text-muted-foreground hover:text-foreground">
                <ChevronLeft className="w-5 h-5" />
              </Link>
              <h1 className="text-xl font-bold text-foreground">RMA 申請列表</h1>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">{user?.email}</span>
              <Link to="/" className="rma-btn-secondary text-sm">
                <Home className="w-4 h-4" />
                首頁
              </Link>
              <button onClick={handleSignOut} className="rma-btn-secondary text-sm">
                <LogOut className="w-4 h-4" />
                登出
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters */}
        <div className="rma-card mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="text"
                placeholder="搜尋 RMA 編號、客戶名稱、電話或郵件..."
                className="rma-input pl-10"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-muted-foreground" />
              <select
                className="rma-input w-auto"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as RmaStatus | "all");
                  setCurrentPage(1);
                }}
              >
                <option value="all">所有狀態</option>
                {allStatuses.map((status) => (
                  <option key={status} value={status}>
                    {statusLabels[status]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Date Range Filter */}
          <div className="flex flex-wrap items-center gap-4 mt-4">
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">日期範圍：</span>
            </div>
            
            {/* Start Date */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[160px] justify-start text-left font-normal",
                    !startDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate ? format(startDate, "yyyy/MM/dd", { locale: zhTW }) : "開始日期"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={(date) => {
                    setStartDate(date);
                    setCurrentPage(1);
                  }}
                  disabled={(date) => endDate ? date > endDate : false}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>

            <span className="text-muted-foreground">至</span>

            {/* End Date */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[160px] justify-start text-left font-normal",
                    !endDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {endDate ? format(endDate, "yyyy/MM/dd", { locale: zhTW }) : "結束日期"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={(date) => {
                    setEndDate(date);
                    setCurrentPage(1);
                  }}
                  disabled={(date) => startDate ? date < startDate : false}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>

            {/* Clear Date Filter */}
            {(startDate || endDate) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStartDate(undefined);
                  setEndDate(undefined);
                  setCurrentPage(1);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4 mr-1" />
                清除日期
              </Button>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 mt-4">
            {/* Refresh */}
            <button
              onClick={fetchRmaList}
              className="rma-btn-secondary"
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
              重新整理
            </button>

            {/* Export CSV */}
            <button
              onClick={handleExportCsv}
              className="rma-btn-secondary"
              disabled={isLoading || rmaList.length === 0}
            >
              <Download className="w-4 h-4" />
              下載 CSV
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="rma-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">RMA 編號</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">客戶名稱</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">聯絡電話</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">產品型號</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">問題類型</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">狀態</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">建立日期</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">操作</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        載入中...
                      </div>
                    </td>
                  </tr>
                ) : rmaList.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-muted-foreground">
                      沒有找到符合條件的 RMA 申請
                    </td>
                  </tr>
                ) : (
                  rmaList.map((rma) => (
                    <tr key={rma.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4 font-mono text-sm text-primary">{rma.rma_number}</td>
                      <td className="py-3 px-4 text-sm text-foreground">{rma.customer_name}</td>
                      <td className="py-3 px-4 text-sm text-foreground">{rma.customer_phone}</td>
                      <td className="py-3 px-4 text-sm text-foreground">{rma.product_model || "-"}</td>
                      <td className="py-3 px-4 text-sm text-foreground">{rma.issue_type}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${statusColors[rma.status]}`}>
                          {statusLabels[rma.status]}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-muted-foreground">{formatDate(rma.created_at)}</td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => handleViewRma(rma)}
                          className="text-primary hover:text-primary/80 transition-colors"
                        >
                          <Eye className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-sm text-muted-foreground">
                共 {totalCount} 筆，第 {currentPage} / {totalPages} 頁
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="rma-btn-secondary text-sm disabled:opacity-50"
                >
                  <ChevronLeft className="w-4 h-4" />
                  上一頁
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="rma-btn-secondary text-sm disabled:opacity-50"
                >
                  下一頁
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Detail Modal */}
      {selectedRma && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-border">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-foreground">RMA 詳細資訊</h2>
                <button
                  onClick={() => setSelectedRma(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">RMA 編號</p>
                  <p className="font-mono text-primary">{selectedRma.rma_number}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">目前狀態</p>
                  <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${statusColors[selectedRma.status]}`}>
                    {statusLabels[selectedRma.status]}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">客戶名稱</p>
                  <p className="text-foreground">{selectedRma.customer_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">聯絡電話</p>
                  <p className="text-foreground">{selectedRma.customer_phone}</p>
                </div>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">電子郵件</p>
                <p className="text-foreground">{selectedRma.customer_email}</p>
              </div>

              {selectedRma.customer_address && (
                <div>
                  <p className="text-sm text-muted-foreground">客戶地址</p>
                  <p className="text-foreground">{selectedRma.customer_address}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">產品名稱</p>
                  <p className="text-foreground">{selectedRma.product_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">產品型號</p>
                  <p className="text-foreground">{selectedRma.product_model || "-"}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">序號</p>
                  <p className="text-foreground">{selectedRma.serial_number || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">購買日期</p>
                  <p className="text-foreground">{selectedRma.purchase_date || "-"}</p>
                </div>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">問題類型</p>
                <p className="text-foreground">{selectedRma.issue_type}</p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">問題描述</p>
                <p className="text-foreground whitespace-pre-wrap">{selectedRma.issue_description}</p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">建立日期</p>
                <p className="text-foreground">{formatDate(selectedRma.created_at)}</p>
              </div>

              {/* Shipping Info */}
              {selectedRmaShipping && (
                <div className="pt-4 border-t border-border">
                  <div className="flex items-center gap-2 mb-3">
                    <Truck className="w-4 h-4 text-primary" />
                    <p className="text-sm font-medium text-foreground">客戶寄件資訊</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">物流名稱</p>
                        <p className="text-foreground font-medium">{selectedRmaShipping.carrier}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">物流單號</p>
                        <p className="text-foreground font-mono">{selectedRmaShipping.tracking_number}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {selectedRmaShipping.ship_date && (
                        <div>
                          <p className="text-xs text-muted-foreground">寄出日期</p>
                          <p className="text-foreground">{selectedRmaShipping.ship_date}</p>
                        </div>
                      )}
                      {selectedRmaShipping.delivery_date && (
                        <div>
                          <p className="text-xs text-muted-foreground">收件日期</p>
                          <p className="text-foreground text-green-600 dark:text-green-400 font-medium">
                            ✓ {selectedRmaShipping.delivery_date}
                          </p>
                        </div>
                      )}
                    </div>
                    {selectedRmaShipping.photo_url && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">寄件單據照片</p>
                        <a 
                          href={selectedRmaShipping.photo_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="block"
                        >
                          <img 
                            src={selectedRmaShipping.photo_url} 
                            alt="寄件單據" 
                            className="w-full max-h-48 object-cover rounded-lg border border-border hover:opacity-80 transition-opacity"
                          />
                        </a>
                      </div>
                    )}
                    
                    {/* Confirm Receive Button */}
                    {selectedRma.status === "shipped" && !selectedRmaShipping.delivery_date && (
                      <button
                        onClick={handleConfirmReceive}
                        disabled={isConfirmingReceive}
                        className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                      >
                        <PackageCheck className="w-4 h-4" />
                        {isConfirmingReceive ? "處理中..." : "確認收件"}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {!selectedRmaShipping && (
                <div className="pt-4 border-t border-border">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Package className="w-4 h-4" />
                    <p className="text-sm">客戶尚未提供寄件資訊</p>
                  </div>
                </div>
              )}

              {/* Outbound Shipping Section */}
              <div className="pt-4 border-t border-border">
                <div className="flex items-center gap-2 mb-3">
                  <Send className="w-4 h-4 text-primary" />
                  <p className="text-sm font-medium text-foreground">回寄資訊</p>
                </div>
                
                {outboundShipping ? (
                  // Display existing outbound shipping info
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">物流名稱</p>
                        <p className="text-foreground font-medium">{outboundShipping.carrier}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">物流單號</p>
                        <p className="text-foreground font-mono">{outboundShipping.tracking_number}</p>
                      </div>
                    </div>
                    {outboundShipping.ship_date && (
                      <div>
                        <p className="text-xs text-muted-foreground">寄出日期</p>
                        <p className="text-foreground">{outboundShipping.ship_date}</p>
                      </div>
                    )}
                    {outboundShipping.notes && (
                      <div>
                        <p className="text-xs text-muted-foreground">備註</p>
                        <p className="text-foreground">{outboundShipping.notes}</p>
                      </div>
                    )}
                  </div>
                ) : (selectedRma.status === "received" || selectedRma.status === "repairing") ? (
                  // Show form for adding outbound shipping
                  <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">物流名稱 *</label>
                        <input
                          type="text"
                          className="rma-input"
                          placeholder="例：黑貓宅急便"
                          value={outboundForm.carrier}
                          onChange={(e) => setOutboundForm({ ...outboundForm, carrier: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">物流單號 *</label>
                        <input
                          type="text"
                          className="rma-input"
                          placeholder="請輸入物流單號"
                          value={outboundForm.tracking_number}
                          onChange={(e) => setOutboundForm({ ...outboundForm, tracking_number: e.target.value })}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">備註（選填）</label>
                      <input
                        type="text"
                        className="rma-input"
                        placeholder="例：已更換新品"
                        value={outboundForm.notes}
                        onChange={(e) => setOutboundForm({ ...outboundForm, notes: e.target.value })}
                      />
                    </div>
                    <button
                      onClick={handleSubmitOutbound}
                      disabled={isSubmittingOutbound}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                    >
                      <Send className="w-4 h-4" />
                      {isSubmittingOutbound ? "處理中..." : "確認回寄"}
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {selectedRma.status === "pending" || selectedRma.status === "processing" || selectedRma.status === "shipped"
                      ? "需先確認收件後才能填寫回寄資訊"
                      : selectedRma.status === "cancelled"
                      ? "此 RMA 已取消"
                      : "尚無回寄記錄"}
                  </p>
                )}
              </div>

              {/* Status History Timeline */}
              <div className="pt-4 border-t border-border">
                <div className="flex items-center gap-2 mb-3">
                  <History className="w-4 h-4 text-primary" />
                  <p className="text-sm font-medium text-foreground">狀態歷史記錄</p>
                </div>
                {statusHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">尚無狀態變更記錄</p>
                ) : (
                  <div className="relative pl-4 space-y-4">
                    {/* Timeline line */}
                    <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-border" />
                    
                    {statusHistory.map((history, index) => (
                      <div key={history.id} className="relative flex items-start gap-3">
                        {/* Timeline dot */}
                        <div className={`absolute left-[-8px] w-4 h-4 rounded-full border-2 border-card ${
                          index === 0 ? 'bg-primary' : 'bg-muted-foreground/30'
                        }`} />
                        
                        <div className="flex-1 ml-4">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[history.status]}`}>
                              {statusLabels[history.status]}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            {formatDate(history.created_at)}
                          </div>
                          {history.notes && (
                            <p className="mt-1 text-sm text-muted-foreground">{history.notes}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Status Update */}
              <div className="pt-4 border-t border-border">
                <p className="text-sm font-medium text-foreground mb-3">更新狀態</p>
                <div className="flex flex-wrap gap-2">
                  {allStatuses.map((status) => (
                    <button
                      key={status}
                      onClick={() => handleStatusUpdate(selectedRma.id, status)}
                      disabled={isUpdatingStatus || selectedRma.status === status}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                        selectedRma.status === status
                          ? statusColors[status]
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      {statusLabels[status]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminRmaList;
