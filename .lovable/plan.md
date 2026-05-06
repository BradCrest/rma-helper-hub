# 修正 P1: email_link 路徑洩漏 status_history.notes

Claude review 確認大方向已修好，但 `email_link` 路徑仍透過 `rma_status_history.notes` 回傳可能含客戶資訊／內部維修細節的自由文字。需移除。

## 變更

### 1. `supabase/functions/lookup-rma/index.ts`（email_link 區塊，~L154-172）

- `select('id, status, created_at, notes')` → `select('id, status, created_at')`
- map 結果移除 `notes` 欄位，只回 `{ id, status, created_at }`

Admin 與 anonymous 路徑保持不變（admin 本來就允許看 notes；anonymous 本來就不取 notes）。

### 2. `src/pages/Track.tsx`

- `StatusHistory.notes` 型別改為 optional：`notes?: string | null`
- 第 531 行 `{history.notes && ...}` 已是 truthy check，無 PII 時不顯示，邏輯本身 OK，僅型別需放寬。

### 3. `supabase/functions/lookup-rma/index_test.ts`

在 "email_link + valid RMA returns minimal fields, no PII" test 補一條 assert：

```ts
assertEquals(r.status_history[0]?.notes, undefined);
```

## 驗證

- `supabase--test_edge_functions` 跑 `lookup-rma` 全部 test
- `supabase--deploy_edge_functions` 部署 `lookup-rma`
- `supabase--curl_edge_functions` 用 `RC7EA001463 + purpose=email_link` 驗證回應 keys 不含 `customer_*`、`serial_number`、`warranty_date`、且 `status_history[].notes` 不存在

## 不在範圍

- 不動 admin / anonymous 路徑
- 不動 ShippingForm / Track 其他邏輯（已通過 review）
