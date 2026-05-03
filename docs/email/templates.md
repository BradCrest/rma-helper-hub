# 信件模板說明

## 模板清單

系統內建以下 Email 模板，由 `send-transactional-email` Edge Function 渲染後寄出：

| 模板名稱 | 觸發時機 | 收件人 |
|---------|---------|--------|
| `rma-confirmation` | 客戶送出 RMA 申請後 | 客戶 |
| `rma-reply` | 管理員透過「RMA 回覆」Tab 回覆 | 客戶 |
| `customer-email-reply` | 管理員透過「客戶來信」Tab 回覆 | 客戶 |
| `shipping-reminder` | 提醒客戶填寫寄件資訊 | 客戶 |

## 各模板說明

### rma-confirmation（申請確認信）

**觸發**：`submit-rma` Edge Function 成功建立 RMA 後自動寄出

**內容包含**：
- RMA 工單號
- 申請日期
- 產品資訊（型號、序號）
- 系統預計處理流程說明
- 後續步驟（等待管理員聯繫 → 填寫寄件資訊）

**注意**：此信在 Edge Function 中是 fire-and-forget，即使寄信失敗也不影響 RMA 建立。

---

### rma-reply（管理員 RMA 回覆）

**觸發**：管理員在「RMA 回覆」Tab 點擊「傳送」

**內容包含**：
- 管理員撰寫的回覆內容（HTML）
- 附件（若有）
- 客戶回覆按鈕（連結到 `/rma-reply/{token}`）
- 案件資訊（RMA 號碼、型號）

**特性**：
- 包含一次性回覆 Token
- Token 由 `rma_reply_messages.reply_token` 儲存
- 客戶使用此 Token 回覆後，管理員可在 RMA 回覆 Tab 看到

---

### customer-email-reply（一般客戶來信回覆）

**觸發**：管理員在「客戶來信」Tab 點擊「傳送」

**內容包含**：
- 管理員撰寫的回覆內容（HTML）
- 公司標準簽名
- 退訂連結

**特性**：
- **不含**客戶回覆連結（單向通知）
- 若客戶需要回覆，需直接發 Email 到公司信箱

---

### shipping-reminder（寄件提醒）

**觸發**：
- 管理員手動在工單詳情點擊「傳送寄件提醒」
- 或排程自動發送（`send-shipping-reminders` Edge Function）

**內容包含**：
- 寄件資訊填寫連結（`/shipping-form?rma={rma_number}`）
- 寄件注意事項（包裝建議、不含配件等）
- 收件地址

---

## 自訂回覆（非模板）

管理員在 RMA 回覆 Tab 輸入的回覆內容，會套用 `rma-reply` 模板，但**正文內容是自由文字**（可包含 HTML）。

AI 起草的文字同樣以此方式插入模板。

## 模板存放位置（給開發人員）

```
supabase/functions/_shared/transactional-email-templates/
├── rma-confirmation.tsx
├── rma-reply.tsx
├── customer-email-reply.tsx
└── shipping-reminder.tsx
```

模板使用 **React Email** 語法撰寫（JSX），由 `send-transactional-email` 動態渲染為 HTML。

## 新增模板（給開發人員）

1. 在 `_shared/transactional-email-templates/` 建立新的 `.tsx` 檔
2. 在 `registry.ts` 加入模板名稱與引用
3. 在 `src/lib/emailTemplateLabels.ts` 加入中文顯示名稱
4. 在需要觸發的 Edge Function 中呼叫 `send-transactional-email`，傳入 `templateName`

> 模板修改需要部署 Edge Function，請交由 Lovable 或授權管理員操作。
