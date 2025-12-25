import { useEffect, useState } from "react";
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
import RmaDetailDialog from "@/components/rma/RmaDetailDialog";

interface RmaResult {
  rmaNumber: string;
  productModel: string;
  serialNumber: string;
}

const RmaMultiConfirmation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [results, setResults] = useState<RmaResult[]>([]);
  const [selectedRma, setSelectedRma] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    const state = location.state as { results?: RmaResult[] } | null;
    if (state?.results && state.results.length > 0) {
      setResults(state.results);
    } else {
      // No results, redirect to home
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
              下載 CSV 清單
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
