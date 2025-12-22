import { useState } from "react";
import { Link } from "react-router-dom";
import { Search, ArrowLeft, Globe, X } from "lucide-react";
import Footer from "@/components/layout/Footer";
import { toast } from "sonner";

const Shipping = () => {
  const [showModal, setShowModal] = useState(false);
  const [rmaNumber, setRmaNumber] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rmaNumber) {
      toast.error("請輸入RMA號碼");
      return;
    }
    toast.info("正在搜尋...");
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
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-card text-foreground text-sm font-medium rounded-lg border border-border hover:bg-secondary transition-colors"
            >
              <Globe className="w-4 h-4" />
              新增寄件資訊
            </button>
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
                <Link
                  to="/track"
                  className="flex-1 py-3 px-4 text-sm font-medium rounded-md text-muted-foreground hover:text-foreground text-center transition-all"
                >
                  使用客戶資訊查詢
                </Link>
                <button
                  className="flex-1 py-3 px-4 text-sm font-medium rounded-md bg-card text-foreground shadow-sm transition-all"
                >
                  使用RMA編號查詢
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSearch}>
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

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-foreground/50"
            onClick={() => setShowModal(false)}
          />
          <div className="relative bg-card rounded-xl p-6 w-full max-w-md shadow-xl animate-fade-in">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-xl font-bold text-foreground mb-2">
              輸入RMA號碼
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              請輸入已登記但尚未寄出的RMA號碼以新增寄件資訊
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!rmaNumber) {
                  toast.error("請輸入RMA號碼");
                  return;
                }
                toast.success("正在處理...");
                setShowModal(false);
              }}
            >
              <input
                type="text"
                value={rmaNumber}
                onChange={(e) => setRmaNumber(e.target.value)}
                placeholder="RMA號碼"
                className="rma-input mb-6"
              />

              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-6 py-2.5 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-secondary transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-colors"
                >
                  <Search className="w-4 h-4" />
                  搜尋
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Shipping;
