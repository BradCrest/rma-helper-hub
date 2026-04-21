
### 計畫：修正「只跑一次、不會自動續跑」的背景索引

### 目前確認到的狀況
目前不是索引完全壞掉，而是「第一輪會跑，後續接手機制不可靠」。

從現況可看出：

- `email_embedding_jobs` 最新狀態是：
  - `status: idle`
  - `trigger_source: manual`
  - `last_processed_count: 60`
- `email_embeddings` 仍有大量待處理：
  - `completed: 5758`
  - `pending: 13429`
  - `failed: 1`
- `ai_settings` 顯示排程已啟用
- `cron.job` 也確實存在 `email-embedding-kickoff-every-minute`

這代表：
```text
手動喚醒
→ worker 確實有跑一輪（而且一次跑了 60 筆）
→ worker 結束後回到 idle
→ 但真正的後續自動接手沒有穩定發生
```

### 根本問題
目前架構有兩個弱點：

1. 背景續跑過度依賴每分鐘 cron  
   只要 cron 觸發沒有成功打到 function、或打到了但沒有留下明確可見紀錄，整個 queue 就會停在 idle。

2. UI 只看「排程已設定」，不是看「排程最近真的有執行」  
   所以畫面會讓人以為背景會自動接手，但其實只是設定存在，不代表真的有續跑。

另外，現在排程是用專案專屬 URL / key 建立的，這類資料不應只放在 migration 內當作永久真相來源，否則後續維護與驗證都不夠可靠。

---

### 這次會怎麼修

## 1. 把「續跑」從只靠 cron，改成「worker 自己接力 + cron 保底」
目前 manual kickoff 跑完一段就停。會改成：

```text
手動喚醒 / 上傳 / 編輯
→ kickoff
→ worker 處理一輪
→ 若 hasMore = true
→ 立即再安排下一輪背景接力
→ cron 每分鐘只做保底，不再是唯一續跑來源
```

實作方向：
- `generate-email-embeddings` 處理完若仍有 `hasMore`
- 不直接把「剩下的交給運氣」
- 而是由後端再安全喚醒下一輪
- 加入單次鏈式續跑上限與 stale protection，避免無限重入

這樣按一次「立即喚醒背景索引」後，系統就會持續往下吃 queue，不會只跑一輪。

---

## 2. 強化 `kickoff-email-embedding-job` 的狀態機
目前 `kickoff` 只負責：
- 看 job 有沒有 running
- 沒有就啟動一次 worker

會改成更完整的 dispatcher：

- 明確區分：
  - `manual`
  - `upload`
  - `update`
  - `cron`
  - `chain`
- 若 worker 回傳 `hasMore: true`
  - 將 job 標成「仍需續跑」
  - 交由後端立即鏈式再喚醒，而不是只顯示文案
- 若 job 已在跑
  - 正常略過，不重複啟動第二個 worker
- 若 heartbeat stale
  - 安全接管並恢復續跑

---

## 3. 補上「排程真的有沒有在跑」的健康資訊
目前畫面只知道：
- 排程設定有沒有存在

但真正需要的是：
- 最近一次 cron 何時觸發
- 最近一次 cron 是否成功喚醒 worker
- 現在是靠 manual 在跑，還是 cron 在保底

會新增/補強監控資訊，例如：
- `last_scheduler_ping_at`
- `last_scheduler_result`
- `last_trigger_source`
- `next_action_hint`

讓前端能顯示真正狀態，例如：

- 背景索引執行中
- 仍有待處理，系統正在自動接力
- 排程已啟用，但最近未成功接手
- 尚有待處理項目，需要重新喚醒

---

## 4. 修正 `EmailEmbeddingManager` 的文案與判斷邏輯
目前「待排程續跑」這句太樂觀。

會改成依據真實狀態顯示：
- 有 pending，且最近 scheduler/chain 有活動：`背景索引會持續自動處理`
- 有 pending，但長時間沒有任何 scheduler/chain heartbeat：`尚有待處理項目，自動續跑異常`
- 只有 manual 跑過一次、沒有後續：`已完成目前批次，但後續自動接手未生效`
- 全部完成：`所有知識來源已完成索引`

也會把：
- 最近手動啟動時間
- 最近排程接手時間
- 最近鏈式續跑時間
分開顯示，避免誤判。

---

## 5. 重做排程建立方式，避免把專案 key 寫死在 migration
目前排程 SQL 是把 function URL 與 bearer token 寫進 migration。這有兩個問題：

- 這是專案專屬值，不適合當通用 migration 長期保存
- 後續排程是否仍有效，不容易重新校正

會改成：
- 保留 schema migration 只做結構變更
- 專案專屬的 cron 綁定改成專案層級設定流程
- 同時把 scheduler metadata 與實際 cron job 對齊更新

這樣之後若要重建排程、更新 key、驗證 job 是否存在，都更穩定。

---

## 6. 補上可觀測性，方便之後直接看出卡在哪
會在背景流程中補更清楚的診斷紀錄：

- worker 啟動來源
- 每輪 processed / failed / remainingPending
- 是否還有 hasMore
- 是否成功安排下一輪接力
- scheduler 最近一次是否成功呼叫 kickoff

這樣下次若還有「只跑一次」問題，就能直接分辨是：
- cron 沒打到
- kickoff 沒接力
- worker 回傳 hasMore 但沒續跑
- queue 卡在 processing
- 外部 embedding API 造成中斷

---

### 會修改的內容
前端：
- `src/components/admin/EmailEmbeddingManager.tsx`
- `src/lib/email-embedding-job.ts`

後端函式：
- `supabase/functions/kickoff-email-embedding-job/index.ts`
- `supabase/functions/generate-email-embeddings/index.ts`

後端設定：
- 調整排程建立方式與 scheduler 狀態同步
- 補 scheduler/chain 的健康狀態寫入來源

必要時也會補一個小型狀態查詢入口，讓前端能看到「排程存在」以外的真實執行情況。

---

### 預期結果
完成後會變成：

```text
按一次「立即喚醒背景索引」
→ worker 跑第一輪
→ 若還有 pending
→ 後端自動接力下一輪
→ cron 每分鐘保底補位
→ 就算使用者離開頁面，仍會持續往下處理
```

UI 也會改成顯示真實狀態，而不是只有「看起來有排程」。

---

### 技術摘要
- 目前問題不是第一輪沒跑，而是「跑完後沒有可靠的第二輪接手者」
- 真正要補的是：
  - 後端鏈式續跑
  - cron 保底而非唯一依賴
  - scheduler 健康狀態可視化
  - 專案專屬 cron 綁定方式修正
- 這樣才能讓「立即喚醒背景索引」變成真正會持續處理 backlog 的入口
