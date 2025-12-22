import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search, ArrowLeft, Globe, Loader2, Package, CheckCircle2, Clock, Truck, Wrench, XCircle } from "lucide-react";
import Footer from "@/components/layout/Footer";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type TabType = "customer" | "rma";
type RmaStatus = Database["public"]["Enums"]["rma_status"];
type RmaRequest = Database["public"]["Tables"]["rma_requests"]["Row"];
type RmaStatusHistory = Database["public"]["Tables"]["rma_status_history"]["Row"];

const statusLabels: Record<RmaStatus, string> = {
  pending: "待處理",
  processing: "處理中",
  shipped: "已出貨",
  received: "已收件",
  repairing: "維修中",
  completed: "已完成",
  cancelled: "已取消",
};

const statusIcons: Record<RmaStatus, React.ReactNode> = {
  pending: <Clock className="w-5 h-5" />,
  processing: <Package className="w-5 h-5" />,
  shipped: <Truck className="w-5 h-5" />,
  received: <Package className="w-5 h-5" />,
  repairing: <Wrench className="w-5 h-5" />,
  completed: <CheckCircle2 className="w-5 h-5" />,
  cancelled: <XCircle className="w-5 h-5" />,
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

const Track = () => {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabType>("rma");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [rmaNumber, setRmaNumber] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<RmaRequest[]>([]);
  const [selectedRma, setSelectedRma] = useState<RmaRequest | null>(null);
  const [statusHistory, setStatusHistory] = useState<RmaStatusHistory[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  // Auto-search if RMA number is in URL
  useEffect(() => {
    const rmaFromUrl = searchParams.get("rma");
    if (rmaFromUrl) {
      setRmaNumber(rmaFromUrl);
      setActiveTab("rma");
      handleSearchByRma(rmaFromUrl);
    }
  }, [searchParams]);

  const handleSearchByRma = async (rma: string) => {
    setIsLoading(true);
    setHasSearched(true);
    try {
      const { data, error } = await supabase
        .from("rma_requests")
        .select("*")
        .ilike("rma_number", `%${rma.replace(/-/g, "")}%`);

      if (error) throw error;

      // Filter to find exact match or close matches
      const filtered = data?.filter(r => 
        r.rma_number.replace(/-/g, "").toLowerCase().includes(rma.replace(/-/g, "").toLowerCase())
      ) || [];

      setResults(filtered);

      if (filtered.length === 1) {
        await loadRmaDetails(filtered[0]);
      } else if (filtered.length === 0) {
        toast.error("找不到符合的 RMA 申請");
      }
    } catch (error) {
      console.error("Search error:", error);
      toast.error("查詢失敗，請稍後再試");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchByCustomer = async () => {
    setIsLoading(true);
    setHasSearched(true);
    try {
      const { data, error } = await supabase
        .from("rma_requests")
        .select("*")
        .ilike("customer_name", `%${customerName.trim()}%`)
        .ilike("customer_phone", `%${phone.trim()}%`)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setResults(data || []);

      if (data && data.length === 1) {
        await loadRmaDetails(data[0]);
      } else if (!data || data.length === 0) {
        toast.error("找不到符合的 RMA 申請");
      }
    } catch (error) {
      console.error("Search error:", error);
      toast.error("查詢失敗，請稍後再試");
    } finally {
      setIsLoading(false);
    }
  };

  const loadRmaDetails = async (rma: RmaRequest) => {
    setSelectedRma(rma);
    try {
      const { data: history, error } = await supabase
        .from("rma_status_history")
        .select("*")
        .eq("rma_request_id", rma.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setStatusHistory(history || []);
    } catch (error) {
      console.error("Error loading history:", error);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSelectedRma(null);
    setStatusHistory([]);

    if (activeTab === "customer") {
      if (!customerName.trim() || !phone.trim()) {
        toast.error("請填寫完整的客戶資訊");
        return;
      }
      handleSearchByCustomer();
    } else {
      if (!rmaNumber.trim()) {
        toast.error("請輸入RMA編號");
        return;
      }
      handleSearchByRma(rmaNumber);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const resetSearch = () => {
    setResults([]);
    setSelectedRma(null);
    setStatusHistory([]);
    setHasSearched(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            返回首頁
          </Link>

          <div className="flex items-center gap-3">
            <span className="font-semibold text-foreground">RMA 狀態追蹤</span>
            <Link
              to="/shipping"
              className="inline-flex items-center gap-2 px-4 py-2 bg-card text-foreground text-sm font-medium rounded-lg border border-border hover:bg-secondary transition-colors"
            >
              <Globe className="w-4 h-4" />
              新增寄件資訊
            </Link>
          </div>

          <div className="w-20" />
        </div>
      </header>

      <main className="flex-1 py-12">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto">
            {/* Search Form */}
            {!selectedRma && (
              <div className="rma-card animate-fade-in">
                {/* Title */}
                <div className="text-center mb-8">
                  <h1 className="text-2xl font-bold text-foreground mb-2">
                    查詢您的RMA維修狀態
                  </h1>
                  <p className="text-muted-foreground">
                    請輸入您的相關資訊，查看您的維修進度
                  </p>
                </div>

                {/* Tabs */}
                <div className="flex bg-secondary rounded-lg p-1 mb-8">
                  <button
                    onClick={() => { setActiveTab("customer"); resetSearch(); }}
                    className={`flex-1 py-3 px-4 text-sm font-medium rounded-md transition-all ${
                      activeTab === "customer"
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    使用客戶資訊查詢
                  </button>
                  <button
                    onClick={() => { setActiveTab("rma"); resetSearch(); }}
                    className={`flex-1 py-3 px-4 text-sm font-medium rounded-md transition-all ${
                      activeTab === "rma"
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    使用RMA編號查詢
                  </button>
                </div>

                {/* Forms */}
                <form onSubmit={handleSearch}>
                  {activeTab === "customer" ? (
                    <div className="space-y-4">
                      <div>
                        <label className="rma-label">客戶姓名</label>
                        <input
                          type="text"
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          placeholder="請輸入您的姓名"
                          className="rma-input"
                        />
                      </div>
                      <div>
                        <label className="rma-label">電話號碼</label>
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="請輸入您的電話號碼"
                          className="rma-input"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="rma-label">RMA編號</label>
                        <input
                          type="text"
                          value={rmaNumber}
                          onChange={(e) => setRmaNumber(e.target.value)}
                          placeholder="請輸入您的RMA編號"
                          className="rma-input"
                        />
                        <p className="text-xs text-muted-foreground mt-2">
                          輸入RMA編號時，可以省略中間的「-」符號
                        </p>
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full mt-6 rma-btn-primary py-4 text-base disabled:opacity-50"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        查詢中...
                      </>
                    ) : (
                      <>
                        <Search className="w-5 h-5" />
                        查詢
                      </>
                    )}
                  </button>
                </form>

                {/* Multiple Results */}
                {hasSearched && results.length > 1 && (
                  <div className="mt-8 pt-6 border-t border-border">
                    <h3 className="text-lg font-semibold text-foreground mb-4">找到 {results.length} 筆申請</h3>
                    <div className="space-y-3">
                      {results.map((rma) => (
                        <button
                          key={rma.id}
                          onClick={() => loadRmaDetails(rma)}
                          className="w-full text-left p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-mono text-primary">{rma.rma_number}</p>
                              <p className="text-sm text-muted-foreground mt-1">
                                {rma.product_name} • {formatDate(rma.created_at)}
                              </p>
                            </div>
                            <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${statusColors[rma.status]}`}>
                              {statusLabels[rma.status]}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* RMA Details View */}
            {selectedRma && (
              <div className="space-y-6 animate-fade-in">
                {/* Back Button */}
                <button
                  onClick={() => { setSelectedRma(null); setStatusHistory([]); }}
                  className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  返回搜尋
                </button>

                {/* Status Card */}
                <div className="rma-card">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <p className="text-sm text-muted-foreground">RMA 編號</p>
                      <p className="text-2xl font-mono font-bold text-primary">{selectedRma.rma_number}</p>
                    </div>
                    <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${statusColors[selectedRma.status]}`}>
                      {statusIcons[selectedRma.status]}
                      <span className="font-medium">{statusLabels[selectedRma.status]}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                    <div>
                      <p className="text-sm text-muted-foreground">產品名稱</p>
                      <p className="text-foreground">{selectedRma.product_name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">產品型號</p>
                      <p className="text-foreground">{selectedRma.product_model || "-"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">問題類型</p>
                      <p className="text-foreground">{selectedRma.issue_type}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">建立日期</p>
                      <p className="text-foreground">{formatDate(selectedRma.created_at)}</p>
                    </div>
                  </div>
                </div>

                {/* Status Timeline */}
                <div className="rma-card">
                  <h3 className="text-lg font-semibold text-foreground mb-6">進度歷史</h3>
                  
                  {statusHistory.length === 0 ? (
                    <div className="text-center py-8">
                      <Clock className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                      <p className="text-muted-foreground">尚無狀態更新記錄</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        目前狀態：{statusLabels[selectedRma.status]}
                      </p>
                    </div>
                  ) : (
                    <div className="relative">
                      {/* Timeline line */}
                      <div className="absolute left-4 top-3 bottom-3 w-0.5 bg-border" />

                      <div className="space-y-6">
                        {/* Current Status */}
                        <div className="relative flex items-start gap-4">
                          <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center ${statusColors[selectedRma.status]}`}>
                            {statusIcons[selectedRma.status]}
                          </div>
                          <div className="flex-1 pt-1">
                            <p className="font-medium text-foreground">{statusLabels[selectedRma.status]}</p>
                            <p className="text-sm text-muted-foreground">目前狀態</p>
                          </div>
                        </div>

                        {/* History */}
                        {statusHistory.map((history, index) => (
                          <div key={history.id} className="relative flex items-start gap-4">
                            <div className="relative z-10 w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                              {statusIcons[history.status]}
                            </div>
                            <div className="flex-1 pt-1">
                              <p className="font-medium text-foreground">{statusLabels[history.status]}</p>
                              <p className="text-sm text-muted-foreground">{formatDate(history.created_at)}</p>
                              {history.notes && (
                                <p className="text-sm text-muted-foreground mt-1 bg-muted/50 rounded-lg p-2">
                                  {history.notes}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}

                        {/* Created */}
                        <div className="relative flex items-start gap-4">
                          <div className="relative z-10 w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                            <Package className="w-4 h-4" />
                          </div>
                          <div className="flex-1 pt-1">
                            <p className="font-medium text-foreground">申請建立</p>
                            <p className="text-sm text-muted-foreground">{formatDate(selectedRma.created_at)}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Contact Info */}
                <div className="rma-card">
                  <h3 className="text-lg font-semibold text-foreground mb-4">申請資訊</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">客戶姓名</p>
                      <p className="text-foreground">{selectedRma.customer_name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">聯絡電話</p>
                      <p className="text-foreground">{selectedRma.customer_phone}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-sm text-muted-foreground">電子郵件</p>
                      <p className="text-foreground">{selectedRma.customer_email}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-sm text-muted-foreground">問題描述</p>
                      <p className="text-foreground whitespace-pre-wrap">{selectedRma.issue_description}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Track;
