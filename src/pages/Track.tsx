import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search, ArrowLeft, Globe, Loader2, Package, CheckCircle2, Clock, Truck, Wrench, XCircle, AlertTriangle } from "lucide-react";
import Footer from "@/components/layout/Footer";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type TabType = "customer" | "rma";
type RmaStatus = Database["public"]["Enums"]["rma_status"];

interface RmaResult {
  id: string;
  rma_number: string;
  status: RmaStatus;
  product_name: string;
  product_model: string | null;
  serial_number?: string | null;
  issue_type: string;
  purchase_date: string | null;
  created_at: string;
  updated_at: string;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  customer_address?: string | null;
  status_history: Array<{
    id: string;
    status: RmaStatus;
    created_at: string;
    notes: string | null;
  }>;
}

const statusLabels: Record<RmaStatus, string> = {
  registered: "已登記 / Registered",
  shipped: "已寄出 / Shipped by Customer",
  received: "已收件 / Received",
  inspecting: "檢修中 / Inspecting",
  contacting: "聯系中 / Contacting Customer",
  quote_confirmed: "確認報價 / Quote Confirmed",
  paid: "已付費 / Paid",
  no_repair: "不維修 / No Repair",
  shipped_back: "已回寄 / Shipped Back",
  shipped_back_refurbished: "已寄回整新品 / Refurbished Unit Shipped",
  shipped_back_original: "已寄回原錶 / Original Unit Returned",
  shipped_back_new: "已寄出全新品 / New Unit Shipped",
  follow_up: "後續關懷 / Follow-up Care",
  closed: "已結案 / Closed",
};

const statusIcons: Record<RmaStatus, React.ReactNode> = {
  registered: <Clock className="w-5 h-5" />,
  shipped: <Truck className="w-5 h-5" />,
  received: <Package className="w-5 h-5" />,
  inspecting: <Wrench className="w-5 h-5" />,
  contacting: <Clock className="w-5 h-5" />,
  quote_confirmed: <Package className="w-5 h-5" />,
  paid: <CheckCircle2 className="w-5 h-5" />,
  no_repair: <XCircle className="w-5 h-5" />,
  shipped_back: <Truck className="w-5 h-5" />,
  shipped_back_refurbished: <Truck className="w-5 h-5" />,
  shipped_back_original: <Truck className="w-5 h-5" />,
  shipped_back_new: <Truck className="w-5 h-5" />,
  follow_up: <Clock className="w-5 h-5" />,
  closed: <CheckCircle2 className="w-5 h-5" />,
};

const statusColors: Record<RmaStatus, string> = {
  registered: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  shipped: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400",
  received: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  inspecting: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  contacting: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
  quote_confirmed: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  paid: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400",
  no_repair: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  shipped_back: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  shipped_back_refurbished: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  shipped_back_original: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400",
  shipped_back_new: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  follow_up: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400",
  closed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

const Track = () => {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabType>("rma");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [rmaNumber, setRmaNumber] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<RmaResult[]>([]);
  const [selectedRma, setSelectedRma] = useState<RmaResult | null>(null);
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
      // Use GET method with query params via URL
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lookup-rma?rma_number=${encodeURIComponent(rma.trim())}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 404) {
          toast.error("找不到符合的 RMA 申請 / No matching RMA found");
          setResults([]);
          return;
        }
        throw new Error(result.error || '查詢失敗 / Search failed');
      }

      const rmaResults = result.results as RmaResult[];
      setResults(rmaResults);

      if (rmaResults.length === 1) {
        setSelectedRma(rmaResults[0]);
      } else if (rmaResults.length === 0) {
        toast.error("找不到符合的 RMA 申請 / No matching RMA found");
      }
    } catch (error) {
      console.error("Search error:", error);
      toast.error("查詢失敗，請稍後再試 / Search failed, please try again later");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchByCustomer = async () => {
    setIsLoading(true);
    setHasSearched(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lookup-rma?customer_name=${encodeURIComponent(customerName.trim())}&customer_phone=${encodeURIComponent(phone.trim())}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 404) {
          toast.error("找不到符合的 RMA 申請 / No matching RMA found");
          setResults([]);
          return;
        }
        throw new Error(result.error || '查詢失敗 / Search failed');
      }

      const rmaResults = result.results as RmaResult[];
      setResults(rmaResults);

      if (rmaResults.length === 1) {
        setSelectedRma(rmaResults[0]);
      } else if (rmaResults.length === 0) {
        toast.error("找不到符合的 RMA 申請 / No matching RMA found");
      }
    } catch (error) {
      console.error("Search error:", error);
      toast.error("查詢失敗，請稍後再試 / Search failed, please try again later");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSelectedRma(null);

    if (activeTab === "customer") {
      if (!customerName.trim() || !phone.trim()) {
        toast.error("請填寫完整的客戶資訊 / Please fill in all customer information");
        return;
      }
      handleSearchByCustomer();
    } else {
      if (!rmaNumber.trim()) {
        toast.error("請輸入RMA編號 / Please enter RMA number");
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
            返回首頁 / Home
          </Link>

          <div className="flex items-center gap-3">
            <span className="font-semibold text-foreground">RMA 狀態追蹤 / Status Tracking</span>
            <Link
              to="/shipping"
              className="inline-flex items-center gap-2 px-4 py-2 bg-card text-foreground text-sm font-medium rounded-lg border border-border hover:bg-secondary transition-colors"
            >
              <Globe className="w-4 h-4" />
              新增寄件資訊 / Add Shipping Info
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
                    查詢保固服務進度狀態
                    <br />
                    <span className="text-muted-foreground text-base font-normal">Track Warranty Service Status</span>
                  </h1>
                  <p className="text-muted-foreground">
                    請輸入您的相關資訊，查看您的保固服務進度
                    <br />
                    <span className="text-sm">Enter your information to view warranty service progress</span>
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
                    使用客戶資訊查詢 / Search by Customer Info
                  </button>
                  <button
                    onClick={() => { setActiveTab("rma"); resetSearch(); }}
                    className={`flex-1 py-3 px-4 text-sm font-medium rounded-md transition-all ${
                      activeTab === "rma"
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    使用RMA編號查詢 / Search by RMA Number
                  </button>
                </div>

                {/* Forms */}
                <form onSubmit={handleSearch}>
                  {activeTab === "customer" ? (
                    <div className="space-y-4">
                      <div>
                        <label className="rma-label">客戶姓名 / Customer Name</label>
                        <input
                          type="text"
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          placeholder="請輸入您的姓名 / Enter your name"
                          className="rma-input"
                        />
                      </div>
                      <div>
                        <label className="rma-label">電話號碼 / Phone Number</label>
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="請輸入您的電話號碼 / Enter your phone number"
                          className="rma-input"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="rma-label">RMA編號 / RMA Number</label>
                        <input
                          type="text"
                          value={rmaNumber}
                          onChange={(e) => setRmaNumber(e.target.value)}
                          placeholder="請輸入您的RMA編號 / Enter your RMA number"
                          className="rma-input"
                        />
                        <p className="text-xs text-muted-foreground mt-2">
                          輸入RMA編號時，可以省略中間的「-」符號
                          <br />
                          You may omit the dash (-) in the RMA number
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
                        查詢中... / Searching...
                      </>
                    ) : (
                      <>
                        <Search className="w-5 h-5" />
                        查詢 / Search
                      </>
                    )}
                  </button>
                </form>

                {/* Multiple Results */}
                {hasSearched && results.length > 1 && (
                  <div className="mt-8 pt-6 border-t border-border">
                    <h3 className="text-lg font-semibold text-foreground mb-4">找到 {results.length} 筆申請 / Found {results.length} request(s)</h3>
                    <div className="space-y-3">
                      {results.map((rma) => (
                        <button
                          key={rma.id}
                          onClick={() => setSelectedRma(rma)}
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
                  onClick={() => { setSelectedRma(null); }}
                  className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  返回搜尋 / Back to Search
                </button>

                {/* Status Card */}
                <div className="rma-card">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <p className="text-sm text-muted-foreground">RMA 編號 / RMA Number</p>
                      <p className="text-2xl font-mono font-bold text-primary">{selectedRma.rma_number}</p>
                    </div>
                    <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${statusColors[selectedRma.status]}`}>
                      {statusIcons[selectedRma.status]}
                      <span className="font-medium">{statusLabels[selectedRma.status]}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                    <div>
                      <p className="text-sm text-muted-foreground">產品名稱 / Product Name</p>
                      <p className="text-foreground">{selectedRma.product_name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">產品型號 / Product Model</p>
                      <p className="text-foreground">{selectedRma.product_model || "-"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">問題類型 / Issue Type</p>
                      <p className="text-foreground">{selectedRma.issue_type}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">建立日期 / Submitted</p>
                      <p className="text-foreground">{formatDate(selectedRma.created_at)}</p>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-border text-xs text-muted-foreground">
                    📋 保固政策說明 / Warranty Policy:
                    <a
                      href="https://crestdiving.com/blogs/crest-news/crest-warranty-repair-policy-update"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline ml-1"
                    >
                      查看 CREST 官方保固維修政策公告 / View CREST Warranty Policy
                    </a>
                  </div>
                </div>

                {/* Status Timeline */}
                <div className="rma-card">
                  <h3 className="text-lg font-semibold text-foreground mb-6">進度歷史 / Status History</h3>
                  
                  {selectedRma.status_history.length === 0 ? (
                    <div className="text-center py-8">
                      <Clock className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                      <p className="text-muted-foreground">尚無狀態更新記錄 / No status updates yet</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        目前狀態 / Current status: {statusLabels[selectedRma.status]}
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
                            <p className="text-sm text-muted-foreground">目前狀態 / Current Status</p>
                          </div>
                        </div>

                        {/* History */}
                        {selectedRma.status_history.map((history) => (
                          <div key={history.id} className="relative flex items-start gap-4">
                            <div className="relative z-10 w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                              {statusIcons[history.status]}
                            </div>
                            <div className="flex-1 pt-1">
                              <p className="font-medium text-foreground">{statusLabels[history.status]}</p>
                              <p className="text-sm text-muted-foreground">
                                {formatDate(history.created_at)}
                              </p>
                              {history.notes && (
                                <p className="text-sm text-muted-foreground mt-1">{history.notes}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Contact Info (Masked) */}
                <div className="rma-card">
                  <h3 className="text-lg font-semibold text-foreground mb-4">聯絡資訊 / Contact Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">客戶姓名 / Customer Name</p>
                      <p className="text-foreground">{selectedRma.customer_name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">電話 / Phone</p>
                      <p className="text-foreground">{selectedRma.customer_phone}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Email</p>
                      <p className="text-foreground">{selectedRma.customer_email}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-4">
                    * 為保護您的隱私，部分資訊已遮蔽
                    <br />
                    * For privacy protection, some information is masked
                  </p>
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
