## 問題

`/admin/rma-list` 詳細視窗（在 `AdminRmaList.tsx` 內，**不是** `RmaDetailDialog.tsx`）沒有「Email 寄送記錄」區塊，所以即使資料庫有 5 筆 log，admin 也看不到。

## 解法

在 `AdminRmaList.tsx` 的 `handleViewRma()` 同時抓 `email_send_log`，並在詳細視窗的「狀態歷史記錄」與「客戶聯繫記錄」之間插入一個新區塊顯示。

## 變更（僅一個檔案）

**`src/pages/AdminRmaList.tsx`**

1. **新增 state**：`emailLogs`（去重後每封 email 一筆，最新狀態）。
2. **`handleViewRma()`** 的 `Promise.all` 加上一個查詢：
   ```ts
   supabase
     .from("email_send_log")
     .select("*")
     .eq("recipient_email", rma.customer_email)
     .order("created_at", { ascending: false })
   ```
   取回後依 `message_id` 去重（保留最新一筆 / 沒有 message_id 的也保留）；過濾出與本 RMA 相關的記錄（依 `metadata.rma_number` 比對；沒有 metadata 時 fallback 用 `recipient_email` 全部顯示）。
3. **新增 UI 區塊**「Email 寄送記錄」插在第 2140 行（狀態歷史記錄結束）與第 2142 行（客戶聯繫記錄開始）之間：
   - icon + 標題「Email 寄送記錄」
   - 空狀態：「尚無 Email 寄送記錄」
   - 列表：每筆顯示
     - 模板中文名稱（用 `getEmailTemplateLabel`）
     - 狀態 badge（用 `getEmailStatusLabel`，sent=綠、failed/dlq=紅、suppressed/bounced=黃、pending=灰）
     - 收件人
     - 寄送時間（`formatDate`）
     - 失敗時顯示 `error_message`
4. **import** `getEmailTemplateLabel`、`getEmailStatusLabel` from `@/lib/emailTemplateLabels`。

## 不變更

- `RmaDetailDialog.tsx`（之前那個改動仍然有效，但這個頁面不用它）
- `lookup-rma` Edge Function
- 資料庫結構、RLS（admin 已有 `email_send_log` SELECT 權限）
- `AdminRmaList` 直接用 `supabase` client 查（admin 登入態，RLS 通過），不需要 lookup-rma。
