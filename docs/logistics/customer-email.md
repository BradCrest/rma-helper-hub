# 客戶來信（Gmail 整合）

**位置**：物流作業 → 客戶來信 Tab

此 Tab 整合 Gmail 收件匣，讓管理員在系統內直接處理客戶的一般來信，無需切換到 Gmail。

## 運作原理

系統透過 Gmail API（OAuth 授權）存取公司的 Gmail 帳號：

```
Gmail 收件匣
    ↓ gmail-list-messages（列出信件）
    ↓ gmail-get-message（取得信件內容）
    ↓ gmail-modify-message（標記已讀 / 加標籤）
    ↓ send-customer-email-reply（回覆）
```

> **注意**：此 Tab 使用的 Gmail 帳號是 CREST 客服信箱，需要一次性 OAuth 授權設定（由 `super_admin` 在設定頁完成）。

## 信件列表

顯示 Gmail 收件匣中的最新信件，每列包含：
- 寄件人 Email
- 主旨
- 時間
- 已讀 / 未讀狀態（粗體 = 未讀）

### 已讀 / 未讀管理

- 點擊信件後，系統自動呼叫 `gmail-modify-message` 標記為已讀
- 手動切換：點擊信件旁的圓點圖示

## 閱讀信件

點擊信件標題，右側展開信件內容：
- 以 HTML 方式渲染（支援富文字格式）
- 附件列表（可點擊下載）
- 寄件人資訊

## AI 起草回覆

1. 點擊「AI 起草回覆」
2. 系統將信件主旨 + 內容傳送給 `draft-email-reply` Edge Function
3. Edge Function 進行 RAG 語意搜尋（知識庫）並呼叫 Claude API
4. 生成回覆草稿，顯示在編輯框

> AI 草稿是**建議稿**，管理員必須審閱並修改後再傳送。系統不會自動傳送。

## 傳送回覆

1. 確認或修改 AI 草稿（或自行輸入）
2. 可選擇是否加入附件
3. 點擊「傳送」

回覆透過 `send-customer-email-reply` Edge Function 寄出，使用的是系統 Email 模板（`customer-email-reply`），**不含客戶回覆連結**（單向通知）。

寄出記錄寫入 `email_send_log`。

## 與「RMA 回覆」Tab 的差異

| 項目 | 客戶來信 | RMA 回覆 |
|------|---------|---------|
| 來源 | Gmail 收件匣 | 系統發送的 RMA 信件之客戶回覆 |
| 關聯 RMA | 無（或需手動關聯）| 一定關聯特定 RMA |
| 回覆方式 | Gmail API 回覆 | 系統 thread 模式 |
| 客戶可再回覆 | 依客戶使用 Email 方式 | 有專屬回覆頁面（token）|

## 注意事項

- 若同一客戶同時有 Gmail 來信和 RMA 申請，兩者是**分開**追蹤的，需管理員自行比對
- Gmail API 每小時有讀取次數限制，若信件無法載入，請稍後重試
- 系統不會自動回覆（無 auto-reply）— 所有回覆皆需管理員確認
