import { useEffect, useState, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Printer, Download, ArrowLeft, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

interface RmaData {
  rma_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_address: string | null;
  product_name: string;
  product_model: string | null;
  serial_number: string | null;
  issue_type: string;
  issue_description: string;
  purchase_date: string | null;
  created_at: string;
  status: string;
}

const RmaConfirmation = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [rmaData, setRmaData] = useState<RmaData | null>(null);
  const [loading, setLoading] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);

  const rmaNumber = searchParams.get("rma");

  useEffect(() => {
    const fetchRmaData = async () => {
      if (!rmaNumber) {
        navigate("/");
        return;
      }

      const { data, error } = await supabase
        .from("rma_requests")
        .select("*")
        .eq("rma_number", rmaNumber)
        .single();

      if (error || !data) {
        navigate("/");
        return;
      }

      setRmaData(data);
      setLoading(false);
    };

    fetchRmaData();
  }, [rmaNumber, navigate]);

  const handlePrint = () => {
    window.print();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!rmaData) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="rma-container py-8">
        {/* Action buttons - hidden when printing */}
        <div className="print:hidden mb-6 flex flex-wrap gap-3">
          <button
            onClick={() => navigate("/")}
            className="rma-btn-secondary flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            返回首頁
          </button>
          <button
            onClick={handlePrint}
            className="rma-btn-primary flex items-center gap-2"
          >
            <Printer className="w-4 h-4" />
            列印
          </button>
          <button
            onClick={() => navigate(`/track?rma=${rmaData.rma_number}`)}
            className="rma-btn-secondary flex items-center gap-2"
          >
            查詢維修狀態
          </button>
        </div>

        {/* Printable content */}
        <div ref={printRef} className="rma-card print:shadow-none print:border-none">
          {/* Success header */}
          <div className="text-center mb-8 pb-6 border-b border-border">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
              <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">
              RMA 申請已成功提交
            </h1>
            <p className="text-muted-foreground">
              請保留此頁面資訊以便查詢維修進度
            </p>
          </div>

          {/* RMA Number highlight */}
          <div className="bg-primary/10 rounded-lg p-6 mb-8 text-center">
            <p className="text-sm text-muted-foreground mb-1">RMA 申請編號</p>
            <p className="text-3xl font-bold text-primary tracking-wider">
              {rmaData.rma_number}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              申請時間：{formatDate(rmaData.created_at)}
            </p>
          </div>

          {/* Customer Information */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-foreground mb-4 pb-2 border-b border-border">
              客戶資訊
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">姓名</p>
                <p className="text-foreground font-medium">{rmaData.customer_name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">電子郵件</p>
                <p className="text-foreground font-medium">{rmaData.customer_email}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">電話</p>
                <p className="text-foreground font-medium">{rmaData.customer_phone}</p>
              </div>
              {rmaData.customer_address && (
                <div>
                  <p className="text-sm text-muted-foreground">地址</p>
                  <p className="text-foreground font-medium">{rmaData.customer_address}</p>
                </div>
              )}
            </div>
          </div>

          {/* Product Information */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-foreground mb-4 pb-2 border-b border-border">
              產品資訊
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">產品名稱</p>
                <p className="text-foreground font-medium">{rmaData.product_name}</p>
              </div>
              {rmaData.product_model && (
                <div>
                  <p className="text-sm text-muted-foreground">產品型號</p>
                  <p className="text-foreground font-medium">{rmaData.product_model}</p>
                </div>
              )}
              {rmaData.serial_number && (
                <div>
                  <p className="text-sm text-muted-foreground">序號</p>
                  <p className="text-foreground font-medium">{rmaData.serial_number}</p>
                </div>
              )}
              {rmaData.purchase_date && (
                <div>
                  <p className="text-sm text-muted-foreground">購買日期</p>
                  <p className="text-foreground font-medium">{rmaData.purchase_date}</p>
                </div>
              )}
            </div>
          </div>

          {/* Issue Information */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-foreground mb-4 pb-2 border-b border-border">
              問題描述
            </h2>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">故障類型</p>
                <p className="text-foreground font-medium">{rmaData.issue_type}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">詳細描述</p>
                <p className="text-foreground whitespace-pre-wrap">{rmaData.issue_description}</p>
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-muted/50 rounded-lg p-4 print:bg-gray-100">
            <h3 className="font-semibold text-foreground mb-2">後續步驟</h3>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>請將產品妥善包裝，附上此 RMA 編號</li>
              <li>寄送至指定維修中心</li>
              <li>我們收到產品後會盡快處理並更新狀態</li>
              <li>您可以隨時使用 RMA 編號查詢維修進度</li>
            </ol>
          </div>
        </div>
      </main>

      <Footer />

      {/* Print styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .rma-card, .rma-card * {
            visibility: visible;
          }
          .rma-card {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 20px;
          }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
};

export default RmaConfirmation;
