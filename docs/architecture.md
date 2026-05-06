# 系統架構說明

## 整體分層

```
┌─────────────────────────────────────────────────────┐
│                   瀏覽器 (React)                     │
│  公開頁面：申請 / 追蹤 / 寄件 / 客戶回覆             │
│  管理後台：RMA 管理 / 物流 / 知識庫 / 設定           │
└────────────────────┬────────────────────────────────┘
                     │ supabase.functions.invoke()
                     │ supabase.from().select()  ← 唯讀，RLS 控管
                     ▼
┌─────────────────────────────────────────────────────┐
│              Supabase Edge Functions (Deno)          │
│  所有寫入操作都在這裡，使用 service_role 繞過 RLS    │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│           PostgreSQL (Supabase 託管)                 │
│  RLS 政策控制前端直接查詢的資料範圍                  │
└─────────────────────────────────────────────────────┘
```

**重要原則**：前端從不直接寫入資料庫。所有 INSERT/UPDATE/DELETE 都透過 Edge Functions，用 `SUPABASE_SERVICE_ROLE_KEY` 繞過 RLS。

---

## 前端路由架構

```
App.tsx
├── AuthProvider (全域認證 Context)
└── BrowserRouter
    ├── /                    → Index (RMA 申請)
    ├── /track               → Track (狀態查詢)
    ├── /shipping            → Shipping
    ├── /shipping-form       → ShippingForm
    ├── /rma-confirmation    → RmaConfirmation
    ├── /rma-multi-confirmation → RmaMultiConfirmation
    ├── /rma-reply/:token    → RmaCustomerReply (token 驗證)
    ├── /unsubscribe         → Unsubscribe
    ├── /admin               → Admin (登入頁)
    └── /admin/* (ProtectedRoute — 需 admin role)
        ├── /dashboard       → AdminDashboard
        ├── /rma-list        → AdminRmaList
        ├── /logistics       → AdminLogistics
        ├── /email-knowledge → AdminEmailKnowledge
        ├── /csv-import      → AdminCsvImport
        └── /settings        → AdminSettings
```

---

## 認證與授權

```
Supabase Auth
    ↓ 登入成功
useAuth (AuthProvider)
    ↓ 查詢 user_roles table
    isAdmin = role IN ('admin', 'super_admin')
    isSuperAdmin = role = 'super_admin'
    ↓
ProtectedRoute
    requireAdmin prop → 檢查 isAdmin
```

- `has_role()` 是 SECURITY DEFINER 函式，防止 RLS 遞迴查詢
- Edge Functions 的 admin 驗證：檢查 JWT 後再查 `user_roles`
- 公開 Edge Functions（客戶提交 RMA）不驗證 JWT，但有欄位驗證

---

## RMA 申請流程

```
RmaForm.tsx
  ├── 單筆模式（一般消費者 / 經銷商 / 代理商）
  │     └── handleSubmit() → invoke("submit-rma", { ...fields })
  └── 多筆模式（經銷/代理商多筆）
        ├── 手動新增（MultiProductForm）
        ├── CSV 匯入（CsvImportSection → rmaMultiCsvParser）
        └── handleMultiSubmit() → invoke("submit-rma", { products: [...] })

submit-rma Edge Function
  ├── 驗證必填欄位
  ├── INSERT → rma_requests（service_role）
  ├── 非阻塞：invoke("send-transactional-email") → 確認信
  └── 非阻塞：invoke("slack-notify") → Slack 通知
```

---

## Email 系統架構

```
寄信方（各 Edge Function）
    ↓ POST /functions/v1/send-transactional-email
send-transactional-email
    ├── 渲染 React Email 模板（supabase/functions/_shared/transactional-email-templates/）
    ├── 檢查 email_send_log 是否已有相同 idempotencyKey（防重複寄送）
    ├── 檢查 email_suppression_list（退訂 / 退信）
    └── INSERT → email_send_log (status = 'pending')

process-email-queue（cron job，每分鐘執行）
    ├── 讀取 email_send_log WHERE status = 'pending'
    ├── 批次寄送（batch_size 和 send_delay_ms 來自 email_send_state）
    └── UPDATE status → 'sent' / 'failed'

handle-email-suppression（退信 webhook）
    └── UPDATE email_send_log status → 'bounced' / 'complained'
        + INSERT → email_suppression_list
```

**Email 模板清單**（`registry.ts`）：
- `rma-confirmation` — RMA 申請確認
- `rma-reply` — 管理員回覆 RMA（含 reply token）
- `customer-email-reply` — 管理員回覆客戶來信（單向，無 reply CTA）
- `shipping-reminder` — 寄件提醒

---

## AI 功能架構

```
知識庫建立
  上傳文件 / Email / FAQ
    ↓ upload-knowledge-file / kickoff-email-embedding-job
    ↓ generate-email-embeddings / generate-rma-embeddings
    ↓ 寫入 email_embeddings / rma_embeddings（pgvector）

RAG 查詢（email-knowledge-chat）
  管理員輸入問題
    ↓ 向量化問題
    ↓ pgvector 語意搜尋 → 取最相關 N 筆知識
    ↓ 組成 prompt → Claude API
    ↓ 回傳草稿

AI 分析（rma-ai-analysis）
  管理員選擇時間範圍
    ↓ 查詢 rma_requests + 統計資料
    ↓ Claude API 分析
    ↓ 回傳 Markdown 報告

AI 設定（ai_settings table）
  可設定：LLM provider、model、temperature、max_tokens
  由 /admin/settings → update-ai-settings Edge Function 更新
```

---

## Gmail 整合

```
AdminLogistics → CustomerEmailTab
    ↓ invoke("gmail-list-messages")  ← 列出收件匣
    ↓ invoke("gmail-get-message")    ← 取得信件內容
    ↓ invoke("gmail-modify-message") ← 標記已讀 / 加標籤
    ↓ invoke("draft-email-reply")    ← AI 起草回覆
    ↓ invoke("send-customer-email-reply") ← 寄出回覆
```

---

## 物流工作流（AdminLogistics）

AdminLogistics 是一個 Tab 式介面，包含四個子分頁：

| Tab | 元件 | 功能 |
|-----|------|------|
| RMA 回覆 | `RmaReplyTab` | 管理 RMA email 往返對話（thread 模式） |
| 客戶來信 | `CustomerEmailTab` | 處理 Gmail 收件匣，AI 草稿回覆 |
| 收件管理 | `ReceivingTab` | 記錄客戶寄回的貨物 |
| 客戶處理 | `CustomerHandlingTab` | 追蹤客戶聯繫紀錄 |

---

## CSV 匯入流程

兩套 parser，用途不同：

| Parser | 用途 | 欄位數 | 使用頁面 |
|--------|------|--------|----------|
| `csvParser.ts` | 從舊系統匯入完整 RMA 記錄（包含維修歷史）| 51 | `/admin/csv-import` |
| `rmaMultiCsvParser.ts` | 經銷商批量新申請 | 精簡 | RmaForm 多筆模式 |

`csvParser.ts` 的 51 欄對應 `CSV_COLUMN_MAP`，header 為繁體中文，status 欄位需轉換為英文 enum（`STATUS_MAP`）。

---

## Storage Buckets

| Bucket | 用途 | 路徑格式 |
|--------|------|----------|
| `rma-photos` | RMA 申請時上傳的產品照片 | `rma/{timestamp}-{random}.{ext}` |
| `rma-attachments` | 管理員回覆附件 | `rma-replies/{rmaId}/...` 或 `email-replies/{gmailMessageId}/...` |
| `shared-library` | 客服常用文件庫 | 由管理員上傳，可在回覆中引用 |

`cleanup-rma-attachments`（cron）自動清理已結案（`closed` bucket）超過 90 天的 RMA 附件。`email-replies/` 目前不在清理範圍。
