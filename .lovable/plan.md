
## 「客戶來信」分頁規劃

在 `後勤管理` → 把「客戶來信」放在「收件處理」**之前**，作為第一個分頁（最常用：每天先看信）。透過已連接的 Gmail Connector（`content@crestdiving.com`）讀取信件，並串接既有的 AI 草擬回覆功能。

---

### 功能範圍（第一版）

只做「**讀信 + AI 草擬回覆**」，不做「直接從系統寄出」（避免一開始就要處理 SPF/DKIM 與寄件人身份問題）。回覆方式維持「複製草稿 → 貼回 Gmail 寄出」。

| 模組 | 功能 |
|---|---|
| 信件清單 | 讀取 INBOX 最近 50 封，顯示寄件人、主旨、收信時間、未讀標記、是否已回覆 |
| 篩選/搜尋 | 全部 / 未讀 / 未回覆；關鍵字搜尋（用 Gmail `q=` 語法） |
| 信件詳閱 | 右側面板顯示完整內文，自動偵測信中的 RMA 編號並連結到 RMA 詳情 |
| AI 草擬回覆 | 一鍵帶入信件內容呼叫 `draft-email-reply`（複用既有 RAG）|
| 回覆動作 | 複製草稿；標記為已讀/已處理；開啟 Gmail 網頁版回信 |
| 知識庫沉澱 | 修正草稿後可「存為知識」（複用既有流程，tag = `客服回覆`）|

第二版（之後再做）：直接從系統發送回覆、附件下載、多信箱切換。

---

### UI 設計

採用左右雙欄（類似 Gmail / 客服收件匣），手機版自動疊成兩個全螢幕視圖。

```text
┌─────────────────────────────────────────────────────────────────┐
│ [📧 客戶來信] [📦 收件處理] [📞 客戶處理] [🏭 供應商] ...      │
├─────────────────────────────────────────────────────────────────┤
│ 📧 客戶來信  content@crestdiving.com  [● Connected]  [🔄 同步]│
│ [🔍 搜尋...]  [全部 ▾] [未讀] [未回覆]   共 47 封 · 12 未讀   │
├──────────────────────┬──────────────────────────────────────────┤
│ ● Mary Chen          │ 主旨：請問我的 RMA 進度                  │
│   請問我的 RMA 進度  │ 寄件人：mary@example.com                 │
│   今天 14:32  [RMA]  │ 時間：2026-04-27 14:32                   │
│ ─────────────────── │ [🔗 RC7E9001234 查看 RMA]                │
│ ○ 王先生 (已回覆)    │ ─────────────────────────────────────── │
│   防水殼漏水…        │ 您好，我於 3/15 寄出的潛水電腦…          │
│   昨天 10:15         │ （完整內文）                             │
│ ─────────────────── │                                          │
│ ● John Lee           │ ─────────────────────────────────────── │
│   發票補開需求       │ [✨ AI 草擬回覆]  [📋 複製到 Gmail]      │
│   昨天 09:01         │ [✓ 標記已讀]  [↗ 在 Gmail 開啟]          │
│ ...                  │                                          │
│                      │ ┌─ AI 草稿（檢索 5 筆知識庫）──────┐    │
│                      │ │ 您好 Mary，                       │    │
│                      │ │ 您寄修的潛水電腦 RC7E900...        │    │
│                      │ │ ...                                │    │
│                      │ └────────────────────────────────────┘    │
│                      │ [💾 修正後存為知識]                      │
└──────────────────────┴──────────────────────────────────────────┘
```

UI 細節：
- 左側清單寬度約 360px，未讀字體加粗、左邊有藍點；偵測到 RMA 編號的信件加 `[RMA]` chip
- 已回覆的信件顯示淡灰 + ✓ 圖示（用 Gmail label `Answered/已回覆` 判斷，沒貼此標籤就視為未回覆）
- 沿用既有 `rma-card`、`Button`、`Badge`、shadcn `Dialog` 等元件，與 ReceivingTab/CustomerHandlingTab 風格一致
- 右上角顯示連線狀態 chip：綠色 `Connected` / 紅色 `Disconnected`（讀取失敗時提示重新連線）

---

### 技術架構

#### 新增 Edge Function

| Function | 用途 | verify_jwt |
|---|---|---|
| `gmail-list-messages` | 列出收件匣（支援 `q`、`pageToken`、`maxResults`），回傳精簡欄位 | true |
| `gmail-get-message` | 取得單封完整內容（含 plain text body 解碼） | true |
| `gmail-modify-message` | 標記已讀 / 加上「已回覆」label | true |

全部走 Gmail Connector Gateway（`https://connector-gateway.lovable.dev/google_mail/gmail/v1/...`），用 `LOVABLE_API_KEY` + `GOOGLE_MAIL_API_KEY` 兩個 header。每個 function 開頭驗證使用者必須是 admin / super_admin（沿用 `draft-email-reply` 的權限檢查模式）。

#### 前端新增檔案

- `src/components/logistics/CustomerEmailTab.tsx` — 主分頁（信件清單 + 詳閱 + AI 草擬整合）
- `src/lib/gmail-utils.ts` — 解析 RFC 2822 header、base64url decode、偵測 RMA 編號（重用既有 regex `/R[A-Z0-9]{10}/i`）

#### 修改檔案

- `src/pages/AdminLogistics.tsx` — 在 tabs 陣列**最前面**插入 `{ id: "email", label: "客戶來信", icon: Mail }`，並加 `<TabsContent value="email">`，預設 `activeTab` 改為 `"email"`
- `supabase/config.toml` — 三個新 function 加 `verify_jwt = true`

#### 串接既有功能

- AI 草擬：直接呼叫現有的 `supabase.functions.invoke("draft-email-reply", { body: { subject, body, sender, rmaNumber } })`
- 存知識：複用 `email_knowledge_sources` insert + `kickoffEmailEmbeddingJob("manual")`
- RMA 連結：偵測到 RMA 編號後用 `<Link to="/admin/rma">` 或開 `RmaDetailDialog`

#### 「已回覆」判斷機制

第一次使用時自動建立 Gmail label `已回覆`（呼叫 `POST /labels`，幂等處理）。使用者按下「複製到 Gmail」或「✓ 標記已處理」時，呼叫 `gmail-modify-message` 加上此 label 並移除 `UNREAD`。清單根據此 label 顯示「已回覆」徽章。

#### 必要 OAuth scope 確認

從 plan 中已知連線是 `gmail.readonly`。本規劃需要的額外 scope：
- `gmail.modify` — 標記已讀、加 `已回覆` label
- `gmail.labels` — 建立 `已回覆` label

如果連線目前**沒有**這兩個 scope，第一次呼叫會收到 `403 insufficient authentication scopes`，前端會顯示「需要重新授權」按鈕，觸發 `reconnect` 流程要求加上 `gmail.modify` + `gmail.labels`。

---

### 風險與注意事項

1. **Gmail label 中文** — Gmail label name 支援中文，但內部 ID 仍是英數字（`Label_1234`），建立後要存下 ID 重複使用；建議 label 名稱改用 `RMA-Replied` 避免日後 label 名稱衝突。
2. **HTML 信件處理** — 客戶來信可能是 HTML（不是純文字）。第一版只解 `text/plain` 部分；若信件只有 `text/html`，用簡單 regex 去 tag 後顯示（之後可換 DOMPurify）。
3. **同步頻率** — 不做 webhook，按下「🔄 同步」或進入分頁才呼叫 API；避免 Gmail API quota 浪費。
4. **連線顯示** — 進入分頁時呼叫 `verify_credentials` gateway endpoint，回 `verified` 才顯示綠色，其他狀態都顯示紅色 + 重連按鈕。

---

### 實作順序（核准後執行）

1. 建立三個 edge function（list / get / modify）
2. 新增 `CustomerEmailTab.tsx`，先做「列表 + 詳閱 + AI 草擬 + 複製」（不含 modify）
3. 在 `AdminLogistics.tsx` 插入新分頁、調整預設 tab
4. 驗證 scope；若不足，跑 reconnect 流程加上 `gmail.modify` + `gmail.labels`
5. 加上「標記已回覆」label 流程與徽章顯示
6. 整合「修正後存為知識」按鈕

確認規劃後我就開始實作。
