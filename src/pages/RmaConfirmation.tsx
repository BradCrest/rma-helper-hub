import { useEffect, useState, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Printer, Download, ArrowLeft, CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
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
  photo_urls: string[] | null;
}

const RmaConfirmation = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [rmaData, setRmaData] = useState<RmaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const rmaNumber = searchParams.get("rma");

  useEffect(() => {
    const fetchRmaData = async () => {
      if (!rmaNumber) {
        navigate("/");
        return;
      }

      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lookup-rma?rma_number=${encodeURIComponent(rmaNumber)}&full_details=true`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );

        const result = await response.json();

        if (!response.ok || !result.results || result.results.length === 0) {
          navigate("/");
          return;
        }

        const rma = result.results[0];
        setRmaData({
          rma_number: rma.rma_number,
          customer_name: rma.customer_name,
          customer_email: rma.customer_email,
          customer_phone: rma.customer_phone,
          customer_address: rma.customer_address,
          product_name: rma.product_name,
          product_model: rma.product_model,
          serial_number: rma.serial_number,
          issue_type: rma.issue_type,
          issue_description: rma.issue_description || '',
          purchase_date: rma.purchase_date,
          created_at: rma.created_at,
          status: rma.status,
          photo_urls: rma.photo_urls,
        });
        setLoading(false);
      } catch (error) {
        console.error("Error fetching RMA data:", error);
        navigate("/");
      }
    };

    fetchRmaData();
  }, [rmaNumber, navigate]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    if (!printRef.current || !rmaData) return;

    const w = window as any;
    const html2canvasFn = w.html2canvas as any;
    const JsPdfCtor = (w.jspdf && w.jspdf.jsPDF) || w.jsPDF;

    if (!html2canvasFn || !JsPdfCtor) {
      toast.error("PDF 元件尚未載入，請重新整理後再試 / PDF component not loaded, please refresh");
      return;
    }

    setGeneratingPdf(true);
    try {
      const canvas = await html2canvasFn(printRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new JsPdfCtor({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const imgWidth = 210;
      const pageHeight = 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`${rmaData.rma_number}.pdf`);
      toast.success("已下載 PDF / PDF downloaded");
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("PDF 產生失敗，請稍後再試 / PDF generation failed, please try again");
    } finally {
      setGeneratingPdf(false);
    }
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
            返回首頁 / Home
          </button>
          <button
            onClick={handlePrint}
            className="rma-btn-primary flex items-center gap-2"
          >
            <Printer className="w-4 h-4" />
            列印 / Print
          </button>
          <button
            onClick={handleDownloadPdf}
            disabled={generatingPdf}
            className="rma-btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            {generatingPdf ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                產生中… / Generating…
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                下載 PDF / Download PDF
              </>
            )}
          </button>
          <button
            onClick={() => navigate(`/track?rma=${rmaData.rma_number}`)}
            className="rma-btn-secondary flex items-center gap-2"
          >
            查詢保固服務狀態 / Track Status
          </button>
        </div>

        {/* Printable content */}
        <div ref={printRef} className="rma-card print:shadow-none print:border-none">
          {/* Success header */}
          <div className="text-center mb-8 pb-6 border-b border-border">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
              <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-1">
              RMA 申請已成功提交
            </h1>
            <p className="text-base text-muted-foreground mb-1">
              Your RMA Application Has Been Successfully Submitted
            </p>
            <p className="text-sm text-muted-foreground">
              請保留此頁面資訊以便查詢保固服務進度<br />
              Please save this page for future reference to track your service status.
            </p>
          </div>

          {/* RMA Number highlight */}
          <div className="bg-primary/10 rounded-lg p-6 mb-8 text-center">
            <p className="text-sm text-muted-foreground mb-1">RMA 申請編號 / RMA Number</p>
            <p className="text-3xl font-bold text-primary tracking-wider">
              {rmaData.rma_number}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              申請時間 / Submitted：{formatDate(rmaData.created_at)}
            </p>
          </div>

          {/* Customer Information */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-foreground mb-4 pb-2 border-b border-border">
              客戶資訊 / Customer Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">姓名 / Name</p>
                <p className="text-foreground font-medium">{rmaData.customer_name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">電子郵件 / Email</p>
                <p className="text-foreground font-medium">{rmaData.customer_email}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">電話 / Phone</p>
                <p className="text-foreground font-medium">{rmaData.customer_phone}</p>
              </div>
              {rmaData.customer_address && (
                <div>
                  <p className="text-sm text-muted-foreground">地址 / Address</p>
                  <p className="text-foreground font-medium">{rmaData.customer_address}</p>
                </div>
              )}
            </div>
          </div>

          {/* Product Information */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-foreground mb-4 pb-2 border-b border-border">
              產品資訊 / Product Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">產品名稱 / Product</p>
                <p className="text-foreground font-medium">{rmaData.product_name}</p>
              </div>
              {rmaData.product_model && (
                <div>
                  <p className="text-sm text-muted-foreground">產品型號 / Model</p>
                  <p className="text-foreground font-medium">{rmaData.product_model}</p>
                </div>
              )}
              {rmaData.serial_number && (
                <div>
                  <p className="text-sm text-muted-foreground">序號 / Serial No.</p>
                  <p className="text-foreground font-medium">{rmaData.serial_number}</p>
                </div>
              )}
              {rmaData.purchase_date && (
                <div>
                  <p className="text-sm text-muted-foreground">購買日期 / Purchase Date</p>
                  <p className="text-foreground font-medium">{rmaData.purchase_date}</p>
                </div>
              )}
            </div>
          </div>

          {/* Issue Information */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-foreground mb-4 pb-2 border-b border-border">
              問題描述 / Issue Description
            </h2>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">故障類型 / Issue Type</p>
                <p className="text-foreground font-medium">{rmaData.issue_type}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">詳細描述 / Details</p>
                <p className="text-foreground whitespace-pre-wrap">{rmaData.issue_description}</p>
              </div>
            </div>
          </div>

          {/* Uploaded Photos */}
          {rmaData.photo_urls && rmaData.photo_urls.length > 0 && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-foreground mb-4 pb-2 border-b border-border">
                上傳照片 / Uploaded Photos
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {rmaData.photo_urls.map((url, index) => (
                  <div key={index} className="aspect-square rounded-lg border border-border overflow-hidden bg-muted">
                    <img
                      src={url}
                      alt={`產品照片 ${index + 1} / Product Photo ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Next Steps */}
          <div className="bg-muted/50 rounded-lg p-4 print:bg-gray-100">
            <h3 className="font-semibold text-foreground mb-2">後續步驟 / Next Steps</h3>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>請將產品妥善包裝，附上此 RMA 編號 / Pack your product securely and include this RMA number.</li>
              <li>寄送至本公司收件地址：242039 新北市新莊區化成路11巷86號1樓（英文地址：No. 86, Ln. 11, Huacheng Rd., Xinzhuang Dist., New Taipei City, Taiwan, 242039）</li>
              <li>我們收到產品後會盡快處理並更新狀態 / We will process your product and update the status once received.</li>
              <li>您可以隨時使用 RMA 編號查詢保固服務進度 / You can track your service status anytime using your RMA number.</li>
              <li>因人力因素及保固服務中心無對外開放，無法支援親送，敬請見諒。/ Due to manpower constraints, walk-in drop-offs are not accepted. Please ship via courier.</li>
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
