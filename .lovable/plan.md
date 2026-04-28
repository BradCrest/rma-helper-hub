# 阻止對舊 RMA 寄送提醒

目前共有 **70 筆**已登記但未寄件超過 48 小時的舊 RMA。一旦 DNS 驗證完成、cron 啟動，這 70 筆會立刻全部收到提醒信。執行下列雙保險避免此情況。

---

## 1. Edge Function 加入啟用時間點

修改 `supabase/functions/send-shipping-reminders/index.ts`：

- 新增常數 `REMINDER_ENABLED_AFTER = "2026-04-28T12:00:00Z"`
- 在查詢條件加上 `.gte("created_at", REMINDER_ENABLED_AFTER)`
- 只有此時間點之後建立的 RMA 才可能觸發提醒
- 管理員手動觸發（傳 `rma_request_id`）的路徑不受此限制 — 仍可手動補寄

部署：`send-shipping-reminders`

## 2. 標記既有 70 筆 RMA 為已通知（保險作法）

執行一次性資料更新：

```sql
UPDATE rma_requests
SET shipping_reminder_sent_at = now()
WHERE status = 'registered'
  AND shipping_reminder_sent_at IS NULL
  AND created_at <= now() - interval '48 hours';
```

預期影響：70 筆 RMA 的 `shipping_reminder_sent_at` 從 NULL → 現在時間，徹底排除在自動寄送對象之外。

---

## 結果

- 過去所有 RMA：完全不會收到提醒
- 從現在起新建立的 RMA：滿 48 小時未寄件 → 自動寄送提醒（如預期）
- 管理員仍可在管理後台手動觸發任何 RMA 的提醒（不受時間點限制）
