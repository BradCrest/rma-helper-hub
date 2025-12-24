import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { parseCSV, validateRecord, getParseStats, type ParsedRmaRecord } from "@/lib/csvParser";
import { ArrowLeft, Upload, FileText, CheckCircle2, XCircle, AlertTriangle, Loader2 } from "lucide-react";
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
  follow_up: '後續關懷',
  closed: '已結案',
};

const AdminCsvImport = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [file, setFile] = useState<File | null>(null);
  const [parsedRecords, setParsedRecords] = useState<ParsedRmaRecord[]>([]);
  const [parseStats, setParseStats] = useState<ReturnType<typeof getParseStats> | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>('skip');
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState<{
    total: number;
    success: number;
    skipped: number;
    updated: number;
    failed: number;
    errors: { rma_number: string; error: string }[];
  } | null>(null);
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'complete'>('upload');

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
        const records = parseCSV(content);
        const stats = getParseStats(records);
        
        setParsedRecords(records);
        setParseStats(stats);
        setStep('preview');
        
        toast({
          title: "檔案解析完成",
          description: `共解析 ${stats.total} 筆記錄`,
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

  const handleImport = async () => {
    if (parsedRecords.length === 0) return;
    
    setStep('importing');
    setIsImporting(true);
    setImportProgress(0);
    
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

        setImportProgress(Math.round(((i + 1) / batches.length) * 100));
      }

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
    }
  };

  const resetImport = () => {
    setFile(null);
    setParsedRecords([]);
    setParseStats(null);
    setImportResults(null);
    setStep('upload');
    setImportProgress(0);
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
                      <li>報修單號 (RMA Number) 為必填欄位</li>
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
                    {file?.name} - {parseStats.total} 筆記錄
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="p-4 bg-muted rounded-lg">
                      <div className="text-2xl font-bold text-foreground">{parseStats.total}</div>
                      <div className="text-sm text-muted-foreground">總記錄數</div>
                    </div>
                    <div className="p-4 bg-green-500/10 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">{parseStats.valid}</div>
                      <div className="text-sm text-muted-foreground">有效記錄</div>
                    </div>
                    <div className="p-4 bg-red-500/10 rounded-lg">
                      <div className="text-2xl font-bold text-red-600">{parseStats.invalid}</div>
                      <div className="text-sm text-muted-foreground">無效記錄</div>
                    </div>
                    <div className="p-4 bg-blue-500/10 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">
                        {Object.keys(parseStats.byStatus).length}
                      </div>
                      <div className="text-sm text-muted-foreground">狀態類型</div>
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
                <Button onClick={handleImport} disabled={parseStats.valid === 0}>
                  開始匯入 ({parseStats.valid} 筆有效記錄)
                </Button>
              </div>
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
                  <p className="text-center text-muted-foreground">
                    已完成 {importProgress}%
                  </p>
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
