## 目標

把「RMA 回覆給客戶」從 Gmail 連接器（用管理員個人 Gmail 寄出）改為走 Lovable 內建的 transactional email 系統，與其他通知 email 一致使用 `noreply@notify.crestdiving.com` 寄出。

## 現況

- 通知 email（RMA 確認、寄件提醒）已使用 `send-transactional-email` + 模板 (`rma-confirmation`, `shipping-reminder`)，由 `noreply@notify.crestdiving.com` 寄出。
- RMA 回覆 (`send-rma-reply`) 仍走 Gmail Connector Gateway，用管理員個人帳號當 From。
- 需要保留的功能：
  - 動態主旨（管理員可自訂）
  - 動態內文（管理員輸入的回覆）
  - 嵌入「填寫我的回覆」按鈕（含 `reply_token`）
  - 寫入 `rma_thread_messages`（保留 thread 紀錄、token、過期時間）
  - 寫入 `email_send_log`

## 變更內容

### 1. 新增 React Email 模板
`supabase/functions/_shared/transactional-email-templates/rma-reply.tsx`
- Props: `customerName`, `rmaNumber`, `replyBody`, `replyUrl`
- 主旨：使用函式形式 `(data) => data.subject || \`Re: [${data.rmaNumber}] 您的維修申請進度回覆\``，這樣管理員自訂主旨仍可生效（透過 `templateData.subject` 傳入）
- 視覺風格與 `rma-confirmation` 一致（白底、藍色 CTA、CREST 品牌）
- 包含「填寫我的回覆」按鈕指向 `${PUBLIC_BASE_URL}/rma-reply/${token}`
- 文案維持："若您針對這個回覆有進一步的疑問或說明，請點擊下方按鈕"

### 2. 在 registry.ts 註冊新模板
加入 `'rma-reply': rmaReply`

### 3. 改寫 `send-rma-reply/index.ts`
- 移除所有 Gmail Gateway 相關程式（`buildRawEmail`、Gmail fetch、`GOOGLE_MAIL_API_KEY`）
- 保留：管理員身分驗證、RMA 查詢、`reply_token` 產生、寫入 `rma_thread_messages`
- 改為呼叫 `supabase.functions.invoke('send-transactional-email', { body: { templateName: 'rma-reply', recipientEmail, idempotencyKey, templateData: { subject, customerName, rmaNumber, replyBody, replyUrl } } })`
- `idempotencyKey` 用 `rma-reply-${threadMessageId}` 確保重試安全
- 不再手動寫 `email_send_log`（transactional email 系統會自動記錄）
- 仍回傳 `replyUrl` 供前端展示

### 4. 部署
- 部署 `send-transactional-email`（因為新模板需要重新打包 registry）
- 部署 `send-rma-reply`

### 5. 不變動
- 前端 `RmaReplyTab.tsx` 介面、`/rma-reply/:token` 客戶頁面、`submit-customer-reply`、`lookup-rma-reply-thread` 全部保持原樣
- Gmail 連接器仍保留供 `gmail-list-messages` 等其他功能使用

## 流程圖

```text
管理員後台「RMA 回覆」分頁
  └─> send-rma-reply (Edge Function)
        ├─ 驗證 admin
        ├─ 產生 reply_token + 過期時間
        ├─ INSERT rma_thread_messages (direction=outbound)
        └─> send-transactional-email
              ├─ 套用 'rma-reply' 模板（React Email）
              ├─ 從 noreply@notify.crestdiving.com 寄出
              ├─ 進入 transactional pgmq 佇列
              └─ 自動寫入 email_send_log
                    │
                    ▼
              客戶信箱收到 email（noreply 寄件者）
                    │
                    ▼ 點「填寫我的回覆」
              /rma-reply/:token 公開頁面（不需登入）
                    │
                    ▼
              submit-customer-reply
                    └─ INSERT rma_thread_messages (direction=inbound)
                       UPDATE rma_requests.has_unread_customer_reply=true
```

## 注意事項

- 客戶若直接「回覆」此 email，會寄到 `noreply@notify.crestdiving.com`，不會被人收到。這是預期行為；客戶必須點按鈕透過網頁回覆，所有對話才會集中在 RMA 紀錄裡。模板會清楚說明這點。
- Gmail thread 紀錄（gmail_message_id）將不再產生；現有歷史資料不受影響。
