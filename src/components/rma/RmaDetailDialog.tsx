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
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

interface RmaData {
  rma_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  mobile_phone?: string;
  customer_address?: string;
  customer_type?: string;
  product_name: string;
  product_model?: string;
  serial_number?: string;
  purchase_date?: string;
  warranty_date?: string;
  issue_type: string;
  issue_description: string;
  customer_notes?: string;
  status: string;
  created_at: string;
  photo_urls?: string[];
}

interface RmaDetailDialogProps {
  rmaNumber: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Escape HTML to prevent XSS when interpolating customer-submitted data into innerHTML
const esc = (s?: string | number | null): string => {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const RmaDetailDialog = ({ rmaNumber, open, onOpenChange }: RmaDetailDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [rmaData, setRmaData] = useState<RmaData | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const fetchRmaData = async () => {
    if (!rmaNumber) return;
    
    setLoading(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      
      const response = await fetch(
        `${supabaseUrl}/functions/v1/lookup-rma?rma_number=${encodeURIComponent(rmaNumber)}&full_details=true`,
        {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${supabaseKey}`,
            "apikey": supabaseKey,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch RMA data");
      }

      const result = await response.json();
      
      if (result.results && result.results.length > 0) {
        setRmaData(result.results[0]);
      } else {
        throw new Error("RMA not found");
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
    if (!rmaData) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("無法開啟列印視窗");
      return;
    }

    printWindow.document.write(generatePrintHtml(rmaData));
    printWindow.document.close();
    printWindow.print();
  };

  const generatePrintHtml = (data: RmaData) => `
    <!DOCTYPE html>
    <html>
      <head>
        <title>RMA ${data.rma_number}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { 
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
            padding: 40px; 
            color: #333;
            line-height: 1.5;
          }
          .container { max-width: 800px; margin: 0 auto; }
          .header { 
            text-align: center; 
            padding-bottom: 24px; 
            margin-bottom: 24px;
            border-bottom: 2px solid #0066cc;
          }
          .logo-text { 
            font-size: 24px; 
            font-weight: bold; 
            color: #0066cc;
            margin-bottom: 8px;
          }
          .title { font-size: 20px; color: #333; margin-bottom: 16px; }
          .rma-number { 
            font-size: 32px; 
            font-weight: bold; 
            color: #0066cc; 
            font-family: monospace;
            background: #f0f7ff;
            padding: 12px 24px;
            border-radius: 8px;
            display: inline-block;
          }
          .meta { font-size: 14px; color: #666; margin-top: 12px; }
          .section { 
            margin-bottom: 24px; 
            background: #fafafa;
            border-radius: 8px;
            padding: 20px;
          }
          .section-title { 
            font-size: 16px;
            font-weight: 600; 
            color: #0066cc;
            margin-bottom: 16px; 
            padding-bottom: 8px;
            border-bottom: 1px solid #e0e0e0;
          }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
          .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
          .item { }
          .label { font-size: 12px; color: #888; margin-bottom: 4px; }
          .value { font-size: 14px; font-weight: 500; color: #333; }
          .full-width { grid-column: 1 / -1; }
          .description-box {
            background: #fff;
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            padding: 16px;
            font-size: 14px;
            white-space: pre-wrap;
            min-height: 60px;
          }
          .footer {
            margin-top: 32px;
            padding-top: 16px;
            border-top: 1px solid #ddd;
            text-align: center;
            font-size: 12px;
            color: #888;
          }
          .status-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 16px;
            font-size: 12px;
            font-weight: 500;
            background: #e8f5e9;
            color: #2e7d32;
          }
          @media print {
            body { padding: 20px; }
            .section { break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo-text">RMA 保固服務申請單</div>
            <div class="rma-number">${data.rma_number}</div>
            <div class="meta">
              申請時間：${formatDate(data.created_at)} ｜ 狀態：<span class="status-badge">${getStatusLabel(data.status)}</span>
            </div>
          </div>

          <div class="section">
            <div class="section-title">客戶資訊</div>
            <div class="grid">
              <div class="item">
                <div class="label">客戶姓名</div>
                <div class="value">${data.customer_name}</div>
              </div>
              <div class="item">
                <div class="label">客戶類型</div>
                <div class="value">${data.customer_type || "一般客戶"}</div>
              </div>
              <div class="item">
                <div class="label">電子郵件</div>
                <div class="value">${data.customer_email}</div>
              </div>
              <div class="item">
                <div class="label">聯絡電話</div>
                <div class="value">${data.customer_phone}</div>
              </div>
              <div class="item">
                <div class="label">手機號碼</div>
                <div class="value">${data.mobile_phone || "-"}</div>
              </div>
              <div class="item full-width">
                <div class="label">聯絡地址</div>
                <div class="value">${data.customer_address || "-"}</div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">產品資訊</div>
            <div class="grid">
              <div class="item">
                <div class="label">產品名稱</div>
                <div class="value">${data.product_name}</div>
              </div>
              <div class="item">
                <div class="label">產品型號</div>
                <div class="value">${data.product_model || "-"}</div>
              </div>
              <div class="item">
                <div class="label">產品序號</div>
                <div class="value">${data.serial_number || "-"}</div>
              </div>
              <div class="item">
                <div class="label">購買日期</div>
                <div class="value">${data.purchase_date || "-"}</div>
              </div>
              <div class="item">
                <div class="label">保固到期日</div>
                <div class="value">${data.warranty_date || "-"}</div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">問題描述</div>
            <div class="description-box">${data.issue_description || "-"}</div>
          </div>

          ${data.customer_notes ? `
          <div class="section">
            <div class="section-title">隨附物品 / 備註</div>
            <div class="description-box">${data.customer_notes}</div>
          </div>
          ` : ""}

          <div class="footer">
            <p>此文件為 RMA 保固服務申請確認單，請妥善保存。</p>
            <p>如有任何問題，請聯繫客服中心。</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const generatePdfHtml = (data: RmaData): string => {
    const notesSection = data.customer_notes ? `
      <div style="background: #fafafa; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
        <div style="font-size: 16px; font-weight: 600; color: #0066cc; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid #e0e0e0;">隨附物品 / 備註</div>
        <div style="background: #fff; border: 1px solid #e0e0e0; border-radius: 6px; padding: 16px; font-size: 14px; white-space: pre-wrap;">${data.customer_notes}</div>
      </div>
    ` : "";

    return `
    <div style="width: 794px; min-height: 1123px; padding: 40px; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Microsoft JhengHei', 'PingFang SC', sans-serif; color: #333; background: white;">
      <div style="background: linear-gradient(135deg, #0066cc, #0052a3); padding: 24px; border-radius: 12px; margin-bottom: 24px; text-align: center;">
        <div style="color: white; font-size: 20px; font-weight: 600; margin-bottom: 8px;">RMA 保固服務申請單</div>
        <div style="color: white; font-size: 28px; font-weight: bold; font-family: monospace;">${data.rma_number}</div>
      </div>
      
      <div style="display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 14px; color: #666;">
        <span>申請時間：${formatDate(data.created_at)}</span>
        <span style="background: #e8f5e9; color: #2e7d32; padding: 4px 12px; border-radius: 16px; font-size: 12px;">${getStatusLabel(data.status)}</span>
      </div>

      <div style="background: #fafafa; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
        <div style="font-size: 16px; font-weight: 600; color: #0066cc; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid #e0e0e0;">客戶資訊</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div><div style="font-size: 12px; color: #888; margin-bottom: 4px;">客戶姓名</div><div style="font-size: 14px; font-weight: 500;">${data.customer_name}</div></div>
          <div><div style="font-size: 12px; color: #888; margin-bottom: 4px;">客戶類型</div><div style="font-size: 14px; font-weight: 500;">${data.customer_type || "一般客戶"}</div></div>
          <div><div style="font-size: 12px; color: #888; margin-bottom: 4px;">電子郵件</div><div style="font-size: 14px; font-weight: 500;">${data.customer_email}</div></div>
          <div><div style="font-size: 12px; color: #888; margin-bottom: 4px;">聯絡電話</div><div style="font-size: 14px; font-weight: 500;">${data.customer_phone}</div></div>
          <div><div style="font-size: 12px; color: #888; margin-bottom: 4px;">手機號碼</div><div style="font-size: 14px; font-weight: 500;">${data.mobile_phone || "-"}</div></div>
          <div style="grid-column: 1 / -1;"><div style="font-size: 12px; color: #888; margin-bottom: 4px;">聯絡地址</div><div style="font-size: 14px; font-weight: 500;">${data.customer_address || "-"}</div></div>
        </div>
      </div>

      <div style="background: #fafafa; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
        <div style="font-size: 16px; font-weight: 600; color: #0066cc; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid #e0e0e0;">產品資訊</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div><div style="font-size: 12px; color: #888; margin-bottom: 4px;">產品名稱</div><div style="font-size: 14px; font-weight: 500;">${data.product_name}</div></div>
          <div><div style="font-size: 12px; color: #888; margin-bottom: 4px;">產品型號</div><div style="font-size: 14px; font-weight: 500;">${data.product_model || "-"}</div></div>
          <div><div style="font-size: 12px; color: #888; margin-bottom: 4px;">產品序號</div><div style="font-size: 14px; font-weight: 500;">${data.serial_number || "-"}</div></div>
          <div><div style="font-size: 12px; color: #888; margin-bottom: 4px;">購買日期</div><div style="font-size: 14px; font-weight: 500;">${data.purchase_date || "-"}</div></div>
          <div><div style="font-size: 12px; color: #888; margin-bottom: 4px;">保固到期日</div><div style="font-size: 14px; font-weight: 500;">${data.warranty_date || "-"}</div></div>
        </div>
      </div>

      <div style="background: #fafafa; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
        <div style="font-size: 16px; font-weight: 600; color: #0066cc; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid #e0e0e0;">問題描述</div>
        <div style="background: #fff; border: 1px solid #e0e0e0; border-radius: 6px; padding: 16px; font-size: 14px; white-space: pre-wrap; min-height: 60px;">${data.issue_description || "-"}</div>
      </div>

      ${notesSection}

      <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #ddd; text-align: center; font-size: 12px; color: #888;">
        <p>此文件為 RMA 保固服務申請確認單，請妥善保存。</p>
        <p>如有任何問題，請聯繫客服中心。</p>
      </div>
    </div>
  `;
  };

  const handleDownloadPdf = async () => {
    if (!rmaData) return;

    setGeneratingPdf(true);
    try {
      const container = document.createElement("div");
      container.style.cssText = "position: absolute; left: -9999px; top: 0;";
      document.body.appendChild(container);

      container.innerHTML = generatePdfHtml(rmaData);

      const canvas = await html2canvas(container.firstElementChild as HTMLElement, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });

      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, "JPEG", 0, 0, imgWidth, Math.min(imgHeight, pdfHeight));

      document.body.removeChild(container);

      pdf.save(`RMA_${rmaData.rma_number}.pdf`);
      toast.success("PDF 下載成功");
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("PDF 生成失敗");
    } finally {
      setGeneratingPdf(false);
    }
  };

  const formatDate = (dateString: string): string => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusLabel = (status: string): string => {
    const statusMap: Record<string, string> = {
      registered: "已登記",
      shipped: "已寄出",
      received: "已收件",
      inspecting: "檢測中",
      contacting: "聯繫客戶中",
      quote_confirmed: "報價確認",
      paid: "已付款",
      no_repair: "不維修",
      repairing: "維修中",
      shipped_back: "已寄回",
      shipped_back_refurbished: "已寄回(整新品)",
      shipped_back_original: "已寄回(原機)",
      shipped_back_new: "已寄回(新品)",
      follow_up: "售後追蹤",
      closed: "已結案",
      unknown: "未知",
    };
    return statusMap[status] || status;
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
              <div className="space-y-3">
                <h3 className="font-semibold text-lg border-b pb-2">客戶資訊</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">客戶姓名</p>
                    <p className="font-medium">{rmaData.customer_name}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">客戶類型</p>
                    <p className="font-medium">{rmaData.customer_type || "一般客戶"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">電子郵件</p>
                    <p className="font-medium">{rmaData.customer_email}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">聯絡電話</p>
                    <p className="font-medium">{rmaData.customer_phone}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">手機號碼</p>
                    <p className="font-medium">{rmaData.mobile_phone || "-"}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted-foreground">聯絡地址</p>
                    <p className="font-medium">{rmaData.customer_address || "-"}</p>
                  </div>
                </div>
              </div>

              {/* Product Info */}
              <div className="space-y-3">
                <h3 className="font-semibold text-lg border-b pb-2">產品資訊</h3>
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
                  <div>
                    <p className="text-muted-foreground">保固到期日</p>
                    <p className="font-medium">{rmaData.warranty_date || "-"}</p>
                  </div>
                </div>
              </div>

              {/* Issue Description */}
              <div className="space-y-3">
                <h3 className="font-semibold text-lg border-b pb-2">問題描述</h3>
                <div className="bg-muted/50 rounded-lg p-4">
                  <p className="text-sm whitespace-pre-wrap">{rmaData.issue_description}</p>
                </div>
              </div>

              {/* Customer Notes */}
              {rmaData.customer_notes && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg border-b pb-2">隨附物品 / 備註</h3>
                  <div className="bg-muted/50 rounded-lg p-4">
                    <p className="text-sm whitespace-pre-wrap">{rmaData.customer_notes}</p>
                  </div>
                </div>
              )}

              {/* Status */}
              <div className="pt-4 border-t">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">目前狀態</span>
                  <span className="px-3 py-1 rounded-full text-sm font-medium bg-primary/10 text-primary">
                    {getStatusLabel(rmaData.status)}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t">
              <Button variant="outline" onClick={handlePrint} className="flex-1 gap-2">
                <Printer className="w-4 h-4" />
                列印
              </Button>
              <Button 
                onClick={handleDownloadPdf} 
                disabled={generatingPdf}
                className="flex-1 gap-2"
              >
                <Download className="w-4 h-4" />
                {generatingPdf ? "生成中..." : "下載 PDF"}
              </Button>
            </div>
          </>
        ) : (
          <div className="py-12 text-center text-muted-foreground">
            無法載入 RMA 資料
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default RmaDetailDialog;
