
### 目前結論
「待排程續跑」目前幾乎沒有真正作用，原因不是 worker 壞掉，而是「排程」其實還沒綁上。

目前讀到的狀態是：

- `email_embedding_jobs` 最近一次是 `manual`
- 最後完成時間有更新，代表手動喚醒能跑
- `email_embeddings` 目前仍有大量待處理：
  - `pending: 13589`
  - `processing: 0`
  - `completed: 5598`
- `cron.job` 查詢結果是空的

這代表現在的實際行為是：

```text
手動按鈕 / 上傳 / 編輯
→ kickoff function
→ worker 跑一段
→ job 回到 idle
→ 因為沒有真正 cron 再喚醒
→ 剩下的 pending 就停著
```

所以 UI 上顯示的「待排程續跑」只是狀態文案，不是代表系統真的已經有背景排程在持續跑。

---

### 要修正的方向

#### 1. 補上真正的背景排程
建立真正的每分鐘排程，定時呼叫 `kickoff-email-embedding-job`。

排程邏輯會是：

```text
pg_cron
→ net.http_post(...)
→ kickoff-email-embedding-job
→ 若 job 沒在跑就啟動 worker
→ 若 job 已在跑就略過
```

這樣即使：
- 使用者關掉頁面
- 沒有人手動按按鈕
- 上一輪 worker 跑完後還有很多 pending

系統仍會在下一分鐘自動接手下一輪。

---

#### 2. 修正前端文案，避免誤導
目前 `EmailEmbeddingManager.tsx` 在以下條件就顯示「待排程續跑」：

- `pending > 0` 或 `processing > 0`
- 但 `job.status` 不是 `running`

這會讓人以為真的有 scheduler。

會改成更誠實的狀態判斷，例如：

- 有排程且待處理：`等待背景排程接手`
- 沒排程但有待處理：`尚有待處理項目，目前未啟用自動排程`
- 正在跑：`背景索引執行中`
- 全部完成：`所有知識來源已完成索引`

也會把是否已啟用排程顯示在卡片裡。

---

#### 3. 加入排程存在檢查
在 `src/lib/email-embedding-job.ts` 與監控 UI 補一個「排程是否存在」的狀態來源。

做法可選其一：

- 由後端新增一個簡單狀態查詢 function 回傳 scheduler 狀態
- 或把 scheduler 狀態寫入 `email_embedding_jobs` / `ai_settings`
- 或在建立排程後固定寫入 `email_embedding_jobs.trigger_source` 的系統欄位外加顯示最近 cron 啟動時間

目標是讓 UI 不只知道 job 狀態，也知道：
- 背景排程是否已配置
- 最近一次 cron 是否真的有喚醒成功

---

#### 4. 保留現有手動/上傳喚醒
目前以下入口仍然有價值，會保留：

- 上傳檔案後自動 kickoff
- 新增/編輯知識來源後自動 kickoff
- 手動按「立即喚醒背景索引」

它們會和 cron 並存：

```text
即時事件先喚醒
+
cron 每分鐘保底續跑
```

這樣新資料不必等太久，而大 backlog 也能自動慢慢消化。

---

#### 5. 驗證流程
完成後會確認這幾件事：

1. `cron.job` 裡真的出現排程
2. 不開頁面時，`last_started_at / last_heartbeat_at / last_finished_at` 仍會持續更新
3. `pending` 會隨時間下降
4. UI 顯示不再誤導
5. 若 job 已在跑，cron 不會重複啟動第二個 worker

---

### 會修改的內容
- `src/components/admin/EmailEmbeddingManager.tsx`
- `src/lib/email-embedding-job.ts`
- 可能補一個狀態查詢用的 backend function 或共用狀態欄位
- 後端排程設定：建立真正的 cron 呼叫 `kickoff-email-embedding-job`

---

### 技術細節
- 目前不是 worker 沒作用，而是缺少「下一輪誰來喚醒它」
- `generate-email-embeddings` 本身已具備批次與續跑基礎，但目前續跑依賴外部再次觸發
- 真正缺的是 scheduler，不是 embedding 邏輯
- `pg_cron` 與 `pg_net` 已安裝，但尚未建立 `cron.schedule(...)`
- 因為排程建立屬於專案特定 URL / key 設定，不應只停留在 migration；要實際建立 job

---

### 預期結果
完成後流程會變成：

```text
上傳 / 編輯 / 手動喚醒
→ kickoff 一次

若還有 pending
→ cron 每分鐘自動再喚醒一次
→ worker 持續分批處理
→ 直到 pending 清空

前端只顯示真實狀態
```
