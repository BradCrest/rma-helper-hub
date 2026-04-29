## 目標

在「後勤管理 → 客戶來信」分頁，AI 完成草稿後，讓管理員可以**直接以 noreply 方式寄出回覆**，並支援：
- 一次性附件上傳（最多 5 個、單檔 ≤25MB）
- 從**常用檔案庫**選擇附件（直接連結、不複製檔案）

附件規則、簽名 URL（30 天）、檔案庫 badge、刪除行為，全部沿用 RMA 回覆既有實作。

---

## 與 RMA 回覆的差異

| 項目 | RMA 回覆 | 客戶來信回覆（新） |
|---|---|---|
| 收件人來源 | RMA 紀錄上的 `customer_email` | 直接從 Gmail 信件 `from` 解析 |
| 主旨預設值 | 管理員自填 | 預設 `Re: {原信主旨}` |
| 客戶端追蹤連結 | 30 天 reply token，存 `rma_thread_messages` | **不需要**：純單向回信，沒有 thread 追蹤 |
| RMA 編號 | 必有 | 偵測到才帶（detectedRma） |
| 附件儲存路徑 | `rma-attachments/rma-replies/{rmaId}/...` | `rma-attachments/email-replies/{gmailMessageId}/...` |
| 模板 | `rma-reply` | 新增 `customer-email-reply`（簡化版，無 reply CTA） |

---

## 實作步驟

### 1. 新增 Edge Function：`send-customer-email-reply`

直接以 `send-rma-reply` 為藍本複製改寫，重點差異：
- 入參：`{ gmailMessageId, recipientEmail, recipientName?, subject, body, rmaNumber?, attachments[] }`
- 驗證身份：admin / super_admin
- 附件路徑驗證：
  - `source: "upload"` → 必須在 `email-replies/{gmailMessageId}/` 下
  - `source: "library"` → 比對 `shared_library_files.path` 確認存在（沿用 RMA 邏輯）
- 簽名 URL：`upload` 用 `rma-attachments` bucket、`library` 用 `shared-library` bucket，皆 30 天
- 不寫 `rma_thread_messages`（沒有 reply token / thread）；只透過 `send-transactional-email` 寄送
- `idempotencyKey`: `customer-email-reply-{gmailMessageId}-{timestamp}`，並在 metadata 寫入 `gmail_message_id` 方便日後追查

### 2. 新增 Email 模板：`customer-email-reply.tsx`

放在 `supabase/functions/_shared/transactional-email-templates/`：
- Props: `subject`, `customerName`, `replyBody`, `rmaNumber?`, `attachments?: {name,url,size}[]`
- 排版沿用 `rma-reply.tsx` 的視覺風格（白底、品牌色、附件以下載按鈕呈現）
- **不含 reply CTA 按鈕**（這封是 noreply 單向回覆）
- 註冊到 `registry.ts`

### 3. 改 `CustomerEmailTab.tsx` 草稿區下方新增「寄出區塊」

在現有 `draft` textarea 下方加入：

```text
┌─ 寄出回覆 ──────────────────────────────┐
│ 收件人：jane@example.com (Jane Doe)      │
│ 主旨：[Re: 原主旨............]           │
│ ─ 附件（最多 5 個） ────────────────     │
│ [📎 上傳檔案] [📚 從檔案庫選擇]          │
│ • invoice.pdf  120KB  [檔案庫] [移除]   │
│ • photo.jpg    2.1MB           [移除]    │
│ ─────────────────────────────────────    │
│              [取消]  [📧 以 noreply 寄出] │
└──────────────────────────────────────────┘
```

行為細節（沿用 RMA 回覆）：
- 上傳：`supabase.storage.from("rma-attachments").upload("email-replies/{gmailMessageId}/{uuid}-{name}", file)`
- 從檔案庫選：用既有 `<SharedLibraryPicker>`，加入時只存 reference（`source: "library"`, `libraryFileId`, library `path`），同時 best-effort `increment download_count`
- 移除：`upload` 來源同步刪 storage；`library` 來源僅從清單移除
- 大小/數量限制：5 個、單檔 25MB、總和不顯示（與 RMA 一致）
- UI badge：library 來源顯示藍色 "檔案庫"
- 寄出按鈕：呼叫 `send-customer-email-reply`，成功後 toast 並把附件清單清空、按鈕鎖定避免重複寄送

可以把 RMA 回覆裡的附件區塊抽成共用 component（`<ReplyAttachmentList>`）以避免重複，或直接複製貼上後續再重構——建議**先複製貼上**完成功能，之後若有第三處再抽。

### 4. 狀態管理

`CustomerEmailTab` 新增 state：
- `replySubject`（預設 `Re: {detail.subject}`，可編輯）
- `attachments: UploadedAttachment[]`
- `uploadingFiles: boolean`
- `sending: boolean`
- `libraryPickerOpen: boolean`

選新信件時重置這些 state（在 `loadDetail` 開頭已做 reset 模式，新增到 reset 邏輯中）。

### 5. 不需要的東西

- ❌ 不需要新的 storage bucket（重用 `rma-attachments`，只是路徑前綴改成 `email-replies/`）
- ❌ 不需要 migration（沒有新表）
- ❌ 不需要新的 secret
- ❌ 不需要 reply token / thread 紀錄

### 6. RLS / Storage policy

`rma-attachments` 既有 RLS 應已允許 admin 上傳到任意路徑；新前綴 `email-replies/` 只要 policy 是 `is_admin(auth.uid())` 而非綁 RMA id 就直接適用。實作時會先 `supabase--read_query` 確認，若 policy 寫死了 `rma-replies/` 前綴則需新增一條 policy（最小變動）。

### 7. 自動清理（與既有機制相容）

`cleanup-rma-attachments` Edge Function 目前只清「已 completed 90 天」的 RMA 附件（按 RMA 狀態過濾）。`email-replies/` 下的檔案不在那個清理範圍內，會永久留存。

如果要清理 email-replies 也可加進排程，但**先不做**，等使用後再依量決定（可在後續加一個「90 天前的 email-replies/」周期清理）。

---

## 驗收清單

- [ ] AI 草稿產生後，下方出現「寄出回覆」區塊，自動帶入收件人與 Re: 主旨
- [ ] 可上傳最多 5 個附件，超過上限或大小有清楚錯誤提示
- [ ] 可從檔案庫挑選，list 顯示「檔案庫」badge，移除不會刪原檔
- [ ] 點「以 noreply 寄出」收到信，附件下載連結可用、30 天後失效
- [ ] 客戶端收到的信件 From 為 noreply@notify.crestdiving.com（沿用 transactional 設定），不含 reply CTA
- [ ] 寄出失敗時 toast 顯示後端錯誤訊息（不要吞錯誤）
- [ ] 切換到另一封信時，附件清單與寄出狀態會重置

---

## 修改的檔案

新增：
- `supabase/functions/send-customer-email-reply/index.ts`
- `supabase/functions/_shared/transactional-email-templates/customer-email-reply.tsx`

修改：
- `supabase/functions/_shared/transactional-email-templates/registry.ts`（註冊新模板）
- `src/components/logistics/CustomerEmailTab.tsx`（新增寄出區塊與相關 handlers）
- `mem://features/shared-library`（補一行：客戶來信回覆也支援檔案庫引用）

可選（後續視重複程度再做）：
- 抽出 `src/components/logistics/ReplyAttachmentList.tsx` 共用元件
