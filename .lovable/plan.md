## 目標

在 `系統設定 > 附件清理` 區塊上方新增「**常用檔案庫**」，讓管理員可以上傳/管理常用檔案（保固政策 PDF、產品說明書、報價單範本…），之後在「RMA 回覆」與「客服 Email」兩處可一鍵插入為附件，免去重複上傳。

---

## 一、資料層

### 1.1 新增 Storage bucket：`shared-library`
- Private bucket
- RLS：admin 可 SELECT / INSERT / UPDATE / DELETE；其他角色不可存取

### 1.2 新增資料表：`shared_library_files`

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | 顯示名稱（管理員可改） |
| `file_name` | text | 原始檔名 |
| `path` | text | storage 路徑 `shared-library/{uuid}-{name}` |
| `size` | bigint | bytes |
| `content_type` | text | MIME |
| `category` | text NULL | 分類標籤（選填，例如：保固、報價、說明書）|
| `description` | text NULL | 備註說明 |
| `uploaded_by` | uuid NULL | |
| `uploaded_by_email` | text NULL | |
| `download_count` | int | 被插入次數（統計用）|
| `created_at` / `updated_at` | timestamptz | |

**RLS**：admin 可 SELECT / INSERT / UPDATE / DELETE。

---

## 二、後端 — 不需要新 edge function

直接用 supabase-js 操作即可：
- 上傳：`storage.from('shared-library').upload()` + `from('shared_library_files').insert()`
- 取簽章 URL（用於 RMA 回覆寄信）：`storage.from('shared-library').createSignedUrl(path, 30*86400)`
- 刪除：`storage.remove()` + `delete()`

**插入到 RMA 回覆時的處理**：把該檔案複製到 `rma-attachments/rma-replies/{rmaId}/` 目錄（或直接引用 `shared-library` 路徑），讓現有的 `send-rma-reply` 流程不需改動。**採方案 A：複製檔案**（最簡單、隔離乾淨、不影響日後 cleanup 邏輯）。

---

## 三、UI

### 3.1 新元件：`src/components/admin/SharedLibrarySettings.tsx`
位置：`AdminSettings.tsx` 中，**置於 `<AttachmentCleanupSettings />` 之上**。

功能：
- **上傳區**：拖放 / 點擊選檔（支援多檔），可填分類與備註；單檔上限 25 MB
- **檔案列表**：表格顯示 名稱 / 分類 / 大小 / 上傳時間 / 使用次數 / 操作（下載、改名、刪除）
- **搜尋與分類篩選**：依檔名、分類過濾
- **改名 / 改分類 / 改備註**：inline 編輯或小 dialog
- **刪除**：確認後刪 storage + DB row

權限：admin 即可查看與管理（與其他清理設定一致）。

### 3.2 在「RMA 回覆」插入功能
**`src/components/logistics/RmaReplyTab.tsx`** 附件區的「+ 上傳」旁新增「📚 從檔案庫加入」按鈕：
1. 開啟 dialog 列出檔案庫（含搜尋、分類篩選）
2. 多選 → 確認
3. 對每個選中檔案：
   - 從 `shared-library` 下載 blob
   - 重新上傳到 `rma-attachments/rma-replies/{rmaId}/{uuid}-{name}`
   - push 到 `attachments` state（與現有 `UploadedAttachment` 同結構）
   - 對 `shared_library_files.download_count` +1（背景，失敗不阻擋）
4. 受現有 `MAX_ATTACHMENTS = 5` 限制

### 3.3 在「客服 Email / 草稿回信」插入功能
**`src/components/admin/DraftEmailReply.tsx`**（草稿回信元件）— 同樣加一個「從檔案庫加入」按鈕，邏輯與 3.2 類似但目標 bucket 視該元件原本附件流程而定（待實作時對齊既有機制）。

> 若 `DraftEmailReply` 目前沒有附件流程，本期僅在 RMA 回覆加上插入功能，Email 端的整合留待後續（會在實作時再評估，避免擴大範圍）。

---

## 四、影響檔案

**新增**
- `supabase/migrations/{ts}_shared_library.sql` — bucket + 表 + RLS
- `src/components/admin/SharedLibrarySettings.tsx`
- `src/components/admin/SharedLibraryPicker.tsx`（從檔案庫選檔的 dialog，給 RMA 回覆用）

**修改**
- `src/pages/AdminSettings.tsx` — 在 `<AttachmentCleanupSettings />` 上方掛 `<SharedLibrarySettings />`
- `src/components/logistics/RmaReplyTab.tsx` — 附件區加「從檔案庫加入」按鈕、整合 picker
- `src/components/admin/DraftEmailReply.tsx` — 視現況加入或留待後續（實作時決定）

---

## 五、待您確認

1. **權限**：檔案庫管理（上傳 / 改 / 刪）給「所有 admin」就好，還是要限「super_admin」？  
   → 預設：**所有 admin**（與「附件清理立即執行」按鈕的權限一致）

2. **單檔上限**：預設 **25 MB**（與 RMA 回覆附件一致）；可接受？

3. **DraftEmailReply 整合**：本期一起做，還是先只做 RMA 回覆？  
   → 預設：**先做 RMA 回覆**，Email 端留待您確認既有附件流程後再補

如無異議，按上述預設執行。
