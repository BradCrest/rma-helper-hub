import { useEffect, useState, useCallback, useRef } from "react";
import { Loader2, Upload, Trash2, RefreshCw, FolderOpen, Download, Pencil, X, Check, FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";

const BUCKET = "shared-library";
const MAX_SIZE = 25 * 1024 * 1024;

interface LibFile {
  id: string;
  name: string;
  file_name: string;
  path: string;
  size: number;
  content_type: string | null;
  category: string | null;
  description: string | null;
  download_count: number;
  created_at: string;
  uploaded_by_email: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sanitize(name: string) {
  return name.replace(/[^\w.\-]+/g, "_");
}

export default function SharedLibrarySettings() {
  const { user } = useAuth();
  const [files, setFiles] = useState<LibFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadCategory, setUploadCategory] = useState("");
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("shared_library_files")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error("讀取檔案庫失敗：" + error.message);
    else setFiles((data || []) as LibFile[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const list = Array.from(fileList);
    setUploading(true);
    let success = 0;
    for (const file of list) {
      try {
        if (file.size > MAX_SIZE) {
          toast.error(`${file.name} 超過 25 MB，已略過`);
          continue;
        }
        const path = `${crypto.randomUUID()}-${sanitize(file.name)}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
          contentType: file.type || undefined,
          cacheControl: "3600",
        });
        if (upErr) throw upErr;
        const { error: insErr } = await supabase.from("shared_library_files").insert({
          name: file.name,
          file_name: file.name,
          path,
          size: file.size,
          content_type: file.type || null,
          category: uploadCategory.trim() || null,
          uploaded_by: user?.id ?? null,
          uploaded_by_email: user?.email ?? null,
        });
        if (insErr) {
          await supabase.storage.from(BUCKET).remove([path]);
          throw insErr;
        }
        success++;
      } catch (e) {
        toast.error(`${file.name} 上傳失敗：${e instanceof Error ? e.message : "未知錯誤"}`);
      }
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
    if (success > 0) {
      toast.success(`已上傳 ${success} 個檔案`);
      load();
    }
  };

  const handleDownload = async (f: LibFile) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(f.path, 60, {
      download: f.file_name,
    });
    if (error) {
      toast.error("產生下載連結失敗：" + error.message);
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  const handleDelete = async (f: LibFile) => {
    if (!confirm(`確定要刪除「${f.name}」？此動作無法復原。`)) return;
    const { error: storageErr } = await supabase.storage.from(BUCKET).remove([f.path]);
    if (storageErr) {
      toast.error("刪除檔案失敗：" + storageErr.message);
      return;
    }
    const { error: dbErr } = await supabase.from("shared_library_files").delete().eq("id", f.id);
    if (dbErr) {
      toast.error("刪除紀錄失敗：" + dbErr.message);
      return;
    }
    toast.success("已刪除");
    load();
  };

  const startEdit = (f: LibFile) => {
    setEditingId(f.id);
    setEditName(f.name);
    setEditCategory(f.category ?? "");
    setEditDescription(f.description ?? "");
  };

  const saveEdit = async (f: LibFile) => {
    if (!editName.trim()) {
      toast.error("名稱不能為空");
      return;
    }
    const { error } = await supabase.from("shared_library_files").update({
      name: editName.trim(),
      category: editCategory.trim() || null,
      description: editDescription.trim() || null,
    }).eq("id", f.id);
    if (error) {
      toast.error("更新失敗：" + error.message);
      return;
    }
    setEditingId(null);
    toast.success("已更新");
    load();
  };

  const categories = Array.from(new Set(files.map(f => f.category).filter(Boolean))) as string[];
  const visible = files.filter(f => {
    const matchSearch = !search || f.name.toLowerCase().includes(search.toLowerCase()) || f.file_name.toLowerCase().includes(search.toLowerCase());
    const matchCat = !filterCategory || f.category === filterCategory;
    return matchSearch && matchCat;
  });

  return (
    <div className="bg-white rounded-xl shadow-sm border border-border p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">常用檔案庫</h2>
          <span className="text-xs text-muted-foreground">共 {files.length} 個檔案</span>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <p className="text-xs text-muted-foreground mb-4">
        上傳常用檔案（保固政策、產品說明書、報價單範本等），日後在 RMA 回覆時可一鍵插入為附件。單檔上限 25 MB。
      </p>

      {/* Upload */}
      <div className="border border-dashed border-border rounded-lg p-4 mb-4 bg-muted/30">
        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
          <Input
            placeholder="分類（選填，例如：保固、報價、說明書）"
            value={uploadCategory}
            onChange={(e) => setUploadCategory(e.target.value)}
            disabled={uploading}
            className="sm:max-w-xs"
          />
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
          <Button onClick={() => inputRef.current?.click()} disabled={uploading} size="sm">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Upload className="w-4 h-4 mr-1.5" />}
            選擇檔案上傳
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <Input
          placeholder="搜尋檔名..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-xs"
        />
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="rma-input text-sm sm:max-w-xs"
        >
          <option value="">所有分類</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></div>
      ) : visible.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-8">
          {files.length === 0 ? "尚無檔案，請先上傳" : "找不到符合條件的檔案"}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="text-left py-2 px-2 font-medium">名稱</th>
                <th className="text-left py-2 px-2 font-medium">分類</th>
                <th className="text-right py-2 px-2 font-medium">大小</th>
                <th className="text-right py-2 px-2 font-medium">使用次數</th>
                <th className="text-left py-2 px-2 font-medium">上傳時間</th>
                <th className="text-right py-2 px-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((f) => (
                <tr key={f.id} className="border-b last:border-0 hover:bg-muted/30 align-top">
                  {editingId === f.id ? (
                    <>
                      <td className="py-2 px-2" colSpan={6}>
                        <div className="space-y-2">
                          <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="名稱" />
                          <Input value={editCategory} onChange={(e) => setEditCategory(e.target.value)} placeholder="分類（選填）" />
                          <Input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="備註（選填）" />
                          <div className="flex gap-2 justify-end">
                            <Button size="sm" variant="outline" onClick={() => setEditingId(null)}><X className="w-4 h-4 mr-1" />取消</Button>
                            <Button size="sm" onClick={() => saveEdit(f)}><Check className="w-4 h-4 mr-1" />儲存</Button>
                          </div>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-2 px-2">
                        <div className="flex items-start gap-2">
                          <FileText className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <div className="font-medium text-foreground truncate max-w-[260px]" title={f.name}>{f.name}</div>
                            {f.description && <div className="text-xs text-muted-foreground truncate max-w-[260px]" title={f.description}>{f.description}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="py-2 px-2">
                        {f.category ? <span className="inline-block bg-muted px-2 py-0.5 rounded text-xs">{f.category}</span> : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="py-2 px-2 text-right whitespace-nowrap">{formatBytes(f.size)}</td>
                      <td className="py-2 px-2 text-right">{f.download_count}</td>
                      <td className="py-2 px-2 whitespace-nowrap text-xs text-muted-foreground">
                        {format(new Date(f.created_at), "yyyy-MM-dd HH:mm")}
                      </td>
                      <td className="py-2 px-2">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => handleDownload(f)} title="下載"><Download className="w-4 h-4" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => startEdit(f)} title="編輯"><Pencil className="w-4 h-4" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(f)} title="刪除" className="text-destructive hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
