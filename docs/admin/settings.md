# AI 設定與系統設定

**位置**：`/admin/settings`

設定頁讓管理員調整 AI 模型參數、Email 佇列設定，以及管理管理員帳號（`super_admin` 限定）。

## AI 模型設定

| 設定項目 | 說明 | 建議值 |
|---------|------|--------|
| LLM Provider | AI 服務提供商 | Anthropic（Claude）|
| Model | 使用的模型 | `claude-opus-4-5`（最佳品質）/ `claude-sonnet-4-5`（速度/品質平衡）|
| Temperature | 回覆的隨機性（0~1）| 0.3~0.5（保持一致性）|
| Max Tokens | 最大輸出長度 | 1000~2000（依回覆長度需求調整）|

**Temperature 說明**：
- **0.0~0.2**：回覆非常固定，適合需要一致性的場景
- **0.3~0.5**：稍有變化，適合客服回覆
- **0.7~1.0**：回覆有較多創意性，不適合客服場景

修改後點擊「儲存設定」，立即生效（呼叫 `update-ai-settings` Edge Function）。

## Email 佇列設定

| 設定項目 | 說明 |
|---------|------|
| Batch Size | 每次 cron 執行寄幾封（建議 5~20）|
| Send Delay (ms) | 每封之間的延遲毫秒數（建議 100~500）|

> 調整 batch_size 和 send_delay_ms 可以控制寄信速率，避免被 Email 服務商限制。

## 管理員管理（super_admin 限定）

### 管理員列表

顯示所有 `user_roles` 表中的管理員，包含：
- Email
- 角色（admin / super_admin）
- 建立時間
- 最後登入時間

### 核准申請

`pending_admin_registrations` 中的待審核申請：
1. 點擊「核准」→ 系統在 `user_roles` 建立記錄
2. 點擊「拒絕」→ 申請被標記為 `rejected`，帳號無法登入後台

### 重設密碼

1. 找到目標管理員
2. 點擊「重設密碼」
3. 確認後，系統呼叫 `reset-admin-password` Edge Function
4. 系統寄送密碼重設連結到該 Email

### 移除管理員

1. 點擊「移除權限」
2. 確認後，從 `user_roles` 刪除記錄
3. 該帳號仍存在於 `auth.users`，但無法進入後台

> **注意**：只有 `super_admin` 可以移除其他管理員，且無法移除自己。

## 登入記錄（super_admin 限定）

`/admin/settings` → 登入記錄 Tab

顯示最近的管理員登入事件：
- 登入時間
- 管理員 Email
- IP 位址
- 地理位置（國家 / 城市）
- 瀏覽器 UA

**使用情境**：
- 確認新管理員已成功登入
- 偵測異常登入（不明 IP / 異常地理位置）
- 稽核作業

## Gmail 授權設定

Gmail 整合需要 OAuth 授權：
1. 點擊「Gmail 授權設定」
2. 跳轉到 Google 帳號授權頁
3. 選擇公司 Gmail 帳號並授權
4. 授權完成後，「客戶來信」Tab 即可使用

> 授權 Token 儲存於 `supabase_vault`（加密金鑰儲存），不會明文儲存。若 Token 過期，需重新授權。
