## 目標

為 RMA 回覆附件加上完整的管理機制：手動刪除、刪除 RMA 時連帶清理、定期自動清理。

---

## 方案 A — 手動刪除附件

**`src/components/logistics/RmaReplyTab.tsx`** 在「回覆紀錄」列出附件的地方，每個附件右側加一個 🗑️ 按鈕：

1. 點擊 → AlertDialog 確認「確定要刪除附件 {name}？此動作無法復原」
2. 確認後：
   - `supabase.storage.from("rma-attachments").remove([attachment.path])`
   - 用 `UPDATE rma_thread_messages SET attachments = ?` 把該檔案從 jsonb 陣列中移除（在 client 端先讀取、過濾再 update，因為這是回覆者自己的訊息，admin RLS 允許）
3. 成功後重新載入 thread

**權限**：admin only（已由 RLS 保證）。

---

## 方案 B — 刪除 RMA 時連帶清理

**`src/pages/AdminRmaList.tsx`** 在 `handleDelete` 流程中，於刪 `rma_requests` 之前新增兩步：

1. **刪附件檔案**：列出 `rma-attachments` bucket 裡 `rma-replies/{rmaId}/` 資料夾的所有物件，呼叫 `storage.remove()` 一次刪除全部。
   ```ts
   const { data: files } = await supabase.storage
     .from("rma-attachments")
     .list(`rma-replies/${rmaToDelete.id}`);
   if (files?.length) {
     await supabase.storage
       .from("rma-attachments")
       .remove(files.map(f => `rma-replies/${rmaToDelete.id}/${f.name}`));
   }
   ```
2. **刪 thread messages**：
   ```ts
   await supabase.from("rma_thread_messages").delete().eq("rma_request_id", rmaToDelete.id);
   ```
   （目前刪除流程有遺漏這個表，順便修掉）

兩步失敗都不阻擋整體刪除（toast warning 即可），確保 RMA 主體一定被刪掉。

---

## 方案 C — 定期自動清理

### C-1 新表：`rma_attachment_cleanup_logs`（migration）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | uuid PK | |
| `cleanup_run_at` | timestamptz | 執行時間 |
| `trigger_source` | text | `'cron'` 或 `'manual'` |
| `files_deleted` | int | 數量 |
| `bytes_freed` | bigint | 釋出空間 |
| `details` | jsonb | 刪除明細 (path, rma_id, age_days) |
| `error` | text | 失敗訊息（若有）|

RLS：admin SELECT、service_role INSERT。

### C-2 新 edge function：`cleanup-rma-attachments`

執行邏輯：
1. 讀取 `rma_thread_messages`（有 `attachments` 且非空）
2. 對每個 attachment 計算年齡（用 `created_at` 或附件自身的 uploaded_at）
3. **刪除規則（待您確認，預設用 (iii)）**：
   - **(iii) 該 RMA `status = 'completed'` 且結案滿 90 天 → 刪除附件**
   - 其他選項：(i) 上傳滿 90 天、(ii) 上傳滿 180 天
4. 呼叫 `storage.remove()` 批次刪除
5. 把該訊息的 `attachments` jsonb 中對應項目移除（保留訊息本文與檔名供記錄查詢）
6. 寫入 `rma_attachment_cleanup_logs`

`verify_jwt = false`（cron 呼叫），但用 `service_role` key 操作，並可加一個簡單的 secret token 比對防誤觸。

### C-3 排程（用 `supabase--read_query` 旁路、實際用 insert SQL 工具執行 — 內含 anon key 不寫進 migration）

```sql
SELECT cron.schedule(
  'cleanup-rma-attachments-weekly',
  '0 3 * * 0',  -- 每週日 03:00 UTC
  $$
  SELECT net.http_post(
    url := 'https://xrbvyfoewbwywrwocrpf.supabase.co/functions/v1/cleanup-rma-attachments',
    headers := '{"Content-Type":"application/json","apikey":"<anon>"}'::jsonb,
    body := '{"trigger":"cron"}'::jsonb
  );
  $$
);
```

需先確認 `pg_cron` 與 `pg_net` 已啟用，未啟用會於 migration 中啟用。

### C-4 管理 UI（最小）

在 `AdminSettings` 或 admin 設定頁加一個小區塊「附件清理」：
- 顯示最近 5 筆 cleanup log（時間、刪幾個、釋出多少 MB）
- 一個「立即執行清理」按鈕（呼叫 edge function 並帶 `trigger=manual`）

---

## 待您確認的 1 個問題

**自動清理的觸發規則** — 我預設使用 **(iii) RMA 已 completed 且結案滿 90 天**（最安全，未結案的附件不會被誤刪）。

如果您要改成：
- (i) 上傳滿 90 天一律刪
- (ii) 上傳滿 180 天一律刪
- 或其他天數

請在批准 plan 時一併告知，否則我就照 (iii) 90 天 completed 實作。

---

## 影響檔案

- `src/components/logistics/RmaReplyTab.tsx`（A：附件刪除按鈕）
- `src/pages/AdminRmaList.tsx`（B：刪 RMA 時清附件 + thread messages）
- `supabase/migrations/...sql`（C-1：新表、啟用 pg_cron/pg_net）
- `supabase/functions/cleanup-rma-attachments/index.ts`（C-2：新 edge function）
- 用 SQL insert 工具排 cron job（C-3）
- `src/pages/AdminSettings.tsx` 或類似頁面（C-4：清理 log 顯示 + 立即執行按鈕）
