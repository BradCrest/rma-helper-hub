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

const RmaDetailDialog = ({ rmaNumber, open, onOpenChange }: RmaDetailDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [rmaData, setRmaData] = useState<RmaData | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const fetchRmaData = async () => {
    if (!rmaNumber) return;
    
    setLoading(true);
    try {
      // Use GET request with query params and full_details=true
      const { data, error } = await supabase.functions.invoke("lookup-rma", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        body: null,
      });

      // Fallback: call with URL params via fetch directly
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
            <div class="logo-text">RMA 維修服務申請單</div>
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
            <p>此文件為 RMA 維修申請確認單，請妥善保存。</p>
            <p>如有任何問題，請聯繫客服中心。</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const handleDownloadPdf = async () => {
    if (!rmaData) return;

    setGeneratingPdf(true);
    try {
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const margin = 20;
      const contentWidth = pageWidth - margin * 2;
      let y = 20;

      // Helper functions
      const addText = (text: string, x: number, yPos: number, options: any = {}) => {
        pdf.setFontSize(options.size || 10);
        pdf.setTextColor(options.color || "#333333");
        pdf.text(text, x, yPos, options);
        return yPos;
      };

      const addSection = (title: string) => {
        y += 8;
        pdf.setFillColor(240, 247, 255);
        pdf.roundedRect(margin, y - 4, contentWidth, 10, 2, 2, "F");
        pdf.setFontSize(12);
        pdf.setTextColor(0, 102, 204);
        pdf.text(title, margin + 4, y + 3);
        y += 14;
      };

      const addField = (label: string, value: string, x: number, width: number) => {
        pdf.setFontSize(9);
        pdf.setTextColor(136, 136, 136);
        pdf.text(label, x, y);
        y += 4;
        pdf.setFontSize(11);
        pdf.setTextColor(51, 51, 51);
        const lines = pdf.splitTextToSize(value || "-", width - 4);
        pdf.text(lines, x, y);
        y += lines.length * 5;
      };

      // Header
      pdf.setFillColor(0, 102, 204);
      pdf.rect(0, 0, pageWidth, 45, "F");
      
      pdf.setFontSize(18);
      pdf.setTextColor(255, 255, 255);
      pdf.text("RMA 維修服務申請單", pageWidth / 2, 18, { align: "center" });
      
      pdf.setFontSize(20);
      pdf.text(rmaData.rma_number, pageWidth / 2, 32, { align: "center" });

      y = 55;
      
      // Meta info
      pdf.setFontSize(10);
      pdf.setTextColor(102, 102, 102);
      pdf.text(`申請時間：${formatDate(rmaData.created_at)}`, margin, y);
      pdf.text(`狀態：${getStatusLabel(rmaData.status)}`, pageWidth - margin, y, { align: "right" });
      
      // Customer Section
      addSection("客戶資訊");
      
      const col1X = margin + 4;
      const col2X = margin + contentWidth / 2 + 4;
      const colWidth = contentWidth / 2 - 8;

      const yBefore = y;
      addField("客戶姓名", rmaData.customer_name, col1X, colWidth);
      const y1 = y;
      y = yBefore;
      addField("客戶類型", rmaData.customer_type || "一般客戶", col2X, colWidth);
      y = Math.max(y, y1);
      y += 2;

      const yBefore2 = y;
      addField("電子郵件", rmaData.customer_email, col1X, colWidth);
      const y2 = y;
      y = yBefore2;
      addField("聯絡電話", rmaData.customer_phone, col2X, colWidth);
      y = Math.max(y, y2);
      y += 2;

      const yBefore3 = y;
      addField("手機號碼", rmaData.mobile_phone || "-", col1X, colWidth);
      y = yBefore3;
      y += 2;

      addField("聯絡地址", rmaData.customer_address || "-", col1X, contentWidth - 8);

      // Product Section
      addSection("產品資訊");
      
      const yBefore4 = y;
      addField("產品名稱", rmaData.product_name, col1X, colWidth);
      const y4 = y;
      y = yBefore4;
      addField("產品型號", rmaData.product_model || "-", col2X, colWidth);
      y = Math.max(y, y4);
      y += 2;

      const yBefore5 = y;
      addField("產品序號", rmaData.serial_number || "-", col1X, colWidth);
      const y5 = y;
      y = yBefore5;
      addField("購買日期", rmaData.purchase_date || "-", col2X, colWidth);
      y = Math.max(y, y5);
      y += 2;

      addField("保固到期日", rmaData.warranty_date || "-", col1X, colWidth);

      // Issue Description Section
      addSection("問題描述");
      addField("", rmaData.issue_description || "-", col1X, contentWidth - 8);

      // Customer Notes Section (if exists)
      if (rmaData.customer_notes) {
        addSection("隨附物品 / 備註");
        addField("", rmaData.customer_notes, col1X, contentWidth - 8);
      }

      // Footer
      y = pdf.internal.pageSize.getHeight() - 25;
      pdf.setDrawColor(200, 200, 200);
      pdf.line(margin, y, pageWidth - margin, y);
      y += 8;
      pdf.setFontSize(9);
      pdf.setTextColor(136, 136, 136);
      pdf.text("此文件為 RMA 維修申請確認單，請妥善保存。", pageWidth / 2, y, { align: "center" });
      y += 5;
      pdf.text("如有任何問題，請聯繫客服中心。", pageWidth / 2, y, { align: "center" });

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

  const getStatusLabel = (status: string) => {
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
                    <p className="text-muted-foreground">客戶類型</p>
                    <p className="font-medium">{rmaData.customer_type || "一般客戶"}</p>
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
                  <div>
                    <p className="text-muted-foreground">保固到期日</p>
                    <p className="font-medium">{rmaData.warranty_date || "-"}</p>
                  </div>
                </div>
              </div>

              {/* Issue Description */}
              <div>
                <h3 className="font-semibold mb-3 text-foreground border-b pb-2">
                  問題描述
                </h3>
                <p className="text-sm whitespace-pre-wrap bg-muted/30 p-3 rounded-md">
                  {rmaData.issue_description || "-"}
                </p>
              </div>

              {/* Customer Notes */}
              {rmaData.customer_notes && (
                <div>
                  <h3 className="font-semibold mb-3 text-foreground border-b pb-2">
                    隨附物品 / 備註
                  </h3>
                  <p className="text-sm whitespace-pre-wrap bg-muted/30 p-3 rounded-md">
                    {rmaData.customer_notes}
                  </p>
                </div>
              )}
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
