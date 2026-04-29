## 目標

Email 中從**檔案庫選擇**的附件改為「**直接連結存取**」（簽名 URL，有時效），不再複製到 `rma-attachments`。手動上傳的一次性附件維持原本流程。

---

## 現況回顧

目前在 `RmaReplyTab.tsx`，使用者按「檔案庫」選擇檔案後：
1. 從 `shared-library` bucket 下載 Blob
2. 重新上傳一份到 `rma-attachments/rma-replies/{rmaId}/`
3. `send-rma-reply` 為這份複本產生 30 天簽名 URL，寫入 email

問題：
- 檔案被複製多份，浪費儲存空間
- 90 天清理機制會把複本刪掉，但**原檔還在檔案庫**，造成重複管理
- 大檔案上傳/下載一次很慢

---

## 新行為（區分兩種附件）

| 類型 | Source | Email 連結 | 儲存位置 | 過期後 |
|---|---|---|---|---|
| 一次性上傳 | `rma-attachments` | 30 天簽名 URL | `rma-replies/{rmaId}/` | 連結失效，檔案待 90 天自動清 |
| 檔案庫引用 | `shared-library` | 30 天簽名 URL（指向原檔） | `shared-library/`（原位） | 連結失效，原檔保留 |

兩者**對客戶體驗一致**：點連結即下載；過期則需請管理員重發 email。差別僅在後端不複製。

---

## 實作步驟

### 1. 前端 `RmaReplyTab.tsx` — 改寫「檔案庫」插入邏輯
- 移除 download → re-upload 流程
- 直接把選中的檔案以「library reference」型別加進附件清單，attachment 物件新增 `source: "library"` + `libraryFileId`、`path` 改填 library 路徑（例如 `library:{path}`）
- UI 上以 badge 標示「檔案庫」以便管理員識別（hover 時提示「過期後仍可重新寄送」）
- 仍呼叫 `increment download_count`（best-effort）

### 2. 後端 `send-rma-reply/index.ts` — 支援雙來源簽名
- 擴充 `AttachmentSchema`：新增 `source: z.enum(["upload", "library"]).default("upload")`
- 路徑驗證分流：
  - `source === "upload"` → 必須 `rma-replies/{rmaRequestId}/...`（維持現狀）
  - `source === "library"` → 比對 `shared_library_files` 表中存在該路徑（防止偽造）
- 簽名 URL 產生：
  - upload → `admin.storage.from("rma-attachments").createSignedUrl(...)`
  - library → `admin.storage.from("shared-library").createSignedUrl(path, 30天, { download: name })`
- `attachments` JSONB 寫入時把 `source` 一併保存，方便日後 UI 顯示與重發

### 3. 清理機制不需動
- `cleanup-rma-attachments` 僅針對 `rma-attachments` bucket，library 引用本來就不會被誤刪
- 唯一注意：若管理員從檔案庫**刪除原檔**，舊 email 連結會失效。這是預期行為（與檔案被刪除的語意一致）。可在 `SharedLibrarySettings` 刪除前加提示：「此檔案可能被歷史 RMA email 引用，刪除後相關連結將失效」

### 4. UI 細節
- `RmaReplyTab` 附件清單：library 來源以藍色 badge `檔案庫`；upload 來源無 badge
- 附件移除：library 來源「移除」只是從這封 email 移除引用，不會刪原檔；upload 來源維持現有行為
- Reply 歷史顯示：library 附件一樣可下載（透過簽名 URL，過期後顯示「連結已過期」）

---

## 需要修改的檔案

- `src/components/logistics/RmaReplyTab.tsx` — 改寫檔案庫插入流程、UI badge
- `src/components/admin/SharedLibrarySettings.tsx` — 刪除前警告
- `supabase/functions/send-rma-reply/index.ts` — schema、雙來源簽名

不需要新的 migration、不需要新的 bucket、不需要新的 secret。

---

## 風險與權衡

- **優點**：節省儲存、上傳快、檔案庫成為單一真實來源
- **限制**：管理員若刪除 library 原檔，過往 email 連結會失效（會在 UI 加警告）
- **安全**：簽名 URL 仍有 30 天時效；後端會驗證 library 路徑確實存在於 `shared_library_files`，避免被偽造任意 storage 路徑