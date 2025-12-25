import { useEffect, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CheckCircle, Download, Printer, Home, Eye } from "lucide-react";
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

interface RmaResult {
  rmaNumber: string;
  productModel: string;
  serialNumber: string;
}

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

const RmaMultiConfirmation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [results, setResults] = useState<RmaResult[]>([]);
  const [selectedRma, setSelectedRma] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [rmaData, setRmaData] = useState<RmaData | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const state = location.state as { results?: RmaResult[] } | null;
    if (state?.results && state.results.length > 0) {
      setResults(state.results);
    } else {
      navigate("/");
    }
  }, [location.state, navigate]);

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

  const handlePrintAll = () => {
    window.print();
  };

  const fetchRmaData = async (rmaNumber: string) => {
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

  const handleViewDetail = (rmaNumber: string) => {
    setSelectedRma(rmaNumber);
    setDialogOpen(true);
    fetchRmaData(rmaNumber);
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setRmaData(null);
      setSelectedRma(null);
    }
  };

  const handlePrintSingle = () => {
    if (!rmaData) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("無法開啟列印視窗");
      return;
    }

    const dateStr = formatDate(rmaData.created_at);

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>RMA ${rmaData.rma_number}</title>
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
            <div class="rma-number">${rmaData.rma_number}</div>
            <p>申請時間：${dateStr}</p>
          </div>
          <div class="section">
            <div class="section-title">客戶資訊</div>
            <div class="grid">
              <div class="item"><span class="label">姓名：</span><span class="value">${rmaData.customer_name}</span></div>
              <div class="item"><span class="label">Email：</span><span class="value">${rmaData.customer_email}</span></div>
              <div class="item"><span class="label">電話：</span><span class="value">${rmaData.customer_phone}</span></div>
              <div class="item"><span class="label">手機：</span><span class="value">${rmaData.mobile_phone || "-"}</span></div>
              <div class="item"><span class="label">地址：</span><span class="value">${rmaData.customer_address || "-"}</span></div>
            </div>
          </div>
          <div class="section">
            <div class="section-title">產品資訊</div>
            <div class="grid">
              <div class="item"><span class="label">產品名稱：</span><span class="value">${rmaData.product_name}</span></div>
              <div class="item"><span class="label">產品型號：</span><span class="value">${rmaData.product_model || "-"}</span></div>
              <div class="item"><span class="label">產品序號：</span><span class="value">${rmaData.serial_number || "-"}</span></div>
              <div class="item"><span class="label">購買日期：</span><span class="value">${rmaData.purchase_date || "-"}</span></div>
            </div>
          </div>
          <div class="section">
            <div class="section-title">問題描述</div>
            <p>${rmaData.issue_description}</p>
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
              成功提交 {results.length} 筆 RMA 申請
            </h1>
            <p className="text-muted-foreground">
              每筆產品已產生獨立的 RMA 編號，請保存以下資訊
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
            <Button variant="outline" onClick={handlePrintAll} className="gap-2">
              <Printer className="w-4 h-4" />
              列印全部
            </Button>
            <Button variant="outline" onClick={downloadCsv} className="gap-2">
              <Download className="w-4 h-4" />
              下載 CSV 清單
            </Button>
            <Button onClick={() => navigate("/")} className="gap-2">
              <Home className="w-4 h-4" />
              返回首頁
            </Button>
          </div>

          {/* Info Note */}
          <div className="mt-6 p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground text-center">
              我們已發送確認郵件至您的電子信箱，請查收並保存 RMA 編號以便後續查詢維修進度。
            </p>
          </div>
        </div>
      </main>
      <Footer />

      {/* RMA Detail Dialog */}
      <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>RMA 詳細資訊</DialogTitle>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : rmaData ? (
            <>
              <div ref={contentRef} className="space-y-6 p-4 bg-background">
                <div className="text-center pb-4 border-b">
                  <p className="text-sm text-muted-foreground mb-1">RMA 編號</p>
                  <p className="text-2xl font-bold font-mono text-primary">
                    {rmaData.rma_number}
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    申請時間：{formatDate(rmaData.created_at)}
                  </p>
                </div>

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

                <div>
                  <h3 className="font-semibold mb-3 text-foreground border-b pb-2">
                    問題描述
                  </h3>
                  <p className="text-sm whitespace-pre-wrap">
                    {rmaData.issue_description}
                  </p>
                </div>
              </div>

              <div className="flex justify-center gap-3 pt-4 border-t">
                <Button variant="outline" onClick={handlePrintSingle} className="gap-2">
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
    </div>
  );
};

export default RmaMultiConfirmation;
