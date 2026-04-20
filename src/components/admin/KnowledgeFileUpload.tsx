import { useState, useRef } from "react";
import { Upload, FileText, Loader2, X, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface UploadItem {
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  message?: string;
  chunks?: number;
}

interface Props {
  onUploaded?: () => void;
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

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const uploadAll = async () => {
    const pending = items.filter((i) => i.status === "pending");
    if (pending.length === 0) {
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

        const res = await fetch(
          `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/upload-knowledge-file`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${session.access_token}` },
            body: fd,
          }
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "上傳失敗");

        updatedItems[i] = {
          ...updatedItems[i],
          status: "done",
          chunks: json.chunks,
          message: `已切成 ${json.chunks} 段`,
        };
        successCount++;
        totalChunks += json.chunks || 0;
      } catch (e: any) {
        console.error(e);
        updatedItems[i] = {
          ...updatedItems[i],
          status: "error",
          message: e.message || "上傳失敗",
        };
      }
      setItems([...updatedItems]);
    }

    setIsUploading(false);

    if (successCount > 0) {
      toast.success(`成功上傳 ${successCount} 個檔案，共 ${totalChunks} 段內容已加入知識庫`);
      // Auto-trigger embedding generation
      try {
        await supabase.functions.invoke("generate-email-embeddings");
        toast.success("已開始生成嵌入向量");
      } catch (e) {
        console.error("Auto-embed failed", e);
      }
      onUploaded?.();
    }
  };

  const clearDone = () => setItems((prev) => prev.filter((i) => i.status !== "done"));

  return (
    <div className="rma-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Upload className="w-5 h-5 text-primary" />
        <div>
          <p className="font-medium text-foreground">上傳檔案到知識庫</p>
          <p className="text-xs text-muted-foreground">
            支援 .md / .txt / .eml / .pdf — 單檔最大 10MB，自動切段並加入向量索引
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">語言</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="rma-input w-full text-sm"
            disabled={isUploading}
          >
            <option value="zh-TW">繁體中文</option>
            <option value="zh-CN">簡體中文</option>
            <option value="en">English</option>
            <option value="ja">日本語</option>
            <option value="other">其他</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">標籤（選填，套用於本批檔案）</label>
          <input
            type="text"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="例如：產品說明書、保固政策"
            className="rma-input w-full text-sm"
            disabled={isUploading}
          />
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/30"
        }`}
      >
        <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-foreground">
          拖放檔案到此 或 <span className="text-primary font-medium">點擊選擇</span>
        </p>
        <p className="text-xs text-muted-foreground mt-1">支援多檔同時上傳</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED}
          onChange={(e) => {
            handleFiles(e.target.files);
            if (inputRef.current) inputRef.current.value = "";
          }}
          className="hidden"
        />
      </div>

      {/* File list */}
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((it, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-2 p-2 border border-border rounded-md bg-muted/20"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground truncate">{it.file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(it.file.size / 1024).toFixed(1)} KB
                    {it.message && ` · ${it.message}`}
                  </p>
                </div>
              </div>
              <div className="shrink-0">
                {it.status === "uploading" && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                {it.status === "done" && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                {it.status === "error" && <AlertCircle className="w-4 h-4 text-destructive" />}
                {it.status === "pending" && (
                  <button
                    onClick={() => removeItem(i)}
                    className="p-1 hover:bg-muted rounded text-muted-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        {items.some((i) => i.status === "done") && (
          <button onClick={clearDone} className="rma-btn-secondary text-sm" disabled={isUploading}>
            清除已完成
          </button>
        )}
        <button
          onClick={uploadAll}
          disabled={isUploading || items.filter((i) => i.status === "pending").length === 0}
          className="rma-btn-primary text-sm"
        >
          {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          上傳並建立索引
        </button>
      </div>
    </div>
  );
};

export default KnowledgeFileUpload;
