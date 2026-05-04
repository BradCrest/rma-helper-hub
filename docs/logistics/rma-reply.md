# RMA 回覆（Email 往返）

**位置**：客戶回覆及知識庫（`/admin/email-knowledge`）→ RMA 回覆 Tab

此 Tab 管理每筆 RMA 的 Email thread，讓管理員與客戶保持溝通。

![RMA 回覆 Tab](/rma-helper-hub/screenshots/knowledge-rma-reply.jpg)

## 功能說明

### Thread 列表

列出所有有 Email 對話的 RMA，每列顯示：
- RMA 號碼
- 客戶名稱
- 最新一封信的時間
- 是否有未讀回覆（`has_unread_replies` Badge）

> **未讀回覆**：當客戶透過信件底部的「點此回覆」連結回覆時，系統標記此 thread 為有未讀。

### 開啟 Thread

點擊任一 RMA，右側（或下方）展開 Thread 詳情：
- **對話時間軸**：顯示所有往返信件，方向標示（管理員寄出 / 客戶回覆）
- **信件內容**：HTML 格式渲染
- **附件**：可點擊下載

### 發送新回覆

1. 在 Thread 詳情下方的編輯區，輸入回覆內容
2. 可附加檔案（從 `shared-library` 或本機上傳）
3. 點擊「傳送」

傳送後，系統會：
- 呼叫 `send-rma-reply` Edge Function
- 渲染 `rma-reply` Email 模板（含客戶回覆連結）
- 加入 Email 佇列，等待 `process-email-queue` 批次寄出

### AI 輔助起草

在編輯區點擊「AI 起草」：
1. 系統讀取此 RMA 的完整資訊（產品、故障、保固）
2. 透過知識庫語意搜尋（RAG）找出最相關的 FAQ 和範本
3. Claude AI 根據上下文生成回覆草稿
4. 草稿出現在編輯區，管理員可修改後再傳送

> AI 起草約需 5~15 秒。若知識庫為空，草稿品質可能有限，建議先上傳 FAQ 文件。

### 客戶回覆機制

每封寄給客戶的信件，底部都有「點此回覆」按鈕，連結格式：
```
https://rma-helper-hub.lovable.app/rma-reply/{token}
```

- Token 是 32 bytes 隨機 hex，一次性使用
- 客戶點擊後開啟回覆頁面，可輸入文字並上傳附件
- 回覆後 token 被標記為 `used_at`，無法再次使用（但同一 thread 可再次寄新信）

## 篩選器

| 篩選條件 | 說明 |
|---------|------|
| 搜尋 | RMA 號碼 / 客戶姓名 |
| 未讀優先 | 只顯示有未讀客戶回覆的 thread |

## 與「客戶來信」Tab 的差異

| 項目 | RMA 回覆 | 客戶來信 |
|------|---------|---------|
| 信件來源 | 系統傳送的 RMA 確認信 → 客戶回覆 | Gmail 收件匣（客戶主動來信）|
| 結構 | Thread 模式，綁定特定 RMA | 單封信件，可能未關聯 RMA |
| 回覆方式 | 系統內建編輯器 + 模板 | 透過 Gmail API 回覆 |
