## 背景

DB audit 結果：
- `rma_requests.status = 'repairing'`：**47 筆**（多為 2024–2025 由 CSV 匯入的舊資料，`台灣田畑` / `上海眾涵` / 個人客戶等，repair_fee 皆為 NULL，updated_at 集中在 2025-12-25）
- `rma_status_history.status = 'repairing'`：**1 筆**
- `unknown` 狀態：**0 筆**（兩個 table 都沒有）

因此 `unknown` 可直接從 enum 移除；`repairing` 需要先決定 47 筆要遷移到哪個狀態。

---

## Step 1：決定 `repairing` 47 筆的目標狀態（需 Brad 確認）

這 47 筆都是匯入時就標記為「維修中」、之後沒有任何後勤動作。現行 enum 中沒有完全對應的狀態，最務實的兩個選項：

**選項 A（推薦）：全部遷移到 `received`**
- 語意：「已收到、待後續處理」
- 會出現在「收件處理」分頁，admin 可逐筆重新分流
- 風險：47 筆會湧入收件分頁，但因為都是舊資料，可一次性檢視後再分流／結案

**選項 B：全部遷移到 `closed`**
- 語意：「視為歷史結案資料」
- 不會出現在任何工作分頁，dashboard 計入「已完成」
- 風險：若其中有實際還在處理的單會被埋沒；但目前 repair_fee 都 NULL、updated_at 一致代表沒人在追

**選項 C：手動逐筆分類**
- 由 Brad 提供 mapping CSV，migration 用 CASE WHEN 個別處理

→ **預設採選項 A**，若 Brad 回覆其他選項再調整。`rma_status_history` 那 1 筆也一律改成同樣的目標狀態。

---

## Step 2：Migration — 重建 `rma_status` enum

新檔 `supabase/migrations/<timestamp>_drop_repairing_unknown_from_rma_status.sql`：

```sql
-- 1. 先把所有 repairing / unknown 資料遷移到 received
UPDATE public.rma_requests
   SET status = 'received'::rma_status,
       updated_at = now()
 WHERE status::text IN ('repairing', 'unknown');

UPDATE public.rma_status_history
   SET status = 'received'::rma_status
 WHERE status::text IN ('repairing', 'unknown');

-- 2. 重建 enum（Postgres 不支援 DROP VALUE，必須重建型別）
ALTER TYPE public.rma_status RENAME TO rma_status_old;

CREATE TYPE public.rma_status AS ENUM (
  'registered',
  'shipped',
  'received',
  'inspecting',
  'contacting',
  'quote_confirmed',
  'paid',
  'no_repair',
  'shipped_back',
  'shipped_back_new',
  'shipped_back_refurbished',
  'shipped_back_original',
  'follow_up',
  'closed'
);

-- 3. 切換欄位型別
ALTER TABLE public.rma_requests
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN status TYPE public.rma_status USING status::text::public.rma_status,
  ALTER COLUMN status SET DEFAULT 'registered'::public.rma_status;

ALTER TABLE public.rma_status_history
  ALTER COLUMN status TYPE public.rma_status USING status::text::public.rma_status;

-- 4. 移除舊型別
DROP TYPE public.rma_status_old;
```

注意事項：
- 若有任何 view / function 依賴 `rma_status_old`，重建會失敗 — 需要先 drop 再重建。目前 `log_rma_status_change()` 觸發器只用欄位本身，不直接 reference 型別名稱，應安全。
- Migration 會在 Lovable migration 審核流程下執行，請 Brad 點選 Apply。

---

## Step 3：前端代碼同步

### 3.1 `src/pages/AdminDashboard.tsx`

兩處 `.in("status", [...])` 移除 `"repairing"`：

```ts
// Line ~30
.in("status", ["shipped", "received", "inspecting", "contacting", "quote_confirmed", "paid"])

// Line ~57
supabase.from("rma_requests").select("id").in("status", ["shipped", "received", "inspecting", "contacting", "quote_confirmed", "paid"]),
```

### 3.2 `src/lib/rmaStatusMap.ts`

- `RmaStatus` type 移除 `"repairing"` 和 `"unknown"`
- `RMA_STATUS_LABELS` 移除對應兩條
- `TAB_STATUS_BUCKETS.dashboardInProgress` 移除 `"repairing"`
- `KNOWN_GAPS` 移除「repairing / unknown 仍在 DB enum」那條提示

### 3.3 全專案掃描其它殘留引用

執行 `rg -n "'repairing'|\"repairing\"|'unknown'|\"unknown\"" src supabase/functions` 並逐一處理。預期可能命中的位置：
- `csvParser.ts`（已封鎖，僅 skip 邏輯，保留）
- 其他 logistics tab、status badge、AI prompt 等 — 視個別情況決定移除或加 fallback。

---

## Step 4：Verification

1. Migration apply 成功後，重跑 audit query 確認兩個 table 已無 `repairing`/`unknown`。
2. 進入 `/admin` 看 dashboard 「處理中」數字下降 47。
3. 進入「收件處理」分頁確認 47 筆出現（如果採選項 A）。
4. `npm run test:run` 確保現有 logistics 測試未壞。

---

## 需要 Brad 回覆才能進入實作的決策

1. **47 筆 `repairing` 遷移目標：A `received` / B `closed` / C 手動 mapping？**（預設 A）
2. 若選 C，請提供 CSV：`rma_number, target_status`。

回覆後我會切到 default mode 一次落地 migration + 前端 + 掃描殘留。
