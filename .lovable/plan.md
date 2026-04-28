## 問題

RC7EA057459 確實有 5 筆 Email 寄送記錄在 `email_send_log` 中（收件人：`cathy@crestdiving.com`），但 RMA 詳細視窗的「Email 寄送記錄」區塊顯示空白。

## 根因

`RmaDetailDialog` 透過 `lookup-rma` Edge Function 載入資料時，只帶 anon key（沒有帶 admin 的 JWT）。`lookup-rma` 看到 `isAdmin = false`，於是回傳**遮罩過的 email**（例如 `c***y@crestdiving.com`）。

前端拿這個被遮罩的 email 去 query `email_send_log` 當然查不到任何資料 — 真實 log 裡記的是 `cathy@crestdiving.com`。

## 解法

修改 `RmaDetailDialog.tsx` 的 `fetchRmaData()`，從 `supabase.auth.getSession()` 取得目前登入 admin 的 access token，用它來呼叫 `lookup-rma`。這樣 `lookup-rma` 內的 `isAdminCaller()` 才會通過，回傳未遮罩的真實 email，後續 `fetchEmailLogs(rec.customer_email)` 就能正確比對到記錄。

只改一個檔案，不動 edge function、不動資料庫。

## 變更

**`src/components/rma/RmaDetailDialog.tsx`** — `fetchRmaData()` 內：
- 在 fetch 前 `await supabase.auth.getSession()` 取得 `access_token`
- `Authorization` header 改用 `Bearer <accessToken>`（fallback 到 anon key）
- 其餘邏輯不變

## 不變更

- `lookup-rma` Edge Function（遮罩邏輯維持不變，保護 customer-facing 路徑）
- `email_send_log` RLS（admin 已可讀）
- 任何資料庫結構