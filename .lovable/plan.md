## 問題

按下「以 noreply 寄出」時，`send-customer-email-reply` Edge Function 呼叫 `send-transactional-email` 收到 **401 Unauthorized**。

## 根本原因

`send-transactional-email/index.ts` 第 57–77 行強制要求呼叫者的 `Authorization: Bearer <token>` 或 `apikey` 必須等於 **service role key**（程式內檢查，與 gateway 的 `verify_jwt` 無關）：

```ts
if (!presented || presented !== supabaseServiceKey) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, ... })
}
```

但 `send-customer-email-reply/index.ts` 第 173–195 行卻把**前端使用者的 JWT** 轉發過去：

```ts
Authorization: authHeader,   // ← 使用者 JWT，不是 service role
apikey: anonKey,             // ← anon key，也不是 service role
```

→ 永遠 401。

備註：`send-rma-reply/index.ts` 第 237–260 行有相同模式，目前應該也是壞的（只是用戶這次測的是客戶來信回覆）。一併修掉避免下次踩雷。

## 修改範圍

### 1. `supabase/functions/send-customer-email-reply/index.ts`

把呼叫 `send-transactional-email` 的 fetch headers 改成用 service role：

```ts
headers: {
  "Content-Type": "application/json",
  Authorization: `Bearer ${serviceKey}`,
  apikey: serviceKey,
},
```

（`serviceKey` 已在第 41 行宣告。）

使用者授權檢查（第 44–76 行）保持不變——這個 function 仍會用使用者 JWT 驗證 admin 身份，只是「server → server」呼叫下游 function 時改用 service role。

### 2. `supabase/functions/send-rma-reply/index.ts`

同樣的修改：第 237–260 行的 fetch headers 改用 service role key（變數應該是 `supabaseServiceKey` 或類似，需先確認該檔內已宣告）。若尚未從環境讀取，需在檔案上方加一行：

```ts
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
```

並把第 235 行的註解（"forward the user's JWT…"）一併更新，反映新的設計。

## 不在範圍內

- 不動 `send-transactional-email`：它的 service-role-only 設計是刻意的（防止任意登入使用者直接呼叫寄信）。
- 不動 `config.toml`：`send-transactional-email` 的 `verify_jwt` 預設值即可。
- 不動前端：問題在 server-to-server 那一段。

## 驗證

- 部署後，於後勤管理 → 客戶來信 → 按「以 noreply 寄出」，應該不再跳「Edge Function returned a non-2xx status code」。
- 同時驗證後勤管理 → RMA 回覆 → 寄信，也應該正常。
- 觀察 `send-transactional-email` 的 edge function logs，不應再看到 `401 Unauthorized` 來自這兩個來源。
