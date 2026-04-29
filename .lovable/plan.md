## 問題診斷

點下 Email 中「填寫我的回覆」之後跳到 Lovable 登入頁，**並不是 Edge Function 權限問題**。實際檢查：

- `/rma-reply/:token` 路由在 `src/App.tsx` 並未包 `ProtectedRoute`，是公開路由。
- `supabase/config.toml` 已設定 `lookup-rma-reply-thread` 與 `submit-customer-reply` 為 `verify_jwt = false`。
- RLS 端使用 service role 處理，不需要使用者 session。

**真正原因**：`supabase/functions/send-rma-reply/index.ts` 產生連結時用 `req.headers.get("origin")`，而管理員是在 preview 網域 (`id-preview--xxx.lovable.app`) 後台按下「寄送」，所以連結被組成 preview 網域。Preview 網域有 Lovable 的存取保護（gating），未登入訪客會被導去 Lovable 登入頁。

正式發布的網域 `https://rma-helper-hub.lovable.app/rma-reply/:token` 是公開可存取的。

## 修改方案

### 1. 固定使用 published 網域產生回覆連結

修改 `supabase/functions/send-rma-reply/index.ts`：
- 移除 `const origin = req.headers.get("origin") || "https://rma-helper-hub.lovable.app"`
- 改為硬編碼 published 網域：`const PUBLIC_BASE_URL = "https://rma-helper-hub.lovable.app"`
- 這確保不管管理員是在 preview 還是 production 後台寄送，客戶收到的連結都會指向公開的 production 網域。

（未來若改為自訂網域，只需要在這一個常數修改即可。）

### 2. 更新郵件文案

在 `send-rma-reply/index.ts` 的 `textBody` 與 `htmlBody`：
- 將「若您想針對這個回覆做出進一步說明或追問，請點擊下方按鈕」
- 改為「若您針對這個回覆有進一步的疑問或說明，請點擊下方按鈕」

純文字版本中對應的「若您想針對這個回覆做出進一步說明或追問，請點擊下方連結填寫」也一併改為「若您針對這個回覆有進一步的疑問或說明，請點擊下方連結填寫」，保持一致。

### 3. 部署

部署 `send-rma-reply` Edge Function 讓變更生效。

## 給使用者的測試步驟

1. 修改完成後請重寄一封 RMA 回覆給自己測試。
2. 點開連結，應該直接看到「回覆 CREST 客服」頁面（無需登入）。
3. 確認郵件中的新文案。

## 不會更動

- `lookup-rma-reply-thread` / `submit-customer-reply` 邏輯不變（已正確）。
- `RmaCustomerReply.tsx` UI 不變。
- 路由設定不變。
