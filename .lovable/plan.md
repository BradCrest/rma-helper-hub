## 目標

在 RMA 回覆 Email 中支援「附件 = 下載連結」：管理員上傳檔案 → 存到 Storage → 產生 30 天 signed URL → Email 內以「📎 下載附件」按鈕呈現。附件記錄保留在 `rma_thread_messages` 中，未來可在 RMA 詳情頁查到歷史。

---

## 預設設定（採用上次討論的建議）

| 項目 | 值 |
|---|---|
| Storage bucket | `rma-attachments`（**私有**，用 signed URL） |
| 單檔大小上限 | 25 MB |
| 每封回覆檔案數上限 | 5 個 |
| 連結有效期 | 30 天（與 reply token 一致） |
| 允許檔案類型 | jpg, png, heic, webp, pdf, doc, docx, xls, xlsx, zip |

---

## 變更總覽

```text
1. 新增 Storage bucket  rma-attachments（私有）+ RLS policy
2. 新增欄位            rma_thread_messages.attachments (jsonb)
3. 改 Edge Function    send-rma-reply  → 接收 attachments，產生 signed URL
4. 改 Email Template   rma-reply.tsx   → 渲染附件下載按鈕區塊
5. 改前端 UI           RmaReplyTab.tsx → 上傳 / 列表 / 移除附件 UI
6. 對話歷史顯示        在 thread 訊息中也顯示已寄出的附件名稱
```

---

## 1. 資料庫變更（migration）

**Bucket**：建立 `rma-attachments`，`public = false`。

**RLS（storage.objects）**：
- Admin 可 `INSERT` / `SELECT` / `DELETE` bucket 內物件
- 一般用戶無權限（Email 收件人透過 signed URL 存取，不需 RLS）

**Schema**：在 `rma_thread_messages` 新增
```sql
ALTER TABLE rma_thread_messages
  ADD COLUMN attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
-- 結構: [{ name, path, size, contentType, uploadedAt }]
```

---

## 2. 前端 UI 改動（`src/components/logistics/RmaReplyTab.tsx`）

在「回覆內容」textarea 下方、按鈕列上方，新增「附件」區塊：

- 「＋ 加入附件」按鈕（呼叫隱藏的 `<input type="file" multiple>`）
- 已選檔案列表（每行：圖示 / 檔名 / 大小 / 移除 X）
- 上傳進度顯示（小 spinner 或 % 文字）
- 上限驗證：>5 檔或 >25 MB 即時提示，副檔名不符直接拒絕

**上傳流程**：
1. 使用者選檔 → 立即用 `supabase.storage.from('rma-attachments').upload()` 上傳到 `rma-replies/{rmaId}/{uuid}-{filename}`
2. 上傳成功的檔案存進 React state `attachments: UploadedFile[]`
3. 按「寄出回覆」時，把 `attachments`（含 storage path）一起傳給 `send-rma-reply`
4. 寄送失敗或使用者移除某檔 → 從 storage 刪掉對應物件（避免孤兒檔）
5. 切換到別的 RMA 或寄送成功後，清空 state

**對話歷史**：渲染 `m.attachments`（如果有），顯示為「📎 檔名（大小）」清單，方便管理員回顧過去附件。

---

## 3. Edge Function 改動（`supabase/functions/send-rma-reply/index.ts`）

**Schema 新增**：
```ts
attachments: z.array(z.object({
  name: z.string().min(1).max(255),
  path: z.string().min(1).max(500),
  size: z.number().int().nonnegative().max(25 * 1024 * 1024),
  contentType: z.string().max(200).optional(),
})).max(5).default([]),
```

**處理流程**：
1. 驗證每個 `path` 都以 `rma-replies/{rmaRequestId}/` 開頭（防止存取其他 RMA 的檔案）
2. 對每個附件呼叫 `admin.storage.from('rma-attachments').createSignedUrl(path, 30 * 24 * 3600)`，得到 30 天有效的 download URL
3. 將「附件 metadata + signed URL」組成 `templateAttachments` 陣列傳給 email template
4. 寫入 `rma_thread_messages.attachments` 欄位（**只存 metadata + path，不存 signed URL**，因為 URL 會過期；未來顯示歷史時若需要再生新 URL）

---

## 4. Email Template 改動（`supabase/functions/_shared/transactional-email-templates/rma-reply.tsx`）

**Props 新增**：
```ts
attachments?: Array<{
  name: string;
  url: string;
  size: number;
}>
```

**渲染**：在「填寫我的回覆」按鈕區塊**之上**新增附件區（如果 `attachments?.length > 0`）：

```text
┌────────────────────────────────────┐
│ 📎 附件（2）                        │
│                                    │
│ [📄 報價單.pdf  下載]  120 KB       │
│ [🖼 維修照片.jpg 下載] 850 KB       │
│                                    │
│ 連結 30 天內有效                   │
└────────────────────────────────────┘
```

每個附件用 React Email 的 `Button` 元件，連到 signed URL；旁邊小字顯示檔案大小。

更新 `previewData` 加入 1-2 個範例附件。

---

## 5. 安全考量

- **Path 驗證**：edge function 強制檢查 path prefix `rma-replies/{rmaRequestId}/`，防止管理員 A 拿到 RMA B 的檔案路徑後寄出
- **Bucket 私有**：物件無法被猜到 URL 直接存取
- **Signed URL 30 天**：與 reply token 同步，過期即失效
- **檔案大小 / 數量上限**：前端 + zod schema 雙重驗證
- **副檔名白名單**：前端驗證（後端不嚴格擋，因為 contentType 可偽造，主要靠 bucket 私有 + signed URL 控制風險）
- **RLS**：Storage RLS 限制只有 admin 能寫入 / 列出 bucket

---

## 6. 不在這次範圍

- 客戶回覆時上傳附件（目前 customer reply 表單沒有附件功能 — 之後若要可再規劃）
- 附件預覽（直接靠瀏覽器處理 PDF/圖片）
- 附件單獨刪除 UI（已寄出後不提供刪除，避免破壞 email 連結；未寄送前可從 compose 區移除）
- 過期 signed URL 的自動續期（30 天足夠，過期視為正常生命週期結束）

---

## 完成後測試流程

1. 進入「RMA 回覆」分頁，選一筆 RMA
2. 撰寫回覆內容 → 上傳 1-2 個附件（測試 jpg + pdf）
3. 按「寄出回覆」
4. 收件信箱應收到 email，內含「📎 附件」區塊
5. 點下載連結 → 瀏覽器下載檔案
6. 回到管理面板，對話歷史那筆 outbound 訊息應顯示附件列表
