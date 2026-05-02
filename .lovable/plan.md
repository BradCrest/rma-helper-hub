## 問題

`send-follow-up-email`（客戶關懷寄送）在呼叫下游 `send-transactional-email` 時，沿用了使用者 JWT 而非 `SUPABASE_SERVICE_ROLE_KEY`，跟先前 `send-customer-email-reply`、`send-rma-reply` 撞到的 401 問題完全一樣。目前實機按下「寄出客戶關懷信」會回 `401 Unauthorized`。

## 修正範圍

只修一個檔案：`supabase/functions/send-follow-up-email/index.ts`

### 變更內容（第 105-113 行附近）

呼叫 `send-transactional-email` 的 fetch headers，從：

```ts
headers: {
  "Content-Type": "application/json",
  Authorization: authHeader,
  apikey: anonKey,
},
```

改為使用 service role key 做 server-to-server 呼叫：

```ts
headers: {
  "Content-Type": "application/json",
  Authorization: `Bearer ${serviceKey}`,
  apikey: serviceKey,
},
```

### 不動的部分

- 上游 admin 身分驗證（第 27-50 行）保持不變 — 仍然要求前端帶 user JWT 並驗證為 admin/super_admin。
- 對 `create-follow-up-survey` 的呼叫（第 82-91 行）保持用 `authHeader` — 那個函式需要 user 身分。
- 不修改 `send-transactional-email` 本身。

## 部署

修改後重新部署 `send-follow-up-email`。

## 驗證

部署完成後，請於後台「客戶關懷」操作一次寄信流程，確認 200 OK 並收到郵件。
