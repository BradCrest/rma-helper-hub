import { useState, useRef } from "react";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

interface RmaData {
  rma_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  mobile_phone?: string;
  customer_address?: string;
  product_name: string;
  product_model?: string;
  serial_number?: string;
  purchase_date?: string;
  issue_type: string;
  issue_description: string;
  status: string;
  created_at: string;
}

interface RmaDetailDialogProps {
  rmaNumber: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const RmaDetailDialog = ({ rmaNumber, open, onOpenChange }: RmaDetailDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [rmaData, setRmaData] = useState<RmaData | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const fetchRmaData = async () => {
    if (!rmaNumber) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("lookup-rma", {
        body: { rmaNumber },
      });

      if (error) throw error;
      if (data) {
        setRmaData(data);
      }
    } catch (error) {
      console.error("Error fetching RMA:", error);
      toast.error("無法載入 RMA 資料");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen && rmaNumber) {
      fetchRmaData();
    } else {
      setRmaData(null);
    }
    onOpenChange(isOpen);
  };

  const handlePrint = () => {
    const printContent = contentRef.current;
    if (!printContent) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("無法開啟列印視窗");
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>RMA ${rmaData?.rma_number}</title>
          <style>
            body { font-family: sans-serif; padding: 20px; }
            .header { text-align: center; margin-bottom: 20px; }
            .section { margin-bottom: 16px; }
            .section-title { font-weight: bold; margin-bottom: 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
            .item { margin-bottom: 4px; }
            .label { color: #666; font-size: 12px; }
            .value { font-size: 14px; }
            .rma-number { font-size: 24px; font-weight: bold; color: #0066cc; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>RMA 維修申請確認</h1>
            <div class="rma-number">${rmaData?.rma_number}</div>
            <p>申請時間：${formatDate(rmaData?.created_at || "")}</p>
          </div>
          <div class="section">
            <div class="section-title">客戶資訊</div>
            <div class="grid">
              <div class="item"><span class="label">姓名：</span><span class="value">${rmaData?.customer_name}</span></div>
              <div class="item"><span class="label">Email：</span><span class="value">${rmaData?.customer_email}</span></div>
              <div class="item"><span class="label">電話：</span><span class="value">${rmaData?.customer_phone}</span></div>
              <div class="item"><span class="label">手機：</span><span class="value">${rmaData?.mobile_phone || "-"}</span></div>
              <div class="item"><span class="label">地址：</span><span class="value">${rmaData?.customer_address || "-"}</span></div>
            </div>
          </div>
          <div class="section">
            <div class="section-title">產品資訊</div>
            <div class="grid">
              <div class="item"><span class="label">產品名稱：</span><span class="value">${rmaData?.product_name}</span></div>
              <div class="item"><span class="label">產品型號：</span><span class="value">${rmaData?.product_model || "-"}</span></div>
              <div class="item"><span class="label">產品序號：</span><span class="value">${rmaData?.serial_number || "-"}</span></div>
              <div class="item"><span class="label">購買日期：</span><span class="value">${rmaData?.purchase_date || "-"}</span></div>
            </div>
          </div>
          <div class="section">
            <div class="section-title">問題描述</div>
            <p>${rmaData?.issue_description}</p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const handleDownloadPdf = async () => {
    if (!contentRef.current || !rmaData) return;

    setGeneratingPdf(true);
    try {
      const canvas = await html2canvas(contentRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(`RMA_${rmaData.rma_number}.pdf`);
      toast.success("PDF 下載成功");
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("PDF 生成失敗");
    } finally {
      setGeneratingPdf(false);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>RMA 詳細資訊</span>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : rmaData ? (
          <>
            <div ref={contentRef} className="space-y-6 p-4 bg-background">
              {/* RMA Number */}
              <div className="text-center pb-4 border-b">
                <p className="text-sm text-muted-foreground mb-1">RMA 編號</p>
                <p className="text-2xl font-bold font-mono text-primary">
                  {rmaData.rma_number}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  申請時間：{formatDate(rmaData.created_at)}
                </p>
              </div>

              {/* Customer Info */}
              <div>
                <h3 className="font-semibold mb-3 text-foreground border-b pb-2">
                  客戶資訊
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">姓名</p>
                    <p className="font-medium">{rmaData.customer_name}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Email</p>
                    <p className="font-medium">{rmaData.customer_email}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">電話</p>
                    <p className="font-medium">{rmaData.customer_phone}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">手機</p>
                    <p className="font-medium">{rmaData.mobile_phone || "-"}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted-foreground">地址</p>
                    <p className="font-medium">{rmaData.customer_address || "-"}</p>
                  </div>
                </div>
              </div>

              {/* Product Info */}
              <div>
                <h3 className="font-semibold mb-3 text-foreground border-b pb-2">
                  產品資訊
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">產品名稱</p>
                    <p className="font-medium">{rmaData.product_name}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">產品型號</p>
                    <p className="font-medium">{rmaData.product_model || "-"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">產品序號</p>
                    <p className="font-medium">{rmaData.serial_number || "-"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">購買日期</p>
                    <p className="font-medium">{rmaData.purchase_date || "-"}</p>
                  </div>
                </div>
              </div>

              {/* Issue Description */}
              <div>
                <h3 className="font-semibold mb-3 text-foreground border-b pb-2">
                  問題描述
                </h3>
                <p className="text-sm whitespace-pre-wrap">
                  {rmaData.issue_description}
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-center gap-3 pt-4 border-t">
              <Button
                variant="outline"
                onClick={handlePrint}
                className="gap-2"
              >
                <Printer className="w-4 h-4" />
                列印
              </Button>
              <Button
                variant="outline"
                onClick={handleDownloadPdf}
                disabled={generatingPdf}
                className="gap-2"
              >
                <Download className="w-4 h-4" />
                {generatingPdf ? "生成中..." : "下載 PDF"}
              </Button>
            </div>
          </>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            無法載入 RMA 資料
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default RmaDetailDialog;
