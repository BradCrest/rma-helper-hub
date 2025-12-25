import { useState, useRef } from "react";
import { Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ProductEntry,
  ParseResult,
  parseCsvContent,
  parseExcelContent,
  downloadCsvTemplate,
} from "@/lib/rmaMultiCsvParser";

interface CsvImportSectionProps {
  onImport: (products: ProductEntry[], errors: { row: number; message: string }[]) => void;
}

const CsvImportSection = ({ onImport }: CsvImportSectionProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      processFile(files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = async (file: File) => {
    const fileName = file.name.toLowerCase();
    
    if (!fileName.endsWith('.csv') && !fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
      toast.error("請上傳 CSV 或 Excel 檔案");
      return;
    }

    setIsProcessing(true);
    setParseResult(null);

    try {
      let result: ParseResult;

      if (fileName.endsWith('.csv')) {
        const text = await file.text();
        result = parseCsvContent(text);
      } else {
        const buffer = await file.arrayBuffer();
        result = parseExcelContent(buffer);
      }

      setParseResult(result);

      // Always call onImport with both success and errors
      if (result.success.length > 0 || result.errors.length > 0) {
        onImport(result.success, result.errors);
        if (result.success.length > 0) {
          toast.success(`成功解析 ${result.success.length} 筆產品資料`);
        }
        if (result.errors.length > 0 && result.success.length === 0) {
          toast.error("檔案解析失敗，請檢查格式");
        }
      }
    } catch (error) {
      console.error("Error processing file:", error);
      toast.error("檔案處理失敗");
    } finally {
      setIsProcessing(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="border border-border rounded-lg p-6 bg-card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5" />
          CSV / Excel 批量匯入
        </h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={downloadCsvTemplate}
          className="gap-2"
        >
          <Download className="w-4 h-4" />
          下載 CSV 範本
        </Button>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInput}
        accept=".csv,.xlsx,.xls"
        className="hidden"
      />

      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
          dragActive
            ? "border-primary bg-accent"
            : "border-border hover:border-primary/50"
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={handleUploadClick}
      >
        {isProcessing ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">正在處理檔案...</p>
          </div>
        ) : (
          <>
            <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              <span className="text-primary font-medium hover:underline">
                點擊上傳檔案
              </span>{" "}
              或拖放到此處
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              支援 CSV, XLSX, XLS 格式
            </p>
          </>
        )}
      </div>

      {/* Parse Result Summary */}
      {parseResult && (
        <div className="mt-4 space-y-2">
          {parseResult.success.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <CheckCircle className="w-4 h-4" />
              成功解析：{parseResult.success.length} 筆
            </div>
          )}
          {parseResult.errors.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="w-4 h-4" />
                錯誤：{parseResult.errors.length} 筆
              </div>
              <div className="bg-destructive/10 rounded p-3 max-h-32 overflow-y-auto">
                {parseResult.errors.map((error, index) => (
                  <p key={index} className="text-xs text-destructive">
                    第 {error.row} 行：{error.message}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Format Guide */}
      <div className="mt-4 p-3 bg-muted/50 rounded-lg">
        <p className="text-xs font-medium text-foreground mb-2">CSV 欄位說明：</p>
        <ul className="text-xs text-muted-foreground space-y-1">
          <li>• <strong>產品型號</strong> (必填)：產品的型號名稱</li>
          <li>• <strong>產品序號</strong> (必填)：產品的序列號</li>
          <li>• <strong>問題描述</strong>：詳細的問題說明</li>
          <li>• <strong>購買日期</strong>：格式 YYYY-MM-DD</li>
          <li>• <strong>隨附物品</strong>：多項用逗號分隔</li>
        </ul>
      </div>
    </div>
  );
};

export default CsvImportSection;
