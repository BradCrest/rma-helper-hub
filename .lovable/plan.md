## 背景

兩個需求：
1. **RC7EA058460** 的 `issue_type = '軟體問題'`，這類問題通常不需要寄回維修，所以不應該寄送「未寄件提醒」Email。
2. 未來會有多種 Email（提醒、狀態更新、完工通知等），需要一個統一的地方記錄每筆 RMA 已發送過哪些 Email。

實際上，系統已有 `email_send_log` 資料表記錄所有寄出的 Email，但目前在 RMA 詳細頁面（`RmaDetailDialog`）並沒有顯示。我們可以利用現有的 log 表，在 RMA 詳情中新增一個「Email 寄送記錄」區塊。

## 變更內容

### 1. 寄送提醒時跳過「軟體問題」

**檔案：** `supabase/functions/send-shipping-reminders/index.ts`

在自動排程（cron）的查詢條件加入 `.neq('issue_type', '軟體問題')`，避免軟體問題的 RMA 進入提醒名單。

手動觸發（admin 從後台按鈕重寄）一樣保留 issue_type 檢查，但會回傳明確訊息（例如 `skipped: software_issue`），讓管理員知道為什麼沒寄。

> 註：此規則僅適用「未寄件提醒」這封信。其他類型的 Email（如狀態變更通知）不受影響。
> 
> 若未來想擴充「不寄提醒的問題類型清單」（例如還想加入 `APP問題`、`韌體問題`），可以改成陣列比對。本次先以「軟體問題」為單一條件，保持簡單。

### 2. RMA 詳情頁面新增「Email 寄送記錄」區塊

**檔案：** `src/components/rma/RmaDetailDialog.tsx`

在 Dialog 內新增一個區塊（放在「寄件資訊」之後、「狀態歷程」附近），顯示這筆 RMA 寄出過的所有 Email：

- **資料來源：** `email_send_log` 表，透過 `recipient_email = customer_email` 篩選。
- **顯示欄位：** 
  - 寄送時間（`created_at`）
  - 信件類型（`template_name` → 顯示中文名稱對照表，例如 `shipping-reminder` → "未寄件提醒"）
  - 收件人（`recipient_email`）
  - 狀態（`status`：pending/sent/failed/suppressed → 中文 badge）
- **排序：** 最新在上。
- **權限：** RLS 上 `email_send_log` 目前僅 service role 可讀。需新增一條 admin SELECT policy，讓管理員也能讀。
- **空狀態：** 「尚未發送任何 Email」。

### 3. 模板名稱中文對照

在前端建立一個小型對照表，方便未來新增 Email 模板時擴充：

```text
shipping-reminder      → 未寄件提醒
(未來新增的模板)        → 對應中文名稱
```

放在 `src/lib/emailTemplateLabels.ts`，集中管理。

## 技術細節

### 資料庫變更
- 新增 RLS policy：`email_send_log` 允許 `is_admin(auth.uid())` SELECT。
- 不需要新增表格 — `email_send_log` 已具備所有必要欄位（message_id、template_name、recipient_email、status、created_at）。
- 同一封信可能有多筆 log（pending → sent），前端用 `message_id` 去重，只顯示最新狀態。

### Edge Function 變更
- `send-shipping-reminders/index.ts`：自動排程查詢加 `.neq('issue_type', '軟體問題')`；手動觸發路徑檢查 issue_type 並回傳 `{ skipped: 'software_issue' }`。
- 部署 `send-shipping-reminders`。

### 前端變更
- `RmaDetailDialog.tsx`：新增 `useEffect` 在 dialog 打開時 query `email_send_log`，渲染清單。
- `src/lib/emailTemplateLabels.ts`：新增模板名稱對照表。

## 不變更項目

- `email_send_log` 表結構不變。
- 其他 Edge Function 不變。
- 既有寄信流程（pgmq 佇列、send-transactional-email）不變。

## 風險

- 軟體問題的 RMA 之後仍可能需要寄送其他通知（例如「我們已收到您的詢問」），這些不會被本次修改影響，因為過濾條件只在 `send-shipping-reminders` 內。