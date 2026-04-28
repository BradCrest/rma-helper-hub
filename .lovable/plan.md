
# 48 小時未寄件自動 Email 提醒 + Slack 通知

## 確認資訊
- Email 寄件網域：`crestdiving.com`（會使用子網域 `notify.crestdiving.com` 寄信）
- 連結指向：`https://rma-helper-hub.lovable.app/shipping?rma=<RMA>&autoopen=1`
- 只寄一次提醒
- 寄送提醒時同步通知 Slack

---

## 實作步驟

### 1. 設定 Email 寄件網域
- 引導您完成 `crestdiving.com` 網域設定（會在介面顯示設定對話框，需在網域註冊商加上 NS 記錄）
- 系統自動建立 Email 基礎架構（佇列、追蹤、退信處理）

### 2. 建立 Transactional Email 模板
- 路徑：`supabase/functions/_shared/transactional-email-templates/shipping-reminder.tsx`
- 內容（中文）：
  - 標題：「提醒您：請填寫保固服務寄件資訊」
  - 顯示 RMA 編號、產品名稱、申請日期
  - CTA 按鈕「立即填寫寄件資訊」→ `https://rma-helper-hub.lovable.app/shipping?rma=<RMA>&autoopen=1`
  - 公司收件地址
  - 提醒：保固服務中心無法親送
- 註冊到 `registry.ts`

### 3. 修改 `src/pages/Shipping.tsx`
- 使用 `useSearchParams` 讀取 `rma` 與 `autoopen`
- 若帶有 `rma` 參數，自動填入搜尋框
- 若同時有 `autoopen=1`，自動開啟 Modal 並執行搜尋，跳到「填寫寄件資訊」表單

### 4. 資料庫 Migration
```sql
ALTER TABLE rma_requests 
  ADD COLUMN shipping_reminder_sent_at timestamptz;
```

### 5. 新建 Edge Function：`send-shipping-reminders`
邏輯：
1. 查詢符合條件的 RMA：
   - `status = 'registered'`
   - 沒有 `direction='inbound'` 的 `rma_shipping` 記錄
   - `created_at <= now() - interval '48 hours'`
   - `shipping_reminder_sent_at IS NULL`
   - `customer_email IS NOT NULL`
2. 對每筆：
   - 呼叫 `send-transactional-email`，template `shipping-reminder`
   - `idempotencyKey = shipping-reminder-<rma_id>`
   - 同步呼叫 `slack-notify` 通知管理員（訊息：「📧 已寄送 48 小時未寄件提醒給 客戶名稱 (RMA: RC...)」）
   - 寄送成功後 update `shipping_reminder_sent_at = now()`

### 6. 設定 pg_cron 排程
- 啟用 `pg_cron` 與 `pg_net` 擴充
- 每小時執行一次 `send-shipping-reminders`

### 7. 管理員手動重發按鈕（選用，方便測試）
- 在 Admin RMA 詳細對話框中加入「重新發送寄件提醒」按鈕
- 清掉 `shipping_reminder_sent_at` 並立即觸發 edge function

---

## 流程

```text
[客戶提交 RMA]
      ↓ 等待 48 小時
[cron 每小時掃描] 
      ↓
[找到符合條件的 RMA]
      ↓
[寄送 Email 提醒] + [Slack 通知管理員]
      ↓
[標記 shipping_reminder_sent_at]
      ↓
[客戶點擊信中連結]
      ↓
/shipping?rma=RC...&autoopen=1
      ↓
[自動帶入 + 開啟對話框 + 搜尋成功 → 填寫表單]
```

---

## 您需要做的

1. 點擊本訊息中即將出現的「設定電子郵件網域」按鈕
2. 輸入 `crestdiving.com`
3. 系統會給您 NS 記錄，請至 `crestdiving.com` 的網域註冊商加上這些記錄
4. DNS 驗證可能需要數小時到 72 小時（但模板與 Edge Function 可以先建好部署，DNS 驗證完成後自動開始寄信）

確認後我就開始實作。
