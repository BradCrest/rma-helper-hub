import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CheckCircle, Download, Printer, Home, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";

import { toast } from "sonner";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

interface RmaResult {
  rmaNumber: string;
  productModel: string;
  serialNumber: string;
}

interface RmaFullData {
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
}

const RmaMultiConfirmation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [results, setResults] = useState<RmaResult[]>([]);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  useEffect(() => {
    const state = location.state as { results?: RmaResult[] } | null;
    if (state?.results && state.results.length > 0) {
      setResults(state.results);
    } else {
      navigate("/");
    }
  }, [location.state, navigate]);

  const downloadCsv = () => {
    const BOM = '\uFEFF';
    const headers = ['RMA編號', '產品型號', '產品序號'];
    const rows = results.map((r) => [r.rmaNumber, r.productModel, r.serialNumber]);
    const content = BOM + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `RMA批量申請結果_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  const fetchRmaDetails = async (rmaNumber: string): Promise<RmaFullData | null> => {
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

      if (!response.ok) return null;

      const result = await response.json();
      return result.results?.[0] || null;
    } catch (error) {
      console.error(`Error fetching RMA ${rmaNumber}:`, error);
      return null;
    }
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

  const generateRmaPageHtml = (data: RmaFullData, index: number, total: number): string => {
    const notesSection = data.customer_notes ? `
      <div style="background: #fafafa; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
        <div style="font-size: 16px; font-weight: 600; color: #0066cc; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid #e0e0e0;">隨附物品 / 備註</div>
        <div style="background: #fff; border: 1px solid #e0e0e0; border-radius: 6px; padding: 16px; font-size: 14px; white-space: pre-wrap;">${data.customer_notes}</div>
      </div>
    ` : "";

    return `
    <div style="width: 794px; min-height: 1123px; padding: 40px; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Microsoft JhengHei', 'PingFang SC', sans-serif; color: #333; background: white;">
      <div style="background: linear-gradient(135deg, #0066cc, #0052a3); padding: 24px; border-radius: 12px; margin-bottom: 24px; text-align: center;">
        <div style="color: white; font-size: 20px; font-weight: 600; margin-bottom: 8px;"><div style="color: white; font-size: 20px; font-weight: 600; margin-bottom: 8px;">RMA 保固服務申請單 (${index + 1}/${total})</div></div>
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
        <p>此文件為 RMA 維修申請確認單，請妥善保存。</p>
      </div>
    </div>
  `;
  };

  const generateCoverPageHtml = (rmaDataList: RmaFullData[]): string => {
    const tableRows = rmaDataList.map((rma, index) => `
      <tr style="border-bottom: 1px solid #e0e0e0;">
        <td style="padding: 10px 8px;">${index + 1}</td>
        <td style="padding: 10px 8px; font-family: monospace; font-weight: 600; color: #0066cc;">${rma.rma_number}</td>
        <td style="padding: 10px 8px;">${rma.product_model || "-"}</td>
        <td style="padding: 10px 8px;">${rma.serial_number || "-"}</td>
      </tr>
    `).join("");

    return `
    <div style="width: 794px; min-height: 1123px; padding: 40px; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Microsoft JhengHei', 'PingFang SC', sans-serif; color: #333; background: white;">
      <div style="background: linear-gradient(135deg, #0066cc, #0052a3); padding: 40px; border-radius: 12px; margin-bottom: 32px; text-align: center;">
        <div style="color: white; font-size: 28px; font-weight: bold; margin-bottom: 12px;">RMA 批量申請確認單</div>
        <div style="color: rgba(255,255,255,0.9); font-size: 18px;">共 ${rmaDataList.length} 筆申請</div>
      </div>
      
      <div style="margin-bottom: 24px; font-size: 14px; color: #666;">
        生成日期：${new Date().toLocaleDateString("zh-TW")}
      </div>

      <div style="font-size: 18px; font-weight: 600; color: #0066cc; margin-bottom: 16px;">申請清單摘要</div>
      
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <thead>
          <tr style="background: #f0f7ff;">
            <th style="padding: 12px 8px; text-align: left; border-bottom: 2px solid #0066cc; font-weight: 600;">#</th>
            <th style="padding: 12px 8px; text-align: left; border-bottom: 2px solid #0066cc; font-weight: 600;">RMA 編號</th>
            <th style="padding: 12px 8px; text-align: left; border-bottom: 2px solid #0066cc; font-weight: 600;">產品型號</th>
            <th style="padding: 12px 8px; text-align: left; border-bottom: 2px solid #0066cc; font-weight: 600;">產品序號</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>

      <div style="margin-top: 40px; padding-top: 16px; border-top: 1px solid #ddd; text-align: center; font-size: 12px; color: #888;">
        <p>此文件為 RMA 批量申請確認單，請妥善保存。</p>
      </div>
    </div>
  `;
  };

  const downloadBatchPdf = async () => {
    if (results.length === 0) return;

    setGeneratingPdf(true);
    toast.info(`正在生成 ${results.length} 筆 RMA 的 PDF...`);

    try {
      const rmaDataList: RmaFullData[] = [];
      for (const result of results) {
        const data = await fetchRmaDetails(result.rmaNumber);
        if (data) {
          rmaDataList.push(data);
        }
      }

      if (rmaDataList.length === 0) {
        toast.error("無法取得 RMA 資料");
        return;
      }

      const container = document.createElement("div");
      container.style.cssText = "position: absolute; left: -9999px; top: 0;";
      document.body.appendChild(container);

      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      container.innerHTML = generateCoverPageHtml(rmaDataList);
      const coverCanvas = await html2canvas(container.firstElementChild as HTMLElement, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });
      const coverImgData = coverCanvas.toDataURL("image/jpeg", 0.95);
      const coverImgWidth = pdfWidth;
      const coverImgHeight = (coverCanvas.height * pdfWidth) / coverCanvas.width;
      pdf.addImage(coverImgData, "JPEG", 0, 0, coverImgWidth, Math.min(coverImgHeight, pdfHeight));

      for (let i = 0; i < rmaDataList.length; i++) {
        pdf.addPage();
        container.innerHTML = generateRmaPageHtml(rmaDataList[i], i, rmaDataList.length);
        
        const canvas = await html2canvas(container.firstElementChild as HTMLElement, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: "#ffffff",
        });
        
        const imgData = canvas.toDataURL("image/jpeg", 0.95);
        const imgWidth = pdfWidth;
        const imgHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, "JPEG", 0, 0, imgWidth, Math.min(imgHeight, pdfHeight));
      }

      document.body.removeChild(container);

      pdf.save(`RMA批量申請_${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success("PDF 下載成功");
    } catch (error) {
      console.error("Error generating batch PDF:", error);
      toast.error("PDF 生成失敗");
    } finally {
      setGeneratingPdf(false);
    }
  };

  if (results.length === 0) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
        <div className="rma-card animate-fade-in">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">
              成功送出 {results.length} 筆申請
            </h1>
            <p className="text-muted-foreground">
              每筆申請已產生獨立的 RMA 編號，請保存以下資訊
            </p>
          </div>

          <div className="border border-border rounded-lg overflow-hidden mb-6">
            <ScrollArea className="max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>RMA 編號</TableHead>
                    <TableHead>產品型號</TableHead>
                    <TableHead>產品序號</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((result, index) => (
                    <TableRow key={result.rmaNumber}>
                      <TableCell className="font-medium">{index + 1}</TableCell>
                      <TableCell>
                        <span className="font-mono font-semibold text-primary">
                          {result.rmaNumber}
                        </span>
                      </TableCell>
                      <TableCell>{result.productModel}</TableCell>
                      <TableCell>{result.serialNumber}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>

          <div className="flex flex-wrap justify-center gap-3 print:hidden">
            <Button variant="outline" onClick={handlePrint} className="gap-2">
              <Printer className="w-4 h-4" />
              列印全部
            </Button>
            <Button variant="outline" onClick={downloadCsv} className="gap-2">
              <Download className="w-4 h-4" />
              下載 CSV
            </Button>
            <Button 
              variant="outline" 
              onClick={downloadBatchPdf} 
              disabled={generatingPdf}
              className="gap-2"
            >
              <FileText className="w-4 h-4" />
              {generatingPdf ? "生成中..." : "下載合併 PDF"}
            </Button>
            <Button onClick={() => navigate("/")} className="gap-2">
              <Home className="w-4 h-4" />
              返回首頁
            </Button>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default RmaMultiConfirmation;
