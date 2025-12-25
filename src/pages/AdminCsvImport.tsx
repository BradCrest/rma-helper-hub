import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { parseCSVWithDiagnostics, validateRecord, getParseStats, type ParsedRmaRecord, type SkippedRecord } from "@/lib/csvParser";
import { ArrowLeft, Upload, FileText, CheckCircle2, XCircle, AlertTriangle, Loader2, SkipForward } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
type ImportMode = 'skip' | 'update';

const statusLabels: Record<string, string> = {
  registered: '已登記',
  shipped: '已寄出',
  received: '已收件',
  inspecting: '檢修中',
  contacting: '聯繫中',
  quote_confirmed: '確認報價',
  paid: '已付費',
  no_repair: '不維修',
  repairing: '維修中',
  shipped_back: '已寄回',
  shipped_back_refurbished: '已寄回整新品',
  shipped_back_original: '已寄回原錶',
  shipped_back_new: '已寄出全新品',
  follow_up: '後續關懷',
  closed: '已結案',
  unknown: '未知狀態',
};

const AdminCsvImport = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [file, setFile] = useState<File | null>(null);
  const [parsedRecords, setParsedRecords] = useState<ParsedRmaRecord[]>([]);
  const [skippedRecords, setSkippedRecords] = useState<SkippedRecord[]>([]);
  const [totalCsvLines, setTotalCsvLines] = useState<number>(0);
  const [parseStats, setParseStats] = useState<ReturnType<typeof getParseStats> | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>('skip');
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importedCount, setImportedCount] = useState(0);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<string | null>(null);
  const [recordsPerSecond, setRecordsPerSecond] = useState<number>(0);
  const [elapsedTime, setElapsedTime] = useState<string>('00:00');
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const [importResults, setImportResults] = useState<{
    total: number;
    success: number;
    skipped: number;
    updated: number;
    failed: number;
    errors: { rma_number: string; error: string }[];
  } | null>(null);
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'complete'>('upload');
  const [showInvalidConfirm, setShowInvalidConfirm] = useState(false);
  const [showInvalidList, setShowInvalidList] = useState(false);
  const [showSkippedList, setShowSkippedList] = useState(false);
  
  // Memoize invalid records for performance
  const invalidRecords = useMemo(() => {
    return parsedRecords
      .map((record, index) => ({ record, index: index + 2, validation: validateRecord(record) }))
      .filter(item => !item.validation.valid);
  }, [parsedRecords]);
  
  // Refs for progress tracking
  const importedCountRef = useRef(0);
  const importStartTimeRef = useRef<number | null>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    
    if (!selectedFile.name.endsWith('.csv')) {
      toast({
        title: "檔案格式錯誤",
        description: "請上傳 CSV 檔案",
        variant: "destructive",
      });
      return;
    }
    
    setFile(selectedFile);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const result = parseCSVWithDiagnostics(content);
        const stats = getParseStats(result.records);
        
        setParsedRecords(result.records);
        setSkippedRecords(result.skipped);
        setTotalCsvLines(result.totalLines);
        setParseStats(stats);
        setStep('preview');
        
        const skippedCount = result.skipped.filter(s => s.reason !== '空白行').length;
        toast({
          title: "檔案解析完成",
          description: `CSV 共 ${result.totalLines} 行資料，解析成功 ${result.records.length} 筆${skippedCount > 0 ? `，跳過 ${skippedCount} 筆` : ''}`,
        });
      } catch (error) {
        toast({
          title: "解析失敗",
          description: "無法解析 CSV 檔案，請檢查檔案格式",
          variant: "destructive",
        });
      }
    };
    reader.readAsText(selectedFile, 'UTF-8');
  }, [toast]);

  // Format time remaining
  const formatTimeRemaining = (seconds: number): string => {
    if (seconds < 60) {
      return `約 ${Math.ceil(seconds)} 秒`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const secs = Math.ceil(seconds % 60);
      return `約 ${minutes} 分 ${secs} 秒`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.ceil((seconds % 3600) / 60);
      return `約 ${hours} 小時 ${minutes} 分`;
    }
  };

  // Format elapsed time as mm:ss
  const formatElapsedTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Update progress display every 1 second
  useEffect(() => {
    if (!isImporting) return;
    
    const intervalId = setInterval(() => {
      const currentCount = importedCountRef.current;
      const startTime = importStartTimeRef.current;
      
      if (startTime) {
        const elapsed = (Date.now() - startTime) / 1000; // seconds
        setElapsedTime(formatElapsedTime(elapsed));
        
        // Calculate speed and estimated time remaining
        if (currentCount > 0) {
          const rate = currentCount / elapsed; // records per second
          setRecordsPerSecond(Math.round(rate * 10) / 10);
          
          const remaining = parsedRecords.length - currentCount;
          const estimatedSeconds = remaining / rate;
          setEstimatedTimeRemaining(formatTimeRemaining(estimatedSeconds));
        }
      }
    }, 1000);
    
    return () => clearInterval(intervalId);
  }, [isImporting, parsedRecords.length]);

  const handleStartImport = () => {
    if (parsedRecords.length === 0) return;
    
    // Check if there are invalid records
    if (parseStats && parseStats.invalid > 0) {
      setShowInvalidConfirm(true);
      return;
    }
    
    // No invalid records, proceed directly
    handleImport();
  };

  const handleImport = async () => {
    if (parsedRecords.length === 0) return;
    
    setShowInvalidConfirm(false);
    
    setStep('importing');
    setIsImporting(true);
    setImportProgress(0);
    setImportedCount(0);
    setEstimatedTimeRemaining(null);
    setRecordsPerSecond(0);
    setElapsedTime('00:00');
    setCurrentBatch(0);
    importedCountRef.current = 0;
    importStartTimeRef.current = Date.now();
    
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        throw new Error('請先登入');
      }

      // Split records into batches of 50 for progress tracking
      const batchSize = 50;
      const batches = [];
      for (let i = 0; i < parsedRecords.length; i += batchSize) {
        batches.push(parsedRecords.slice(i, i + batchSize));
      }
      setTotalBatches(batches.length);

      let totalResults = {
        total: parsedRecords.length,
        success: 0,
        skipped: 0,
        updated: 0,
        failed: 0,
        errors: [] as { rma_number: string; error: string }[],
      };

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        
        const { data, error } = await supabase.functions.invoke('import-rma-csv', {
          body: { records: batch, mode: importMode },
        });

        if (error) {
          throw new Error(error.message);
        }

        if (data.results) {
          totalResults.success += data.results.success;
          totalResults.skipped += data.results.skipped;
          totalResults.updated += data.results.updated;
          totalResults.failed += data.results.failed;
          totalResults.errors.push(...data.results.errors);
        }

        // Update immediately after each batch for responsive UI
        const processedCount = Math.min((i + 1) * batchSize, parsedRecords.length);
        importedCountRef.current = processedCount;
        setImportedCount(processedCount);
        setImportProgress(Math.round((processedCount / parsedRecords.length) * 100));
        setCurrentBatch(i + 1);
      }

      // Final update
      setImportedCount(parsedRecords.length);
      setImportProgress(100);
      setImportResults(totalResults);
      setStep('complete');
      
      toast({
        title: "匯入完成",
        description: `成功 ${totalResults.success} 筆，略過 ${totalResults.skipped} 筆，失敗 ${totalResults.failed} 筆`,
      });
    } catch (error) {
      toast({
        title: "匯入失敗",
        description: error instanceof Error ? error.message : "未知錯誤",
        variant: "destructive",
      });
      setStep('preview');
    } finally {
      setIsImporting(false);
      importStartTimeRef.current = null;
    }
  };

  const resetImport = () => {
    setFile(null);
    setParsedRecords([]);
    setSkippedRecords([]);
    setTotalCsvLines(0);
    setParseStats(null);
    setImportResults(null);
    setStep('upload');
    setImportProgress(0);
    setImportedCount(0);
    setEstimatedTimeRemaining(null);
    setRecordsPerSecond(0);
    setElapsedTime('00:00');
    setCurrentBatch(0);
    setTotalBatches(0);
    setShowSkippedList(false);
    importedCountRef.current = 0;
    importStartTimeRef.current = null;
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="flex-grow container mx-auto px-4 py-8">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => navigate('/admin/rma-list')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回 RMA 列表
          </Button>
        </div>

        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-foreground mb-6">CSV 資料匯入</h1>
          
          {/* Step 1: Upload */}
          {step === 'upload' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="w-5 h-5" />
                  上傳 CSV 檔案
                </CardTitle>
                <CardDescription>
                  選擇 RMA 管理清單的 CSV 檔案進行匯入
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-12 text-center">
                  <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground mb-4">
                    拖放 CSV 檔案到此處，或點擊下方按鈕選擇檔案
                  </p>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    className="hidden"
                    id="csv-upload"
                  />
                  <label htmlFor="csv-upload">
                    <Button asChild>
                      <span>選擇檔案</span>
                    </Button>
                  </label>
                </div>
                
                <Alert className="mt-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>注意事項</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                      <li>CSV 檔案必須使用 UTF-8 編碼</li>
                      <li>第一行為說明，第二行為欄位標題</li>
                      <li>報修單號和客戶姓名為必填欄位</li>
                      <li>報修單號允許重複（經銷商可一次填寫多台 RMA）</li>
                      <li>重複的報修單號可選擇略過或更新</li>
                    </ul>
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Preview */}
          {step === 'preview' && parseStats && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    檔案預覽
                  </CardTitle>
                  <CardDescription>
                    {file?.name} - CSV 共 {totalCsvLines} 行資料
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Parsing summary - shows CSV lines vs parsed records */}
                  {skippedRecords.filter(s => s.reason !== '空白行').length > 0 && (
                    <Alert className="mb-6" variant="default">
                      <SkipForward className="h-4 w-4" />
                      <AlertTitle>解析摘要</AlertTitle>
                      <AlertDescription>
                        CSV 共 {totalCsvLines} 行資料，成功解析 {parsedRecords.length} 筆記錄，
                        <span 
                          className="text-orange-600 font-medium cursor-pointer underline decoration-dotted"
                          onClick={() => setShowSkippedList(true)}
                        >
                          跳過 {skippedRecords.filter(s => s.reason !== '空白行').length} 行
                        </span>
                        （報修單號為空或無效）
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                    <div className="p-4 bg-muted rounded-lg">
                      <div className="text-2xl font-bold text-foreground">{totalCsvLines}</div>
                      <div className="text-sm text-muted-foreground">CSV 行數</div>
                    </div>
                    <div className="p-4 bg-muted rounded-lg">
                      <div className="text-2xl font-bold text-foreground">{parseStats.total}</div>
                      <div className="text-sm text-muted-foreground">解析成功</div>
                    </div>
                    <div 
                      className={`p-4 bg-orange-500/10 rounded-lg ${skippedRecords.filter(s => s.reason !== '空白行').length > 0 ? 'cursor-pointer hover:bg-orange-500/20 transition-colors' : ''}`}
                      onClick={() => skippedRecords.filter(s => s.reason !== '空白行').length > 0 && setShowSkippedList(true)}
                      title={skippedRecords.filter(s => s.reason !== '空白行').length > 0 ? '點擊查看被跳過的行' : undefined}
                    >
                      <div className={`text-2xl font-bold text-orange-600 ${skippedRecords.filter(s => s.reason !== '空白行').length > 0 ? 'underline decoration-dotted' : ''}`}>
                        {skippedRecords.filter(s => s.reason !== '空白行').length}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        解析跳過{skippedRecords.filter(s => s.reason !== '空白行').length > 0 && ' (點擊)'}
                      </div>
                    </div>
                    <div className="p-4 bg-green-500/10 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">{parseStats.valid}</div>
                      <div className="text-sm text-muted-foreground">有效記錄</div>
                    </div>
                    <div 
                      className={`p-4 bg-red-500/10 rounded-lg ${parseStats.invalid > 0 ? 'cursor-pointer hover:bg-red-500/20 transition-colors' : ''}`}
                      onClick={() => parseStats.invalid > 0 && setShowInvalidList(true)}
                      title={parseStats.invalid > 0 ? '點擊查看無效記錄列表' : undefined}
                    >
                      <div className={`text-2xl font-bold text-red-600 ${parseStats.invalid > 0 ? 'underline decoration-dotted' : ''}`}>
                        {parseStats.invalid}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        無效記錄{parseStats.invalid > 0 && ' (點擊)'}
                      </div>
                    </div>
                  </div>

                  {/* Status breakdown */}
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-foreground mb-2">各狀態記錄數</h4>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(parseStats.byStatus).map(([status, count]) => (
                        <Badge key={status} variant="secondary">
                          {statusLabels[status] || status}: {count}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Import mode selection */}
                  <div className="mb-6">
                    <label className="text-sm font-medium text-foreground mb-2 block">
                      重複記錄處理方式
                    </label>
                    <Select value={importMode} onValueChange={(v) => setImportMode(v as ImportMode)}>
                      <SelectTrigger className="w-64">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="skip">略過（不匯入已存在的報修單號）</SelectItem>
                        <SelectItem value="update">更新（更新已存在的報修單號資料）</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Preview table */}
                  <div className="border rounded-lg overflow-hidden">
                    <div className="max-h-96 overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="sticky top-0 bg-muted">報修單號</TableHead>
                            <TableHead className="sticky top-0 bg-muted">狀態</TableHead>
                            <TableHead className="sticky top-0 bg-muted">客戶姓名</TableHead>
                            <TableHead className="sticky top-0 bg-muted">電話</TableHead>
                            <TableHead className="sticky top-0 bg-muted">產品型號</TableHead>
                            <TableHead className="sticky top-0 bg-muted">驗證</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {parsedRecords.slice(0, 100).map((record, index) => {
                            const validation = validateRecord(record);
                            return (
                              <TableRow key={index}>
                                <TableCell className="font-mono text-sm">{record.rma_number}</TableCell>
                                <TableCell>
                                  <Badge variant="outline">
                                    {statusLabels[record.status] || record.status}
                                  </Badge>
                                </TableCell>
                                <TableCell>{record.customer_name}</TableCell>
                                <TableCell>{record.customer_phone}</TableCell>
                                <TableCell>{record.product_model || '-'}</TableCell>
                                <TableCell>
                                  {validation.valid ? (
                                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                                  ) : (
                                    <span title={validation.errors.join(', ')}>
                                      <XCircle className="w-4 h-4 text-red-600" />
                                    </span>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                    {parsedRecords.length > 100 && (
                      <div className="p-2 text-center text-sm text-muted-foreground bg-muted">
                        顯示前 100 筆，共 {parsedRecords.length} 筆記錄
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <div className="flex gap-4 justify-end">
                <Button variant="outline" onClick={resetImport}>
                  取消
                </Button>
                <Button onClick={handleStartImport} disabled={parseStats.valid === 0}>
                  開始匯入 ({parseStats.valid} 筆有效記錄)
                </Button>
              </div>

              {/* Invalid records confirmation dialog */}
              <AlertDialog open={showInvalidConfirm} onOpenChange={setShowInvalidConfirm}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-yellow-500" />
                      發現無效記錄
                    </AlertDialogTitle>
                    <AlertDialogDescription className="space-y-2">
                      <p>
                        共有 <span className="font-bold text-red-600">{parseStats.invalid}</span> 筆無效記錄無法匯入。
                      </p>
                      <p>
                        是否繼續匯入其餘 <span className="font-bold text-green-600">{parseStats.valid}</span> 筆有效記錄？
                      </p>
                      <div className="mt-4 p-3 bg-muted rounded-lg max-h-40 overflow-auto">
                        <p className="text-sm font-medium mb-2">無效記錄原因：</p>
                        <ul className="text-sm space-y-1">
                          {parsedRecords
                            .filter(r => !validateRecord(r).valid)
                            .slice(0, 10)
                            .map((record, i) => {
                              const validation = validateRecord(record);
                              return (
                                <li key={i} className="text-muted-foreground">
                                  {record.rma_number || '(無報修單號)'}: {validation.errors.join(', ')}
                                </li>
                              );
                            })}
                          {parsedRecords.filter(r => !validateRecord(r).valid).length > 10 && (
                            <li className="text-muted-foreground">
                              ...還有 {parsedRecords.filter(r => !validateRecord(r).valid).length - 10} 筆無效記錄
                            </li>
                          )}
                        </ul>
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction onClick={handleImport}>
                      繼續匯入有效記錄
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {/* Invalid records list dialog */}
              <Dialog open={showInvalidList} onOpenChange={setShowInvalidList}>
                <DialogContent className="max-w-4xl max-h-[80vh]">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <XCircle className="w-5 h-5 text-red-600" />
                      無效記錄列表 ({invalidRecords.length} 筆)
                    </DialogTitle>
                    <DialogDescription>
                      以下記錄因缺少必要欄位而無法匯入
                    </DialogDescription>
                  </DialogHeader>
                  <div className="overflow-auto max-h-[60vh]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="sticky top-0 bg-background w-16">行號</TableHead>
                          <TableHead className="sticky top-0 bg-background">報修單號</TableHead>
                          <TableHead className="sticky top-0 bg-background">客戶姓名</TableHead>
                          <TableHead className="sticky top-0 bg-background">無效原因</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invalidRecords.map((item) => (
                          <TableRow key={item.index}>
                            <TableCell className="font-mono text-sm text-muted-foreground">
                              {item.index}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {item.record.rma_number || <span className="text-red-600 italic">無報修單號</span>}
                            </TableCell>
                            <TableCell>
                              {item.record.customer_name || <span className="text-red-600 italic">無客戶姓名</span>}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {item.validation.errors.map((error, i) => (
                                  <Badge key={i} variant="destructive" className="text-xs">
                                    {error}
                                  </Badge>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Skipped records list dialog */}
              <Dialog open={showSkippedList} onOpenChange={setShowSkippedList}>
                <DialogContent className="max-w-4xl max-h-[80vh]">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <SkipForward className="w-5 h-5 text-orange-600" />
                      解析時跳過的行 ({skippedRecords.filter(s => s.reason !== '空白行').length} 行)
                    </DialogTitle>
                    <DialogDescription>
                      以下 CSV 行因報修單號為空或無效而在解析時被跳過，不會匯入
                    </DialogDescription>
                  </DialogHeader>
                  <div className="overflow-auto max-h-[60vh]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="sticky top-0 bg-background w-20">CSV 行號</TableHead>
                          <TableHead className="sticky top-0 bg-background w-48">跳過原因</TableHead>
                          <TableHead className="sticky top-0 bg-background">原始內容（前 100 字元）</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {skippedRecords
                          .filter(s => s.reason !== '空白行')
                          .map((item) => (
                          <TableRow key={item.lineNumber}>
                            <TableCell className="font-mono text-sm text-muted-foreground">
                              {item.lineNumber}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-orange-600 border-orange-300">
                                {item.reason}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground max-w-md truncate">
                              {item.rawContent || <span className="italic">（空行）</span>}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {/* Step 3: Importing */}
          {step === 'importing' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  正在匯入資料
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Progress value={importProgress} />
                  
                  {/* Main progress info */}
                  <div className="text-center">
                    <p className="text-lg font-medium text-foreground">
                      已上傳 {importedCount} / {parsedRecords.length} 筆
                    </p>
                    <p className="text-sm text-muted-foreground">
                      進度 {importProgress}%
                    </p>
                  </div>

                  {/* Detailed status grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                    <div className="p-3 bg-muted rounded-lg text-center">
                      <div className="text-lg font-bold text-foreground">
                        {currentBatch} / {totalBatches}
                      </div>
                      <div className="text-xs text-muted-foreground">批次</div>
                    </div>
                    <div className="p-3 bg-muted rounded-lg text-center">
                      <div className="text-lg font-bold text-foreground">
                        {recordsPerSecond > 0 ? `${recordsPerSecond} 筆/秒` : '計算中...'}
                      </div>
                      <div className="text-xs text-muted-foreground">處理速度</div>
                    </div>
                    <div className="p-3 bg-muted rounded-lg text-center">
                      <div className="text-lg font-bold text-foreground font-mono">
                        {elapsedTime}
                      </div>
                      <div className="text-xs text-muted-foreground">已耗時</div>
                    </div>
                    <div className="p-3 bg-muted rounded-lg text-center">
                      <div className="text-lg font-bold text-foreground">
                        {estimatedTimeRemaining || '計算中...'}
                      </div>
                      <div className="text-xs text-muted-foreground">預估剩餘</div>
                    </div>
                  </div>

                  {/* Processing hint when first batch is being processed */}
                  {currentBatch === 0 && (
                    <p className="text-center text-sm text-muted-foreground mt-2">
                      正在處理第一批資料，完成後將開始更新進度...
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 4: Complete */}
          {step === 'complete' && importResults && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-green-600">
                    <CheckCircle2 className="w-5 h-5" />
                    匯入完成
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="p-4 bg-muted rounded-lg">
                      <div className="text-2xl font-bold text-foreground">{importResults.total}</div>
                      <div className="text-sm text-muted-foreground">總記錄數</div>
                    </div>
                    <div className="p-4 bg-green-500/10 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">{importResults.success}</div>
                      <div className="text-sm text-muted-foreground">成功新增</div>
                    </div>
                    <div className="p-4 bg-blue-500/10 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">{importResults.updated}</div>
                      <div className="text-sm text-muted-foreground">已更新</div>
                    </div>
                    <div className="p-4 bg-yellow-500/10 rounded-lg">
                      <div className="text-2xl font-bold text-yellow-600">{importResults.skipped}</div>
                      <div className="text-sm text-muted-foreground">已略過</div>
                    </div>
                  </div>

                  {importResults.failed > 0 && (
                    <Alert variant="destructive" className="mb-4">
                      <XCircle className="h-4 w-4" />
                      <AlertTitle>部分記錄匯入失敗</AlertTitle>
                      <AlertDescription>
                        <div className="mt-2 max-h-40 overflow-auto">
                          {importResults.errors.slice(0, 10).map((err, i) => (
                            <div key={i} className="text-sm">
                              {err.rma_number}: {err.error}
                            </div>
                          ))}
                          {importResults.errors.length > 10 && (
                            <div className="text-sm text-muted-foreground">
                              ...還有 {importResults.errors.length - 10} 個錯誤
                            </div>
                          )}
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>

              <div className="flex gap-4 justify-end">
                <Button variant="outline" onClick={resetImport}>
                  匯入更多
                </Button>
                <Button onClick={() => navigate('/admin/rma-list')}>
                  返回 RMA 列表
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
      
      <Footer />
    </div>
  );
};

export default AdminCsvImport;
