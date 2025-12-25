import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CheckCircle, Download, Printer, Home, Eye, FileText } from "lucide-react";
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
import RmaDetailDialog from "@/components/rma/RmaDetailDialog";
import { toast } from "sonner";
import jsPDF from "jspdf";

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
  const [selectedRma, setSelectedRma] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
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

  const handleViewDetail = (rmaNumber: string) => {
    setSelectedRma(rmaNumber);
    setDialogOpen(true);
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

  const downloadBatchPdf = async () => {
    if (results.length === 0) return;

    setGeneratingPdf(true);
    toast.info(`正在生成 ${results.length} 筆 RMA 的 PDF...`);

    try {
      // Fetch all RMA details
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

      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      const contentWidth = pageWidth - margin * 2;

      // Cover page
      pdf.setFillColor(0, 102, 204);
      pdf.rect(0, 0, pageWidth, 60, "F");
      
      pdf.setFontSize(24);
      pdf.setTextColor(255, 255, 255);
      pdf.text("RMA 批量申請確認單", pageWidth / 2, 30, { align: "center" });
      
      pdf.setFontSize(14);
      pdf.text(`共 ${rmaDataList.length} 筆申請`, pageWidth / 2, 45, { align: "center" });

      let y = 80;
      pdf.setFontSize(12);
      pdf.setTextColor(51, 51, 51);
      pdf.text(`生成日期：${new Date().toLocaleDateString("zh-TW")}`, margin, y);
      
      y += 20;
      
      // Summary table on cover page
      pdf.setFontSize(14);
      pdf.setTextColor(0, 102, 204);
      pdf.text("申請清單摘要", margin, y);
      y += 10;

      // Table header
      pdf.setFillColor(240, 247, 255);
      pdf.rect(margin, y - 5, contentWidth, 10, "F");
      pdf.setFontSize(10);
      pdf.setTextColor(51, 51, 51);
      pdf.text("#", margin + 5, y + 2);
      pdf.text("RMA 編號", margin + 20, y + 2);
      pdf.text("產品型號", margin + 70, y + 2);
      pdf.text("產品序號", margin + 120, y + 2);
      y += 12;

      rmaDataList.forEach((rma, index) => {
        if (y > pageHeight - 30) {
          pdf.addPage();
          y = 30;
        }
        pdf.setFontSize(9);
        pdf.text(String(index + 1), margin + 5, y);
        pdf.text(rma.rma_number, margin + 20, y);
        pdf.text(rma.product_model || "-", margin + 70, y);
        pdf.text(rma.serial_number || "-", margin + 120, y);
        y += 8;
      });

      // Individual RMA pages
      rmaDataList.forEach((rma, index) => {
        pdf.addPage();
        let y = 20;

        // Header
        pdf.setFillColor(0, 102, 204);
        pdf.rect(0, 0, pageWidth, 45, "F");
        
        pdf.setFontSize(16);
        pdf.setTextColor(255, 255, 255);
        pdf.text(`RMA 維修申請單 (${index + 1}/${rmaDataList.length})`, pageWidth / 2, 18, { align: "center" });
        
        pdf.setFontSize(18);
        pdf.text(rma.rma_number, pageWidth / 2, 32, { align: "center" });

        y = 55;

        // Meta info
        pdf.setFontSize(10);
        pdf.setTextColor(102, 102, 102);
        pdf.text(`申請時間：${formatDate(rma.created_at)}`, margin, y);
        pdf.text(`狀態：${getStatusLabel(rma.status)}`, pageWidth - margin, y, { align: "right" });
        y += 12;

        // Helper function for sections
        const addSection = (title: string) => {
          y += 5;
          pdf.setFillColor(240, 247, 255);
          pdf.roundedRect(margin, y - 4, contentWidth, 10, 2, 2, "F");
          pdf.setFontSize(11);
          pdf.setTextColor(0, 102, 204);
          pdf.text(title, margin + 4, y + 3);
          y += 14;
        };

        const addField = (label: string, value: string, x: number, width: number) => {
          pdf.setFontSize(8);
          pdf.setTextColor(136, 136, 136);
          pdf.text(label, x, y);
          y += 4;
          pdf.setFontSize(10);
          pdf.setTextColor(51, 51, 51);
          const lines = pdf.splitTextToSize(value || "-", width - 4);
          pdf.text(lines, x, y);
          y += lines.length * 4 + 2;
        };

        const col1X = margin + 4;
        const col2X = margin + contentWidth / 2 + 4;
        const colWidth = contentWidth / 2 - 8;

        // Customer Section
        addSection("客戶資訊");
        
        const saveY1 = y;
        addField("客戶姓名", rma.customer_name, col1X, colWidth);
        const endY1 = y;
        y = saveY1;
        addField("客戶類型", rma.customer_type || "一般客戶", col2X, colWidth);
        y = Math.max(y, endY1);

        const saveY2 = y;
        addField("電子郵件", rma.customer_email, col1X, colWidth);
        const endY2 = y;
        y = saveY2;
        addField("聯絡電話", rma.customer_phone, col2X, colWidth);
        y = Math.max(y, endY2);

        const saveY3 = y;
        addField("手機號碼", rma.mobile_phone || "-", col1X, colWidth);
        y = saveY3;

        addField("聯絡地址", rma.customer_address || "-", col1X, contentWidth - 8);

        // Product Section
        addSection("產品資訊");
        
        const saveY4 = y;
        addField("產品名稱", rma.product_name, col1X, colWidth);
        const endY4 = y;
        y = saveY4;
        addField("產品型號", rma.product_model || "-", col2X, colWidth);
        y = Math.max(y, endY4);

        const saveY5 = y;
        addField("產品序號", rma.serial_number || "-", col1X, colWidth);
        const endY5 = y;
        y = saveY5;
        addField("購買日期", rma.purchase_date || "-", col2X, colWidth);
        y = Math.max(y, endY5);

        addField("保固到期日", rma.warranty_date || "-", col1X, colWidth);

        // Issue Description
        addSection("問題描述");
        pdf.setFontSize(9);
        pdf.setTextColor(51, 51, 51);
        const issueLines = pdf.splitTextToSize(rma.issue_description || "-", contentWidth - 8);
        pdf.text(issueLines, col1X, y);
        y += issueLines.length * 4 + 4;

        // Customer Notes
        if (rma.customer_notes) {
          addSection("隨附物品 / 備註");
          pdf.setFontSize(9);
          pdf.setTextColor(51, 51, 51);
          const noteLines = pdf.splitTextToSize(rma.customer_notes, contentWidth - 8);
          pdf.text(noteLines, col1X, y);
        }

        // Footer
        pdf.setDrawColor(200, 200, 200);
        pdf.line(margin, pageHeight - 20, pageWidth - margin, pageHeight - 20);
        pdf.setFontSize(8);
        pdf.setTextColor(136, 136, 136);
        pdf.text("此文件為 RMA 維修申請確認單，請妥善保存。", pageWidth / 2, pageHeight - 12, { align: "center" });
      });

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
          {/* Success Header */}
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

          {/* Results Table */}
          <div className="border border-border rounded-lg overflow-hidden mb-6">
            <ScrollArea className="max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>RMA 編號</TableHead>
                    <TableHead>產品型號</TableHead>
                    <TableHead>產品序號</TableHead>
                    <TableHead className="w-24">操作</TableHead>
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
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewDetail(result.rmaNumber)}
                          className="gap-1 h-8 px-2"
                        >
                          <Eye className="w-3 h-3" />
                          查看
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>

          {/* Action Buttons */}
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
              {generatingPdf ? "生成中..." : "下載全部 PDF"}
            </Button>
            <Button onClick={() => navigate("/")} className="gap-2">
              <Home className="w-4 h-4" />
              返回首頁
            </Button>
          </div>

        </div>
      </main>
      <Footer />

      {/* RMA Detail Dialog */}
      <RmaDetailDialog
        rmaNumber={selectedRma}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
};

export default RmaMultiConfirmation;
