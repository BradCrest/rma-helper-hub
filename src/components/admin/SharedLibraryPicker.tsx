import { useEffect, useState, useCallback } from "react";
import { Loader2, FolderOpen, FileText, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

interface LibFile {
  id: string;
  name: string;
  file_name: string;
  path: string;
  size: number;
  content_type: string | null;
  category: string | null;
  download_count: number;
}

export interface PickedLibFile {
  id: string;
  name: string;
  file_name: string;
  path: string;
  size: number;
  content_type: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (files: PickedLibFile[]) => void;
  maxSelectable?: number;
}

export default function SharedLibraryPicker({ open, onOpenChange, onConfirm, maxSelectable }: Props) {
  const [files, setFiles] = useState<LibFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("shared_library_files")
      .select("id, name, file_name, path, size, content_type, category, download_count")
      .order("created_at", { ascending: false });
    if (error) toast.error("讀取檔案庫失敗：" + error.message);
    else setFiles((data || []) as LibFile[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) {
      load();
      setSelected(new Set());
      setSearch("");
      setFilterCategory("");
    }
  }, [open, load]);

  const categories = Array.from(new Set(files.map(f => f.category).filter(Boolean))) as string[];
  const visible = files.filter(f => {
    const matchSearch = !search || f.name.toLowerCase().includes(search.toLowerCase()) || f.file_name.toLowerCase().includes(search.toLowerCase());
    const matchCat = !filterCategory || f.category === filterCategory;
    return matchSearch && matchCat;
  });

  const toggle = (f: LibFile) => {
    const next = new Set(selected);
    if (next.has(f.id)) next.delete(f.id);
    else {
      if (maxSelectable && next.size >= maxSelectable) {
        toast.error(`最多選擇 ${maxSelectable} 個檔案`);
        return;
      }
      next.add(f.id);
    }
    setSelected(next);
  };

  const handleConfirm = () => {
    const picked: PickedLibFile[] = files
      .filter(f => selected.has(f.id))
      .map(f => ({
        id: f.id,
        name: f.name,
        file_name: f.file_name,
        path: f.path,
        size: f.size,
        content_type: f.content_type,
      }));
    onConfirm(picked);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-primary" />
            從常用檔案庫選擇
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="搜尋檔名..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="rma-input text-sm sm:max-w-[180px]"
          >
            <option value="">所有分類</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto border border-border rounded-lg">
          {loading ? (
            <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : visible.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              {files.length === 0 ? "檔案庫尚無檔案，請先到系統設定上傳" : "找不到符合條件的檔案"}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {visible.map((f) => {
                const isSel = selected.has(f.id);
                return (
                  <li
                    key={f.id}
                    onClick={() => toggle(f)}
                    className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30 ${isSel ? "bg-primary/5" : ""}`}
                  >
                    <input type="checkbox" checked={isSel} onChange={() => toggle(f)} className="shrink-0" />
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate" title={f.name}>{f.name}</div>
                      <div className="text-xs text-muted-foreground flex gap-2">
                        <span>{formatBytes(f.size)}</span>
                        {f.category && <span>· {f.category}</span>}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <div className="text-sm text-muted-foreground">已選 {selected.size}{maxSelectable ? ` / 最多 ${maxSelectable}` : ""}</div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
            <Button onClick={handleConfirm} disabled={selected.size === 0}>加入附件</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
