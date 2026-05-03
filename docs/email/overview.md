# Email 佇列運作

## 整體架構

```
管理員操作（寄信）
    ↓
send-transactional-email（Edge Function）
    ├── 渲染 React Email 模板
    ├── 檢查 email_suppression_list（退訂/黑名單）
    ├── 防重複：檢查 idempotencyKey
    └── INSERT → email_send_log（status = 'pending'）

↓（每分鐘由 cron job 執行）

process-email-queue（Edge Function）
    ├── 讀取 pending 的信件
    ├── 依 batch_size 批次寄送
    ├── 每封間隔 send_delay_ms
    └── UPDATE status → 'sent' / 'failed'
```

## 為什麼使用佇列？

不直接呼叫 Email API 的原因：
1. **防重複寄送**：若管理員重複點擊，相同 `idempotencyKey` 的信件只寄一次
2. **速率控制**：避免短時間大量寄信觸發 Email 服務商的限制
3. **可靠性**：失敗可重試，不會因網路瞬斷而漏寄
4. **稽核性**：所有信件都有記錄可查

## Email 狀態說明

| 狀態 | 說明 |
|------|------|
| `pending` | 等待佇列處理 |
| `sent` | 已成功寄出 |
| `suppressed` | 收件人在黑名單/已退訂 |
| `failed` | 寄送失敗（將重試）|
| `bounced` | 退信（Email 不存在等）|
| `complained` | 被標記為垃圾信 |
| `dlq` | 已移入死信佇列（多次重試後放棄）|

## 佇列設定（email_send_state）

管理員可在「設定」頁調整以下參數：

| 設定 | 說明 | 預設值 |
|------|------|--------|
| batch_size | 每次 cron 執行寄幾封 | 10 |
| send_delay_ms | 每封之間的延遲（毫秒）| 200 |

> **注意**：批量 Email 發送（如大量通知）前，建議先確認 batch_size 設定合理，避免短時間觸發 Email 服務商的速率限制。

## 退訂機制

每封 transactional email 底部都有退訂連結（`/unsubscribe?token=...`）。

客戶點擊後：
1. `handle-email-unsubscribe` Edge Function 處理請求
2. 標記 `email_unsubscribe_tokens.used_at`
3. 將 Email 加入 `email_suppression_list`
4. 後續所有給此 Email 的信件狀態標為 `suppressed`，不再寄出

### 重新啟用（管理員操作）
若客戶誤點退訂，需在 Supabase 後台手動從 `email_suppression_list` 刪除該記錄。（目前無前台操作介面）

## 退信處理

Email 服務商（Resend）會 Webhook 通知退信事件：
- `handle-email-suppression` Edge Function 接收並處理
- 記錄到 `email_send_log`（status = `bounced` / `complained`）
- 嚴重退信自動加入 `email_suppression_list`

## 寄件人資訊

| 項目 | 內容 |
|------|------|
| Sender Domain | `notify.crestdiving.com` |
| From Name | CREST（依模板設定）|
| Reply-To | 公司 Gmail 帳號 |

> Sender Domain 由 DNS 委派給 Email 服務商，不得更改。如需更改，須協調 DNS 設定與 Edge Function 同步修改。

## 查看寄送記錄

目前需透過 **Supabase Dashboard** 查詢 `email_send_log` 表，尚無前台查詢介面。

```sql
-- 查詢最近 24 小時的失敗信件
SELECT recipient_email, template_name, status, created_at
FROM email_send_log
WHERE status IN ('failed', 'bounced', 'dlq')
  AND created_at > now() - interval '24 hours'
ORDER BY created_at DESC;
```
