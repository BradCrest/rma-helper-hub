# 資料庫 Schema 說明

## Table 關聯圖

```
auth.users
    │
    ├─── user_roles (role: admin | super_admin)
    ├─── login_logs
    └─── pending_admin_registrations

rma_requests ──────────────────────────────────────────
    ├─── rma_status_history
    ├─── rma_shipping
    ├─── rma_customer_contacts
    ├─── rma_customer_feedback
    ├─── rma_embeddings
    ├─── rma_reply_threads
    │        └─── rma_reply_messages
    └─── rma_deletion_logs (刪除快照)

email_knowledge_sources
    └─── email_embeddings

email_send_log
email_send_state
email_suppression_list
email_unsubscribe_tokens

email_embedding_jobs
rma_attachment_cleanup_logs
ai_settings
```

---

## 核心 RMA Tables

### `rma_requests`
主申請記錄表，所有 RMA 的起點。

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | UUID PK | |
| rma_number | TEXT UNIQUE | 格式：`RMA-YYYYMMDD-NNN`，由觸發器自動產生 |
| customer_name | TEXT NOT NULL | |
| customer_email | TEXT NOT NULL | |
| customer_phone | TEXT NOT NULL | |
| customer_address | TEXT | |
| customer_type | TEXT | 一般消費者 / 經銷商 / 代理商 等 |
| product_name | TEXT NOT NULL | |
| product_model | TEXT | |
| serial_number | TEXT | |
| purchase_date | DATE | |
| issue_type | TEXT NOT NULL | 螢幕問題 / 電池問題 等 |
| issue_description | TEXT NOT NULL | 包含寄件人身分前綴，如 `[一般消費者] ...` |
| status | rma_status | 見下方 enum 說明 |
| photo_urls | JSONB | 陣列，指向 `rma-photos` bucket |
| warranty_status | TEXT | 保固內 / 過保 / 無法判定 |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | 由觸發器自動更新 |

**rma_status enum**：
```
registered            → 已登錄
shipped               → 已寄出（客→公司）
received              → 已收到
inspecting            → 檢測中
contacting            → 聯繫客戶中
quote_confirmed       → 已確認方案
paid                  → 已付款
no_repair             → 不維修
shipped_back          → 已寄回（舊版歷史匯入）
shipped_back_new      → 寄回新品
shipped_back_refurbished → 寄回整新機
shipped_back_original → 寄回原機
follow_up             → 後續追蹤
closed                → 已結案
```

**觸發器**：
- `generate_rma_number_trigger`：INSERT 前自動產生 `RMA-YYYYMMDD-NNN`
- `update_rma_requests_updated_at`：UPDATE 時自動更新 `updated_at`
- `log_rma_status_change_trigger`：status 變更時寫入 `rma_status_history`

**RLS**：任何人可 SELECT（公開追蹤）；只有 admin 可 UPDATE/DELETE；INSERT 開放給 anon（實際由 Edge Function 用 service_role 執行）。

---

### `rma_status_history`
狀態變更的稽核軌跡，由觸發器自動寫入，不需手動 INSERT。

| 欄位 | 型別 | 說明 |
|------|------|------|
| rma_request_id | UUID FK | → rma_requests.id |
| status | rma_status | 新狀態 |
| notes | TEXT | 管理員備註 |
| changed_by | UUID FK | → auth.users.id |

---

### `rma_shipping`
寄件記錄，一筆 RMA 可有多筆（inbound + outbound）。

| 欄位 | 型別 | 說明 |
|------|------|------|
| rma_request_id | UUID FK | |
| direction | TEXT | `inbound`（客戶寄來）/ `outbound`（寄回客戶）|
| tracking_number | TEXT | |
| carrier | TEXT | 物流商名稱 |
| ship_date | DATE | |
| delivery_date | DATE | |

---

### `rma_customer_contacts`
客戶聯繫紀錄（電話、Email 等人工紀錄）。

| 欄位 | 說明 |
|------|------|
| contact_date | 聯繫日期 |
| contact_method | 聯繫方式 |
| notes | 內容摘要 |

---

### `rma_customer_feedback`
維修後滿意度調查。

| 欄位 | 說明 |
|------|------|
| satisfaction_score | 1~5 分 |
| feedback | 文字意見 |
| follow_up_date | 追蹤日期 |

---

## Email 相關 Tables

### `rma_reply_threads`
每筆 RMA 的 email 對話 thread。

| 欄位 | 說明 |
|------|------|
| rma_request_id | FK → rma_requests |
| thread_id | Gmail thread ID |
| subject | 信件主旨 |
| has_unread_replies | 是否有未讀回覆 |

### `rma_reply_messages`
Thread 內的每一封信。

| 欄位 | 說明 |
|------|------|
| thread_id | FK → rma_reply_threads |
| direction | `inbound`（客戶）/ `outbound`（管理員）|
| subject | 主旨 |
| body | 信件內容（HTML）|
| attachments | JSONB 陣列 |
| reply_token | 客戶回覆用的安全 token（32 bytes hex）|
| reply_token_used_at | Token 使用時間（用過即鎖定）|

### `email_send_log`
所有 transactional email 的寄送記錄。

| 欄位 | 說明 |
|------|------|
| message_id | 郵件服務商回傳的 Message-ID |
| template_name | 模板名稱（如 `rma-confirmation`）|
| recipient_email | 收件人 |
| status | `pending` / `sent` / `suppressed` / `failed` / `bounced` / `complained` / `dlq` |
| metadata | JSONB，存 rma_number、rma_request_id 等追蹤資訊 |

Unique index: `(message_id) WHERE status = 'sent'` — 防止 worker 重複寄送同一封信（race condition 防護）。

### `email_send_state`
Email queue 的全域設定（單一 row）。

| 欄位 | 說明 |
|------|------|
| batch_size | 每次 cron 執行寄送幾封 |
| send_delay_ms | 每封之間的延遲（毫秒）|
| retry_after_until | 暫停重試直到此時間 |

### `email_suppression_list`
退信 / 投訴 / 取消訂閱的 email 黑名單。

### `email_unsubscribe_tokens`
取消訂閱連結的 token，點擊後 `used_at` 被記錄。

---

## AI / Embedding Tables

### `email_knowledge_sources`
知識庫文件，供 RAG 使用。

| 欄位 | 說明 |
|------|------|
| source_type | `faq` / `template` / `email` / `document` |
| title | 文件標題 |
| content | 文字內容 |
| file_path | Storage 路徑（若為上傳檔案）|
| metadata | JSONB，存原始 Email 的 Gmail ID 等 |

### `email_embeddings`
知識庫的向量索引（pgvector）。

| 欄位 | 說明 |
|------|------|
| source_id | FK → email_knowledge_sources |
| content | 文字片段（chunked）|
| embedding | vector(1536) — OpenAI text-embedding-3-small 相容 |
| status | `pending` / `completed` / `failed` |
| attempt_count | 失敗重試次數 |

### `rma_embeddings`
RMA 記錄的向量索引，供 AI 分析使用。

| 欄位 | 說明 |
|------|------|
| rma_request_id | FK → rma_requests |
| content | 文字片段 |
| content_type | 內容類型（如 `issue_description`）|
| embedding | vector(1536) |
| metadata | JSONB |

### `email_embedding_jobs`
向量化背景任務的狀態追蹤。

| 欄位 | 說明 |
|------|------|
| job_type | 任務類型 |
| status | `idle` / `running` / `completed` / `failed` |
| trigger_source | 觸發來源（manual / cron）|

---

## 管理員 Tables

### `user_roles`
| 欄位 | 說明 |
|------|------|
| user_id | FK → auth.users |
| role | `admin` 或 `super_admin`（app_role enum）|

注意：`app_role` enum 最初只有 `admin` 和 `user`，後續 migration 擴充了 `super_admin`。

### `pending_admin_registrations`
新管理員申請審核佇列。

| 欄位 | 說明 |
|------|------|
| user_id | FK → auth.users |
| email | 申請人 Email |
| status | `pending` / `approved` / `rejected` |
| reviewed_by | 審核者 user_id |

### `login_logs`
管理員登入稽核，含地理位置。

| 欄位 | 說明 |
|------|------|
| user_id | FK → auth.users |
| event_type | `login` / `logout` |
| ip_address | 來源 IP |
| country / city / region | 地理位置（由 Edge Function 查詢）|
| user_agent | 瀏覽器 UA |

### `ai_settings`
AI 模型設定（key-value 格式）。

| 欄位 | 說明 |
|------|------|
| setting_key | 設定名稱（如 `llm_model`）|
| setting_value | JSONB 值 |
| updated_by | 最後更新者 user_id |

---

## 稽核 Tables

### `rma_deletion_logs`
RMA 被刪除時的快照，防止資料遺失。

| 欄位 | 說明 |
|------|------|
| rma_number | 被刪除的 RMA 號碼 |
| rma_data | JSONB，完整記錄快照 |
| deleted_by | 操作者 user_id |

### `rma_attachment_cleanup_logs`
Storage 清理任務的執行記錄。

| 欄位 | 說明 |
|------|------|
| cleanup_run_at | 執行時間 |
| files_deleted | 刪除檔案數 |
| bytes_freed | 釋放空間（bytes）|
| trigger_source | `cron` / `manual` |

---

## 重要 PostgreSQL Extensions

| Extension | 用途 |
|-----------|------|
| `pgvector` | 儲存和查詢向量 embeddings |
| `pgmq` | Email 訊息佇列（`auth_emails` / `transactional_emails` + DLQ）|
| `pg_cron` | 排程 cron job（email queue 處理、embedding 觸發）|
| `pg_net` | Edge Function 內發 HTTP 請求 |
| `supabase_vault` | 安全儲存 secrets |
