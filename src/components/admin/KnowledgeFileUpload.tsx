import { useState, useRef, useMemo } from "react";
import { Upload, FileText, Loader2, X, CheckCircle2, AlertCircle, RotateCw, Trash } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { kickoffEmailEmbeddingJob } from "@/lib/email-embedding-job";

interface UploadItem {
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  message?: string;
  chunks?: number;
}

interface Props {
  onUploaded?: (result: { uploadedCount: number; chunkCount: number }) => void;
}

const ACCEPTED = ".md,.markdown,.txt,.eml,.pdf";
const MAX_SIZE = 10 * 1024 * 1024;

const KnowledgeFileUpload = ({ onUploaded }: Props) => {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [language, setLanguage] = useState("zh-TW");
  const [tag, setTag] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { pendingCount, errorCount, doneCount } = useMemo(() => {
    let p = 0, e = 0, d = 0;
    for (const it of items) {
      if (it.status === "pending") p++;
      else if (it.status === "error") e++;
      else if (it.status === "done") d++;
    }
    return { pendingCount: p, errorCount: e, doneCount: d };
  }, [items]);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newItems: UploadItem[] = [];
    for (const f of Array.from(files)) {
      if (f.size > MAX_SIZE) {
        toast.error(`${f.name} 超過 10MB`);
        continue;
      }
      newItems.push({ file: f, status: "pending" });
    }
    setItems((prev) => [...prev, ...newItems]);
  };

  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));
  const retryFailed = () => setItems((prev) => prev.map((it) => (it.status === "error" ? { ...it, status: "pending", message: undefined } : it)));
  const clearFailed = () => setItems((prev) => prev.filter((i) => i.status !== "error"));
  const clearDone = () => setItems((prev) => prev.filter((i) => i.status !== "done"));
  const clearAll = () => setItems([]);

  const uploadAll = async () => {
    if (!items.some((i) => i.status === "pending")) {
      toast.error("沒有待上傳的檔案");
      return;
    }

    setIsUploading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast.error("尚未登入");
      setIsUploading(false);
      return;
    }

    let successCount = 0;
    let totalChunks = 0;
    const updatedItems = [...items];

    for (let i = 0; i < updatedItems.length; i++) {
      if (updatedItems[i].status !== "pending") continue;
      updatedItems[i] = { ...updatedItems[i], status: "uploading" };
      setItems([...updatedItems]);

      try {
        const fd = new FormData();
        fd.append("file", updatedItems[i].file);
        fd.append("language", language);
        if (tag.trim()) fd.append("tag", tag.trim());

        const res = await fetch(`https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/upload-knowledge-file`, {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: fd,
        });

        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "上傳失敗");

        updatedItems[i] = { ...updatedItems[i], status: "done", chunks: json.chunks, message: `已切成 ${json.chunks} 段` };
        successCount++;
        totalChunks += json.chunks || 0;
      } catch (e: any) {
        console.error(e);
        updatedItems[i] = { ...updatedItems[i], status: "error", message: e.message || "上傳失敗" };
      }
      setItems([...updatedItems]);
    }

    setIsUploading(false);

    if (successCount > 0) {
      let kickoffMessage = "檔案已加入知識庫，背景索引已排程";
      try {
        const kickoffResult = await kickoffEmailEmbeddingJob("upload", session.access_token);
        kickoffMessage = kickoffResult.message;
      } catch (error) {
        console.error(error);
        toast.error("檔案已上傳，但背景索引喚醒失敗，排程稍後仍會自動續跑");
      }

      toast.success(`已上傳 ${successCount} 個檔案，共 ${totalChunks} 段；${kickoffMessage}`);
      onUploaded?.({ uploadedCount: successCount, chunkCount: totalChunks });
    }
  };

  const canUpload = !isUploading && pendingCount > 0;
  const hint = isUploading ? "上傳中..." : pendingCount > 0 ? `${pendingCount} 個檔案待上傳` : items.length === 0 ? "請先選擇檔案" : errorCount > 0 ? `${errorCount} 個失敗，可重試` : "全部檔案已完成";
  const buttonLabel = isUploading ? "上傳中..." : pendingCount > 0 ? `開始上傳 (${pendingCount})` : doneCount > 0 && errorCount === 0 ? "已完成" : "開始上傳";

  return (
    <div className="rma-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Upload className="w-5 h-5 text-primary" />
        <div>
          <p className="font-medium text-foreground">上傳檔案到知識庫</p>
          <p className="text-xs text-muted-foreground">支援 .md / .txt / .eml / .pdf — 單檔最大 10MB，自動切段並排入背景索引</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">語言</label>
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className="rma-input w-full text-sm" disabled={isUploading}>
            <option value="zh-TW">繁體中文</option><option value="zh-CN">簡體中文</option><option value="en">English</option><option value="ja">日本語</option><option value="other">其他</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">標籤（選填，套用於本批檔案）</label>
          <input type="text" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="例如：產品說明書、保固政策" className="rma-input w-full text-sm" disabled={isUploading} />
        </div>
      </div>

      <div onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }} onClick={() => inputRef.current?.click()} className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"}`}>
        <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-foreground">拖放檔案到此 或 <span className="text-primary font-medium">點擊選擇</span></p>
        <p className="text-xs text-muted-foreground mt-1">支援多檔同時上傳</p>
        <input ref={inputRef} type="file" multiple accept={ACCEPTED} onChange={(e) => { handleFiles(e.target.files); if (inputRef.current) inputRef.current.value = ""; }} className="hidden" />
      </div>

      {items.length > 0 && <div className="space-y-2">{items.map((it, i) => <div key={i} className="flex items-center justify-between gap-2 p-2 border border-border rounded-md bg-muted/20"><div className="flex items-center gap-2 min-w-0 flex-1"><FileText className="w-4 h-4 text-muted-foreground shrink-0" /><div className="min-w-0 flex-1"><p className="text-sm text-foreground truncate">{it.file.name}</p><p className="text-xs text-muted-foreground">{(it.file.size / 1024).toFixed(1)} KB{it.message && ` · ${it.message}`}</p></div></div><div className="shrink-0 flex items-center gap-1">{it.status === "uploading" && <Loader2 className="w-4 h-4 animate-spin text-primary" />}{it.status === "done" && <CheckCircle2 className="w-4 h-4 text-primary" />}{it.status === "error" && <AlertCircle className="w-4 h-4 text-destructive" />}{(it.status === "pending" || it.status === "error") && !isUploading && <button onClick={() => removeItem(i)} className="p-1 hover:bg-muted rounded text-muted-foreground" title="移除"><X className="w-4 h-4" /></button>}</div></div>)}</div>}

      {items.length > 0 && <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">{pendingCount > 0 && <span>⏳ 待上傳 {pendingCount}</span>}{doneCount > 0 && <span className="text-primary">✓ 完成 {doneCount}</span>}{errorCount > 0 && <span className="text-destructive">✗ 失敗 {errorCount}</span>}</div>}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {errorCount > 0 && !isUploading && <button onClick={retryFailed} className="rma-btn-secondary text-sm"><RotateCw className="w-4 h-4" /> 重試失敗 ({errorCount})</button>}
        {errorCount > 0 && !isUploading && <button onClick={clearFailed} className="rma-btn-secondary text-sm">清除失敗</button>}
        {doneCount > 0 && !isUploading && <button onClick={clearDone} className="rma-btn-secondary text-sm">清除已完成</button>}
        {items.length > 0 && !isUploading && <button onClick={clearAll} className="rma-btn-secondary text-sm"><Trash className="w-4 h-4" /> 全部清空</button>}
        <span className="text-xs text-muted-foreground">{hint}</span>
        <button onClick={uploadAll} disabled={!canUpload} className="rma-btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed">{isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}{buttonLabel}</button>
      </div>
    </div>
  );
};

export default KnowledgeFileUpload;
