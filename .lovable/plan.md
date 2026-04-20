

## 計畫：折衷做法 + 完整第一階段實作

採用您選擇的方案：在系統設定加上模型切換器，並完成 Email 知識庫核心。

---

### 1. 資料表新增

**`ai_settings`** — 全域 AI 模型設定（單列）
- `id` (uuid, pk), `setting_key` (text, unique), `setting_value` (jsonb), `updated_at`, `updated_by`
- 預設記錄：`{ key: 'slack_reply_model', value: 'google/gemini-2.5-pro' }`、`{ key: 'admin_chat_model', value: 'google/gemini-2.5-flash' }`
- RLS：admin 讀、super_admin 改

**`email_knowledge_sources`** — 手動上傳的 FAQ / 客服範本 / 客戶 Email
- `id`, `source_type` ('faq' | 'template' | 'email'), `title`, `content`, `metadata` (jsonb：寄件者、語言、tag), `created_by`, `created_at`, `updated_at`
- RLS：僅 admin 可讀寫

**`email_embeddings`** — pgvector 嵌入（沿用 RMA 嵌入架構）
- `id`, `source_id` (fk → email_knowledge_sources), `content`, `embedding` (vector(1536)), `status` ('pending' | 'completed' | 'failed'), `metadata`, `created_at`, `updated_at`
- HNSW index on embedding
- 觸發器：`email_knowledge_sources` insert/update → 自動建立或標記 `pending`
- RPC：`search_email_embeddings(query_embedding, match_threshold, match_count)`

---

### 2. Edge Functions

| Function | 用途 | verify_jwt |
|---|---|---|
| `generate-email-embeddings` | 批次處理 pending 的 email_embeddings（OpenAI text-embedding-3-small） | true |
| `email-knowledge-chat` | 後台 AI 對話框（streaming，使用 admin_chat_model 設定） | true |
| `update-ai-settings` | super_admin 修改 ai_settings | true |

---

### 3. 前端

**新頁面 `/admin/email-knowledge`**
- 上傳區：選擇類型（FAQ / 客服範本 / 客戶 Email）+ 標題 + 內容（textarea）+ 語言 tag
- 列表：所有知識來源，可編輯、刪除
- `EmailEmbeddingManager`：類似現有 `EmbeddingManager`，顯示 pending/completed 數量、批次生成按鈕
- `EmailKnowledgeChat`：streaming AI 對話，從 email_embeddings RAG 取上下文

**`AdminDashboard.tsx`**：新增「📧 客戶 Email 知識庫」卡片連到 `/admin/email-knowledge`

**`AdminSettings.tsx`**：新增「AI 模型設定」區塊（僅 super_admin 可見）
- Slack 客服回覆模型：下拉選單（Gemini 2.5 Pro / GPT-5 / GPT-5.2），預設 Gemini 2.5 Pro
- 後台對話框模型：下拉選單（Gemini 2.5 Flash / Gemini 2.5 Pro / GPT-5 Mini），預設 Gemini 2.5 Flash
- 儲存按鈕呼叫 `update-ai-settings`

**`App.tsx`**：新增 `/admin/email-knowledge` 路由（ProtectedRoute requireAdmin）

---

### 4. 第一階段範圍 vs 預留

✅ **本次完成**
- 所有資料表 + RLS + 觸發器 + RPC
- 模型設定 UI（Settings 頁面）
- Email 知識庫頁面（手動上傳 + 嵌入 + AI 對話框）
- 三個 Edge Function

⏸ **預留到第二階段**（需您之後提供 Google OAuth 與 Slack App 憑證）
- Gmail OAuth 同步（在頁面上保留「連接 Gmail（即將推出）」按鈕）
- Slack 私訊 Bot（Slack App 建立後再實作 `slack-events` function）

---

### 5. 技術摘要

| 項目 | 值 |
|---|---|
| 嵌入模型 | OpenAI `text-embedding-3-small` (1536 維) |
| 後台對話預設模型 | `google/gemini-2.5-flash`（可切換） |
| Slack 回覆預設模型 | `google/gemini-2.5-pro`（可切換到 GPT-5 / GPT-5.2） |
| RAG 架構 | pgvector + HNSW（沿用 RMA 架構） |
| 不需要額外 API key | LOVABLE_API_KEY、OPENAI_API_KEY 都已設定 |

實作完成後，您即可：
1. 在 `/admin/settings` 切換 AI 模型
2. 在 `/admin/email-knowledge` 上傳 FAQ、客服回覆範本、過往客戶 Email
3. 用 AI 對話框查詢「上次 X 客戶問 Y 我們怎麼回？」
4. 等第二階段完成後，Slack 私訊就能自動套用設定的模型生成回覆

