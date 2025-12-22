import { useState } from "react";
import { Link } from "react-router-dom";
import { Search, ArrowLeft, Globe } from "lucide-react";
import Footer from "@/components/layout/Footer";
import { toast } from "sonner";

type TabType = "customer" | "rma";

const Track = () => {
  const [activeTab, setActiveTab] = useState<TabType>("customer");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [rmaNumber, setRmaNumber] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeTab === "customer") {
      if (!customerName || !phone) {
        toast.error("請填寫完整的客戶資訊");
        return;
      }
      toast.info("正在查詢...");
    } else {
      if (!rmaNumber) {
        toast.error("請輸入RMA編號");
        return;
      }
      toast.info("正在查詢...");
    }
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
                  onClick={() => setActiveTab("customer")}
                  className={`flex-1 py-3 px-4 text-sm font-medium rounded-md transition-all ${
                    activeTab === "customer"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  使用客戶資訊查詢
                </button>
                <button
                  onClick={() => setActiveTab("rma")}
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
                        placeholder="請輸入您的姓名（至少兩個中文字或一個英文字）"
                        className="rma-input"
                      />
                    </div>
                    <div>
                      <label className="rma-label">電話號碼</label>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="請輸入您的電話號碼（至少8位數字）"
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
                  className="w-full mt-6 rma-btn-primary py-4 text-base"
                >
                  <Search className="w-5 h-5" />
                  查詢
                </button>
              </form>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Track;
