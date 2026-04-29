## 整體目標

在「後勤管理」新增「**RMA 回覆**」分頁，提供完整的雙向 RMA 對話：

1. 管理員選 RMA → AI 草擬 → 修改 → **Gmail 寄出**
2. 客戶 Email 內含「**填寫我的回覆**」按鈕 → 開公開頁面填寫
3. 客戶回覆寫回該筆 RMA 的「**問題與回覆記錄**」
4. 管理員回到分頁就能看到客戶新回覆，繼續下一輪 AI 草擬／回覆
5. 任何階段都可以「**存入知識庫**」（類型：`rma_reply` / 顯示「RMA 往來」）並喚醒背景索引

---

## 流程圖

<lov-artifact url="/__l5e/documents/rma-reply-flow.mmd" mime_type="text/vnd.mermaid"></lov-artifact>

---

## 一、資料庫變更（一個新表 + 一個新欄位）

新表 **`rma_thread_messages`**（取代直接讀寫 `rma_customer_contacts`，職責更清楚）：

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | uuid PK | |
| `rma_request_id` | uuid | 對應 RMA |
| `direction` | text | `outbound`(客服→客戶) / `inbound`(客戶→客服) |
| `subject` | text | 主旨 |
| `body` | text | 純文字內容 |
| `from_name` / `from_email` | text | 寄件人顯示資訊 |
| `gmail_message_id` | text nullable | outbound 寄出後存下 |
| `reply_token` | text nullable unique | outbound 寄出時產生，用於客戶公開回覆頁 |
| `reply_token_expires_at` | timestamptz | 預設 30 天後 |
| `reply_token_used_at` | timestamptz nullable | 客戶按下回覆後標記 |
| `parent_message_id` | uuid nullable | inbound 指回觸發的 outbound |
| `created_by` | uuid nullable | 客服 outbound 才有 |
| `read_by_admin_at` | timestamptz nullable | inbound 已讀時間 |
| `created_at` | timestamptz | |

**RLS：**
- admin 全權限
- `INSERT inbound` 開放給 `anon`，但用 Edge Function（service role）寫入並驗證 token，所以實務上不直接給 anon insert 政策；Edge Function 用 service role bypass。

新欄位：`rma_requests.has_unread_customer_reply boolean default false`（簡化列表「未讀」徽章；inbound 寫入時 trigger 設為 true，admin 標記已讀後設為 false）。

> 不重用 `rma_customer_contacts` —— 那張表是內部聯絡記錄（電話/通話備註），與 Email 雙向對話 schema 不同；硬塞會讓兩邊都難用。

---

## 二、新／改 Edge Functions

### 1. `send-rma-reply`（新）
- Auth：admin
- 入參：`rmaRequestId`、`subject`、`body`
- 流程：
  1. 撈 RMA 取 `customer_email` / `customer_name` / `rma_number`
  2. 產生 `reply_token = crypto.randomUUID()`，預設 30 天有效
  3. 組純文字 + HTML Email：
     - 內含「**請填寫您的回覆 →**」按鈕，連結 `https://<host>/rma-reply/<token>`
     - 也附純文字 fallback URL
  4. 透過 Gmail Connector Gateway `POST /users/me/messages/send` 寄出
  5. 寫一筆 `rma_thread_messages`（direction=`outbound`，含 token、`gmail_message_id`）
  6. 寫 `email_send_log`：`template_name='rma_reply'`
- 回傳：`{ success, threadMessageId }`

### 2. `submit-customer-reply`（新）
- 公開（不需 auth），用 service role
- 入參（zod）：`token`、`body`（必填）
- 流程：
  1. 查 `rma_thread_messages` 找 outbound by `reply_token`
  2. 驗：未過期、未使用
  3. 寫 inbound 記錄（`parent_message_id` 指向該 outbound）
  4. 標記 outbound `reply_token_used_at = now()`
  5. 把 RMA `has_unread_customer_reply = true`
  6. 觸發 `slack-notify` 通知有新客戶回覆
- 回傳：`{ success: true }`

### 3. `lookup-rma-reply-thread`（新，公開）
- 入參：`token`
- 回傳給客戶頁顯示用：`rma_number`（遮罩到末四碼或全顯，依需求）、原始 `subject`、客服回覆 `body`、是否已過期/已使用
- 不暴露客戶 email、phone 等 PII

> 沿用既有 `draft-email-reply`，無須改它。

### `supabase/config.toml`：`submit-customer-reply` 與 `lookup-rma-reply-thread` 設 `verify_jwt = false`（公開）。

---

## 三、前端

### A. Tabs 改動 `src/pages/AdminLogistics.tsx`
- 在 `tabs` 陣列最前面（客戶來信之前）加：`{ id: "rma-reply", label: "RMA 回覆", icon: MessageSquareReply }`
- 預設 `activeTab` 改為 `"rma-reply"`
- 新增 `<TabsContent value="rma-reply">` render 新元件 `<RmaReplyTab />`

### B. 新元件 `src/components/logistics/RmaReplyTab.tsx`（兩欄）

**左欄 — RMA 列表**
- `supabase.from("rma_requests").select(...).order("created_at desc").limit(100)`
- 搜尋（RMA / 客戶名 / Email / 產品）+ 狀態篩選
- 每列：RMA 編號、客戶名、狀態 Badge、時間
- 若 `has_unread_customer_reply === true`，右側加 🔴 紅點

**右欄 — 詳情 + 對話 + 草稿**
1. **案件摘要卡**：客戶、產品、狀態、建立日
2. **問題與回覆記錄**（時間倒序）
   - 顯示原始客戶問題（`issue_description` 等）
   - 顯示 `rma_thread_messages` 全部（outbound/inbound 不同樣式氣泡）
   - 第一次點開時若有 inbound 未讀 → 自動 `update has_unread_customer_reply = false`
3. **主旨**輸入框（預設 `Re: [<rma_number>] 您的維修申請進度回覆`）
4. **AI 草擬按鈕** → 呼叫 `draft-email-reply`，body 帶入「客戶最新一則訊息（inbound 優先，否則原始問題）」
5. **草稿 Textarea**（可編輯）+ 模型 / RAG 引用筆數
6. **底部按鈕**：
   - 📧 寄出 → `send-rma-reply`
   - 💾 存入知識庫 → 寫 `email_knowledge_sources` (type=`rma_reply`) → `kickoffEmailEmbeddingJob('rma-reply-save')`
   - 複製

### C. 新公開頁 `src/pages/RmaCustomerReply.tsx`
- 路由：`/rma-reply/:token` (在 `App.tsx` Routes 註冊，不放 ProtectedRoute)
- 載入：`supabase.functions.invoke("lookup-rma-reply-thread", { body: { token } })`
- 三種狀態：
  - **正常** → 顯示 RMA 編號、原始問題、客服回覆、Textarea + 送出按鈕
  - **已過期** → 顯示「此回覆連結已過期，請來信或致電客服」
  - **已使用** → 顯示「您已透過此連結回覆過了，若還有問題請來信」
- 送出 → `submit-customer-reply`，成功後顯示「✅ 已送出，客服會在 1–2 個工作天回覆」

### D. 知識庫存檔內容
```
【客戶問題】
RMA：<rma_number>
客戶：<customer_name>
產品：<product_name> <product_model>

<最新一則 inbound 或原始問題>

---

【客服回覆（已人工確認）】
<finalReply>
```
metadata：`{ tag: "RMA 往來", rma_number, rma_request_id, sent_at, saved_from: "rma_reply_tab" }`
DB trigger `mark_email_embedding_pending` 會自動排入向量索引。

### E. 來源類型 label
`email_knowledge_sources` 顯示處（`RecentKnowledgeUploads` 等）若有 type label map → 加 `rma_reply: "RMA 往來"`。

---

## 四、Email 內容範本（`send-rma-reply` 內聯產生）

純文字版：
```
您好 <customer_name>，

關於您的維修申請 <rma_number>，我們的回覆如下：

<body>

——
若您想針對這個回覆做出進一步說明或追問，請點擊下方連結填寫：
<reply_url>
（連結 30 天內有效，僅可使用一次）

CREST 客服團隊
```

HTML 版：包同樣文字 + 一顆藍色按鈕「填寫我的回覆」。

---

## 五、需要你決定的兩個小細節

1. **客戶公開回覆頁是否要顯示 RMA 編號全碼**？預設我打算「全碼顯示」，因為他本來就有編號才能收到信；如果想保守只顯示末四碼也可以。
2. **客戶回覆是否每次都寄一封通知 Email 給客服信箱**？目前計畫只用 Slack 通知 + 後台未讀紅點；不寄 Email，避免重複。需要再加。

確認後就直接實作。
