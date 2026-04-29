## 目標

客戶提交 RMA 表單後，自動寄一封確認 Email：

- 列出他填寫的資料 + RMA 單號
- 提供「查詢進度」連結（`/track`）
- 提供「填寫寄件資料」連結（`/shipping-form?rma=xxx`）
- 文案註明：**有需要的 RMA 才需安排寄送**（因為部分 RMA 並非硬體問題）
- 只對「實作完成後新建立的 RMA」生效（舊 RMA 不補寄）
- Email 寄送記錄會自動出現在 RMA 詳細資訊的「Email 寄送記錄」區塊（既有邏輯已支援，無需改動）

## 變更

### 1. 新增 Email 模板

`**supabase/functions/_shared/transactional-email-templates/rma-confirmation.tsx**`

內容區塊：

- 標題：「CREST**保固申請**：已收到您的申請」
- 客戶姓名問候
- 資訊框：RMA 編號、商品名稱、型號、序號、故障類型、申請日期
- 兩個按鈕：
  - 「查詢申請進度」→ `https://rma-helper-hub.lovable.app/track?rma={rmaNumber}`
  - 「填寫寄件資訊」→ `https://rma-helper-hub.lovable.app/shipping-form?rma={rmaNumber}`
- **重要說明區塊**（黃底提示）：
  > 部分問題（例如使用諮詢、軟體設定）不需要寄回商品。請等候我們審核後通知，**或經客服確認需要寄送後**，再透過上方按鈕填寫寄件資訊。如已確認需寄回，本服務中心地址：242039 新北市新莊區化成路11巷86號1樓（無法接受親送，請務必透過物流寄送）。

樣式沿用 `shipping-reminder.tsx` 的 design tokens（藍色 #3B82F6 按鈕、圓角、PingFang TC 字體）。

### 2. 註冊模板

`**supabase/functions/_shared/transactional-email-templates/registry.ts**`

加入：

```ts
import { template as rmaConfirmation } from './rma-confirmation.tsx'

export const TEMPLATES = {
  'shipping-reminder': shippingReminder,
  'rma-confirmation': rmaConfirmation,
}
```

### 3. 新增中文標籤

`**src/lib/emailTemplateLabels.ts**`

```ts
EMAIL_TEMPLATE_LABELS = {
  "shipping-reminder": "未寄件提醒",
  "rma-confirmation": "RMA 申請確認",
}
```

### 4. 觸發點：`submit-rma` Edge Function

`**supabase/functions/submit-rma/index.ts**`

每筆 RMA 成功 insert 後（在 Slack 通知附近），新增呼叫：

```ts
await supabase.functions.invoke('send-transactional-email', {
  body: {
    templateName: 'rma-confirmation',
    recipientEmail: product.customer_email,
    idempotencyKey: `rma-confirm-${data.rma_number}`,
    templateData: {
      customerName: product.customer_name,
      rmaNumber: data.rma_number,
      productName: product.product_name,
      productModel: product.product_model,
      serialNumber: product.serial_number,
      issueType: product.issue_type,
      createdDate: new Date().toLocaleDateString('zh-TW'),
      trackUrl: `https://rma-helper-hub.lovable.app/track?rma=${data.rma_number}`,
      shippingUrl: `https://rma-helper-hub.lovable.app/shipping-form?rma=${data.rma_number}`,
    },
  },
});
```

寄信失敗不阻擋 RMA 建立流程（try/catch 包住，僅 console.error），與 Slack 通知處理方式一致。

### 5. 在 email log metadata 加入 rma_number

為了讓詳細視窗的 Email 記錄能精確過濾到本 RMA，在 invoke 時 `templateData` 之外，傳遞 `metadata` 欄位（若 `send-transactional-email` 支援 metadata 寫入 `email_send_log`）。

**檢查需求**：目前 `send-transactional-email/index.ts` 寫 log 時沒有傳 `metadata`。本次新增：

- 在 `send-transactional-email` 的 request body 接收 `logMetadata`（選填）
- 寫入 `email_send_log.metadata`（pending、suppressed、failed 三處 insert 都帶上）
- `submit-rma` 呼叫時帶 `logMetadata: { rma_number, rma_request_id }`

這樣 `AdminRmaList` 已有的 metadata 比對邏輯就能準確顯示這封信。

## 不變更

- 資料庫 schema（`email_send_log.metadata` 已存在）
- `AdminRmaList.tsx` 的 Email 寄送記錄 UI（既有邏輯已會抓並顯示）
- `RmaDetailDialog.tsx`
- 既有的 `shipping-reminder` 模板與 cron

## 部署

修改完成後自動部署 `submit-rma`、`send-transactional-email` 兩個 Edge Functions。

## 不影響舊資料

只在「新提交」時觸發。已存在的 RMA 不會回補寄送（符合需求）。