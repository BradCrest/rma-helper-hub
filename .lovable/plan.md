## 目標

抽出共用 helper，讓所有 Edge Function 呼叫 `send-transactional-email` 時都用同一套伺服器對伺服器驗證，避免 401 重演。

## 1. 新檔案：`supabase/functions/_shared/transactional-email-client.ts`

```ts
export interface TransactionalEmailPayload {
  templateName: string;
  recipientEmail: string;
  idempotencyKey: string;
  templateData?: Record<string, unknown>;
  logMetadata?: Record<string, unknown>;
}

export interface TransactionalEmailResult {
  ok: boolean;
  status: number;
  data: unknown;        // parsed JSON, or raw text fallback, or null
  errorText: string | null; // raw response text when !ok, else null
}

/**
 * Server-to-server invoke of the central send-transactional-email function.
 *
 * send-transactional-email enforces an in-code service-role check (it accepts
 * the key in either `Authorization: Bearer <key>` or `apikey: <key>`).
 * Always send BOTH headers from here so every caller is uniform; never forward
 * a user JWT for this hop.
 */
export async function invokeTransactionalEmail(
  payload: TransactionalEmailPayload,
): Promise<TransactionalEmailResult> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "invokeTransactionalEmail: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  const res = await fetch(
    `${supabaseUrl}/functions/v1/send-transactional-email`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
        "apikey": serviceKey,
      },
      body: JSON.stringify(payload),
    },
  );

  // Read body exactly once, then try JSON, fall back to text.
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text || null;
  }

  return {
    ok: res.ok,
    status: res.status,
    data,
    errorText: res.ok ? null : text,
  };
}
```

採納回饋：body 只讀一次（`res.text()` 後嘗試 `JSON.parse`），呼叫端拿到的 `data` 已是物件或字串，不再碰 stream。

## 2. 改五個呼叫端

每個都把手寫 fetch 換成 `await invokeTransactionalEmail({...})`，並**保留各自的錯誤處理風格**：

| 函式 | 失敗行為（不變） |
|---|---|
| `send-customer-email-reply` | 回 500 給前端 |
| `send-rma-reply` | 回 500 給前端 |
| `send-follow-up-email` | 回 500 給前端 |
| `submit-rma` | **吞掉錯誤**，只 console.error，不阻擋 RMA 建立 |
| `send-shipping-reminders` | 寫入 reminder log 失敗欄位、繼續處理下一筆 |

呼叫範例：
```ts
import { invokeTransactionalEmail } from "../_shared/transactional-email-client.ts";

const sendRes = await invokeTransactionalEmail({
  templateName: "follow-up-care",
  recipientEmail: rma.customer_email,
  idempotencyKey,
  templateData: { ... },
});
if (!sendRes.ok) {
  console.error("send-transactional-email error:", sendRes.status, sendRes.errorText);
  // ... 各函式原本的回覆邏輯
}
```

## 3. 清理過時註解（採納回饋）

| 檔案 | 行 | 現況 | 改成 |
|---|---|---|---|
| `send-rma-reply/index.ts` | ~233 | 「forward user JWT」之類描述 | 「Use shared helper — service role enforced internally」 |
| `send-customer-email-reply/index.ts` | ~171 | 同上若有 | 同上 |
| `send-shipping-reminders/index.ts` | ~187-191 | 「只放 apikey、不要 bearer」 | 移除整段，改成「Uses shared helper for uniform service-role auth」 |
| `send-transactional-email/index.ts` | 33-35 | 「verify_jwt = true，gateway 驗 JWT」 | 改成「verify_jwt = false in config.toml; this function enforces the service-role key in code (Authorization Bearer or apikey header)」 |

`send-transactional-email` **邏輯不動**，只改第 33-35 行那段過時註解。

## 4. 不動的部分

- `send-transactional-email` 的 OR 邏輯 `bearer || apikey`（向後相容）。
- 各函式上游驗證（user JWT + admin role / CRON_SECRET / 公開）完全不動。
- React Email templates、registry、queue 機制不動。
- 沒有新依賴，純 Deno fetch + env。

## 5. 部署

部署這 5 個函式（_shared 會隨之打包）：
- `send-customer-email-reply`
- `send-rma-reply`
- `send-follow-up-email`
- `submit-rma`
- `send-shipping-reminders`

`send-transactional-email` 也需重新部署一次，把註解修正帶上去。

## 6. 驗證

部署完成後請逐一試：
1. 客戶來信回覆寄出 → `send-customer-email-reply`
2. RMA 詳情頁回覆客戶 → `send-rma-reply`
3. 客戶關懷寄出 → `send-follow-up-email`
4. 送出新 RMA 單（會觸發 rma-confirmation）→ `submit-rma`
5. 出貨提醒（手動觸發或等 cron）→ `send-shipping-reminders`

確認皆 200 OK 並收到郵件。

## 後續好處

- 新增需要寄信的 Edge Function 時，一行 import 就拿到正確 header，不可能再寫成 user JWT。
- 未來若改 auth 機制（例如 HMAC 簽名），只需改 helper 一處。
